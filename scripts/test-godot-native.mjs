import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync, execFileSync} from 'node:child_process';
import {root, git, sha256, listFiles, writeJSON} from './reference-utils.mjs';
import {nativeEnvironment} from './native-tools.mjs';

assert.equal(process.platform, 'win32', 'Only the Windows x64 Godot proof is configured');
assert.equal(process.arch, 'x64');
const args = process.argv.slice(2), options = {};
assert.equal(args.length, 6, '--tools JSON --library-proof DIRECTORY --session-proof DIRECTORY');
for (let i = 0; i < args.length; i += 2) {
  assert(['--tools', '--library-proof', '--session-proof'].includes(args[i]));
  assert(!Object.hasOwn(options, args[i])); options[args[i]] = fs.realpathSync(args[i + 1]);
}
const read = file => JSON.parse(fs.readFileSync(file)), hash = file => sha256(fs.readFileSync(file));
const source = path.join(root, 'experiments/godot-native'), lock = read(path.join(source, 'toolchain-lock.json'));
const tools = read(options['--tools']);
for (const key of ['editor', 'bindings', 'cmake', 'ninja', 'python', 'exportRelease', 'exportDebug']) {
  assert.equal(typeof tools[key], 'string'); tools[key] = fs.realpathSync(tools[key]);
}
assert.equal(hash(tools.editor), lock.editor.executableSha256);
assert.equal(hash(tools.exportRelease), lock.templateFiles['windows_release_x86_64.exe']);
assert.equal(hash(tools.exportDebug), lock.templateFiles['windows_debug_x86_64.exe']);
function verifyBindings() {
  for (const [file, expected] of Object.entries(lock.bindings.files)) assert.equal(hash(path.join(tools.bindings, file)), expected, file);
  const actual = listFiles(tools.bindings).filter(file => !(file.split('/').includes('__pycache__') && file.endsWith('.pyc')));
  assert.deepEqual(actual.sort(), Object.keys(lock.bindings.files).sort(), 'No unpinned binding sources');
}
verifyBindings();
const libraryDirectory = options['--library-proof'], fixture = options['--session-proof'];
const libraryProof = read(path.join(libraryDirectory, 'verification.json')), sessionProof = read(path.join(fixture, 'verification.json'));
for (const [directory, proof] of [[libraryDirectory, libraryProof], [fixture, sessionProof]]) {
  assert(proof.passed && proof.inputsUnchanged && proof.status === 'completed');
  for (const [file, expected] of Object.entries(proof.sourceHashes)) assert.equal(hash(path.join(root, file)), expected, file);
  for (const [file, expected] of Object.entries(proof.raw)) assert.equal(hash(path.join(directory, file)), expected, file);
}
assert.equal(libraryProof.fixtureReceiptSha256, hash(path.join(fixture, 'verification.json')));
assert.equal(libraryProof.platform, 'win32'); assert.equal(libraryProof.arch, 'x64');
const library = path.join(libraryDirectory, 'hwe_embedded.dll'); assert.equal(hash(library), libraryProof.librarySha256);
assert.equal(hash(path.join(fixture, 'bundle.js')), sessionProof.bundleSha256);
assert.equal(hash(path.join(fixture, 'input.json')), sessionProof.inputSha256);
const runtime = () => Object.fromEntries(listFiles(path.join(root, 'dist')).map(file => [file, hash(path.join(root, 'dist', file))]));
const before = runtime(); assert.equal(sha256(JSON.stringify(before)), sessionProof.runtimeMapSha256);
const sourceFiles = [...listFiles(source).map(file => 'experiments/godot-native/' + file), 'scripts/test-godot-native.mjs',
  'scripts/prepare-godot-tools.mjs', 'scripts/native-tools.mjs', 'scripts/reference-utils.mjs', 'LICENSE.md', 'NOTICE.md', 'experiments/embedded-js/native/hwe_embedded.h'];
const sources = Object.fromEntries(sourceFiles.map(file => [file, hash(path.join(root, file))]));
const directory = fs.mkdtempSync(path.join(root, '.artifacts/godot-native-'));
const receipt = path.join(directory, 'verification.json');
writeJSON(path.join(root, '.artifacts/godot-native-latest.json'), {directory, receipt});
const report = {schemaVersion: 1, passed: false, status: 'started', commit: git(root, ['rev-parse', 'HEAD']).trim(),
  platform: process.platform, arch: process.arch, node: process.version, sources, tools, commands: [],
  libraryProofSha256: hash(path.join(libraryDirectory, 'verification.json')), sessionProofSha256: hash(path.join(fixture, 'verification.json')),
  runtimeMapSha256: sessionProof.runtimeMapSha256, runtimeOutputs: Object.keys(before).length,
  scope: 'Experimental Windows x64 Godot 4.7.2 native addon, editor replay and standalone release export. Selected embedded-session capability only; no stable API, device performance or other-platform claim.'};
const env = nativeEnvironment(directory);
// Code generation must not execute a pre-existing bytecode cache beside the
// pinned Python sources. This fresh prefix isolates both cache reads and writes.
env.PYTHONPYCACHEPREFIX = path.join(directory, 'python-cache');
report.pythonCachesIsolated = true;
function run(label, command, argv, engine = false, cwd = directory) {
  const output = path.join(directory, label + '.txt'), fd = fs.openSync(output, 'wx');
  report.commands.push({label, command, args: argv, cwd}); let result;
  try { result = spawnSync(command, argv, {cwd, env, windowsHide: true, stdio: ['ignore', fd, fd], timeout: 300000}); }
  finally { fs.closeSync(fd); }
  assert(!result.error, result.error?.message); assert.equal(result.signal, null, label); assert.equal(result.status, 0, label);
  const text = fs.readFileSync(output, 'utf8');
  if (engine) assert(!/ERROR:|SCRIPT ERROR|WARNING:.*(?:leak|ObjectDB)/i.test(text), label + ': engine diagnostics');
  return text;
}
const jsonLines = file => fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
const expected = jsonLines(path.join(fixture, 'node-original.jsonl'));
function verifyReplay(label, command, argv, exported, cwd) {
  const output = path.join(directory, label + '.jsonl');
  const text = run(label, command, [...argv, '--headless', '--log-file', path.join(directory, label + '-engine.log'), '--', output], true, cwd);
  const stats = text.split(/\r?\n/).filter(line => line.startsWith('{')).map(JSON.parse).at(-1);
  assert(stats?.passed && stats.thread_checks && stats.packaged_inputs);
  assert.equal(stats.requests, 60); assert.equal(stats.checks, 98);
  assert.equal(stats.editor_build, !exported);
  assert.equal(stats.live_bytes_after_dispose, 0); assert.equal(stats.live_blocks_after_dispose, 0);
  assert.deepEqual(jsonLines(output), expected, label + ': all observable gameplay responses');
  return {...stats, observationsSha256: hash(output)};
}
try {
  // Copy the pinned editor to isolate editor settings from every existing install.
  const editorDirectory = path.join(directory, 'editor'); fs.mkdirSync(editorDirectory);
  const editor = path.join(editorDirectory, 'godot.exe'); fs.copyFileSync(tools.editor, editor, fs.constants.COPYFILE_EXCL);
  fs.writeFileSync(path.join(editorDirectory, '_sc_'), '', {flag: 'wx'});
  const version = run('editor-version', editor, ['--headless', '--version']).trim(); assert.equal(version, lock.godotVersionOutput);
  const staging = path.join(directory, 'staging'), addon = path.join(staging, 'addons/hollow_wake'), bin = path.join(addon, 'bin');
  fs.mkdirSync(bin, {recursive: true});
  // Rebuild a pure import library from the verified export list. The old build's
  // unrecorded .lib file is never accepted as compiler input.
  const names = ['cancel', 'copy_response', 'create', 'destroy', 'layout', 'metrics', 'release_response', 'submit'].map(name => 'hwe_js_' + name + '_v1');
  assert.deepEqual(libraryProof.exportedFunctions, names);
  const definition = path.join(directory, 'hwe_embedded.def'), importLibrary = path.join(directory, 'hwe_embedded.lib');
  fs.writeFileSync(definition, 'LIBRARY hwe_embedded.dll\nEXPORTS\n' + names.join('\n') + '\n', {flag: 'wx'});
  run('import-library', 'lib.exe', ['/nologo', '/machine:x64', '/def:' + definition, '/out:' + importLibrary]);
  run('configure', tools.cmake, ['-S', source, '-B', path.join(directory, 'build'), '-G', 'Ninja', '-DCMAKE_BUILD_TYPE=Release',
    '-DCMAKE_MAKE_PROGRAM=' + tools.ninja, '-DPython3_EXECUTABLE=' + tools.python, '-DGODOT_CPP_SOURCE=' + tools.bindings,
    '-DHWE_NATIVE_LIBRARY=' + library, '-DHWE_NATIVE_IMPORT_LIBRARY=' + importLibrary, '-DHWE_OUTPUT=' + bin]);
  run('build', tools.cmake, ['--build', path.join(directory, 'build'), '--parallel', '4']);
  fs.copyFileSync(library, path.join(bin, 'hwe_embedded.dll'), fs.constants.COPYFILE_EXCL);
  // Build metadata stays outside the installable addon.
  for (const file of fs.readdirSync(bin)) if (!file.endsWith('.dll')) fs.renameSync(path.join(bin, file), path.join(directory, file));
  const copy = (from, to) => {fs.mkdirSync(path.dirname(to), {recursive: true}); fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);};
  copy(path.join(source, 'hollow_wake.gdextension'), path.join(addon, 'hollow_wake.gdextension'));
  copy(path.join(fixture, 'bundle.js'), path.join(addon, 'data/bundle.txt'));
  copy(path.join(fixture, 'input.json'), path.join(addon, 'data/content.json'));
  const example = fs.readFileSync(path.join(fixture, 'requests.jsonl'), 'utf8').trim().split(/\r?\n/)[0];
  assert.equal(JSON.parse(example).op, 'create');
  fs.writeFileSync(path.join(addon, 'data/example-create.json'), example + '\n', {flag: 'wx'});
  copy(path.join(source, 'README.md'), path.join(addon, 'README.md'));
  for (const [from, name] of [['LICENSE.md', 'Hollow-Wake-LICENSE.md'], ['NOTICE.md', 'Hollow-Wake-NOTICE.md'],
    ['experiments/godot-native/notices/godot-cpp-LICENSE.md', 'godot-cpp-LICENSE.md'],
    ['experiments/godot-native/notices/quickjs-source-notices.txt', 'quickjs-source-notices.txt']]) copy(path.join(root, from), path.join(addon, 'notices', name));
  const addonFiles = Object.fromEntries(listFiles(addon).map(file => [file, hash(path.join(addon, file))]));
  writeJSON(path.join(addon, 'manifest.json'), {schemaVersion: 1, experimental: true, capability: 'embedded-session/experiment-v1',
    godotVersion: lock.godotVersionOutput, platforms: ['windows.x86_64'], nativeAbi: 65536, sources, files: addonFiles});
  const archive = path.join(directory, 'hollow-wake-godot-experimental.zip'), project = path.join(directory, 'installed-project'); fs.mkdirSync(project);
  const packaging = `import pathlib,sys,zipfile
source=pathlib.Path(sys.argv[1]).resolve(); target=pathlib.Path(sys.argv[3]).resolve()
with zipfile.ZipFile(sys.argv[2], 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
    for file in sorted(source.rglob('*')):
        if file.is_file(): output.write(file,file.relative_to(source).as_posix())
with zipfile.ZipFile(sys.argv[2]) as archive:
    for member in archive.infolist():
        name=pathlib.PurePosixPath(member.filename)
        assert not name.is_absolute() and '..' not in name.parts and name.parts[:2]==('addons','hollow_wake')
        output=target.joinpath(*name.parts); assert output.is_relative_to(target)
        output.parent.mkdir(parents=True,exist_ok=True)
        with output.open('xb') as file: file.write(archive.read(member))
`;
  const packagingFile = path.join(directory, 'install.py'); fs.writeFileSync(packagingFile, packaging, {flag: 'wx'});
  run('install-addon', tools.python, [packagingFile, staging, archive, project]);
  for (const [file, expectedHash] of Object.entries(addonFiles)) assert.equal(hash(path.join(project, 'addons/hollow_wake', file)), expectedHash);
  for (const file of ['project.godot', 'main.tscn', 'replay.gd']) copy(path.join(source, file), path.join(project, file));
  copy(path.join(fixture, 'requests.jsonl'), path.join(project, 'fixtures/requests.jsonl'));
  run('import', editor, ['--headless', '--editor', '--path', project, '--quit', '--log-file', path.join(directory, 'import-engine.log')], true);
  report.editor = verifyReplay('editor-replay', editor, ['--path', project], false);
  const exported = path.join(directory, 'exported'); fs.mkdirSync(exported);
  const preset = '[preset.0]\nname="Windows Desktop"\nplatform="Windows Desktop"\nrunnable=true\nexport_filter="all_resources"\ninclude_filter="*.txt,*.json,*.jsonl,*.md"\nexclude_filter=""\n\n[preset.0.options]\ncustom_template/debug=' + JSON.stringify(tools.exportDebug.replaceAll('\\', '/')) + '\ncustom_template/release=' + JSON.stringify(tools.exportRelease.replaceAll('\\', '/')) + '\nbinary_format/architecture="x86_64"\nbinary_format/embed_pck=false\napplication/modify_resources=false\ncodesign/enable=false\n';
  fs.writeFileSync(path.join(project, 'export_presets.cfg'), preset, {flag: 'wx'});
  const executable = path.join(exported, 'hollow-wake-proof.exe');
  run('export-release', editor, ['--headless', '--path', project, '--export-release', 'Windows Desktop', executable, '--log-file', path.join(directory, 'export-engine.log')], true);
  const relocated = path.join(directory, 'relocated-game'); fs.cpSync(exported, relocated, {recursive: true, force: false, errorOnExist: true});
  // Make original project/export paths unavailable during the relocated run.
  // Both rename endpoints are checked before moving these private test trees.
  const moved = [];
  try {
    for (const from of [project, exported]) {
      const to = from + '-unavailable';
      for (const target of [from, to]) assert.equal(path.dirname(path.resolve(target)), fs.realpathSync(directory));
      assert(!fs.existsSync(to)); fs.renameSync(from, to); moved.push([from, to]);
    }
    report.release = verifyReplay('release-replay', path.join(relocated, 'hollow-wake-proof.exe'), [], true, relocated);
    report.sourceProjectUnavailableDuringRelease = true;
  } finally {for (const [from, to] of moved.reverse()) {assert(!fs.existsSync(from)); fs.renameSync(to, from);}}
  report.addon = {archiveSha256: hash(archive), archiveBytes: fs.statSync(archive).size, files: addonFiles};
  report.exportedFiles = Object.fromEntries(listFiles(relocated).map(file => [file, hash(path.join(relocated, file))]));
  report.productionRuntimeChanged = false; report.deviceSupportEstablished = false; report.passed = true; report.status = 'completed';
} catch (error) {report.status = 'failed'; report.error = error.message; throw error;}
finally {
  for (const [file, expectedHash] of Object.entries(sources)) assert.equal(hash(path.join(root, file)), expectedHash, file);
  assert.deepEqual(runtime(), before); verifyBindings(); assert.equal(hash(library), libraryProof.librarySha256);
  for (const [inputDirectory, proof, receiptHash] of [[libraryDirectory, libraryProof, report.libraryProofSha256], [fixture, sessionProof, report.sessionProofSha256]]) {
    assert.equal(hash(path.join(inputDirectory, 'verification.json')), receiptHash);
    for (const [file, expectedHash] of Object.entries(proof.raw)) assert.equal(hash(path.join(inputDirectory, file)), expectedHash, file);
    for (const [file, expectedHash] of Object.entries(proof.sourceHashes)) assert.equal(hash(path.join(root, file)), expectedHash, file);
  }
  assert.equal(hash(path.join(fixture, 'bundle.js')), sessionProof.bundleSha256);
  assert.equal(hash(path.join(fixture, 'input.json')), sessionProof.inputSha256);
  report.inputsUnchanged = true; report.raw = Object.fromEntries(fs.readdirSync(directory).filter(file => /\.(txt|log|jsonl)$/.test(file)).map(file => [file, hash(path.join(directory, file))]));
  writeJSON(receipt, report); console.log({directory, passed: report.passed, status: report.status, editor: report.editor, release: report.release});
}
