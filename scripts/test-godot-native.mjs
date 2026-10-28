import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync, execFileSync} from 'node:child_process';
import {root, git, sha256, listFiles, writeJSON} from './reference-utils.mjs';
import {nativeEnvironment} from './native-tools.mjs';

assert(['win32', 'linux'].includes(process.platform), 'Only Windows and Linux Godot proofs are configured');
assert.equal(process.arch, 'x64');
const windows = process.platform === 'win32';
const platform = windows ? {library: 'hwe_embedded.dll', bridge: 'hwe_godot.dll', tag: 'windows.x86_64', export: 'Windows Desktop', executable: 'hollow-wake-proof.exe'}
  : {library: 'libhwe_embedded.so', bridge: 'libhwe_godot.so', tag: 'linux.x86_64', export: 'Linux', executable: 'hollow-wake-proof.x86_64'};
const args = process.argv.slice(2), options = {};
assert.equal(args.length, 6, '--tools JSON --library-proof DIRECTORY --session-proof DIRECTORY');
for (let i = 0; i < args.length; i += 2) {
  assert(['--tools', '--library-proof', '--session-proof'].includes(args[i]));
  assert(!Object.hasOwn(options, args[i])); options[args[i]] = fs.realpathSync(args[i + 1]);
}
const read = file => JSON.parse(fs.readFileSync(file)), hash = file => sha256(fs.readFileSync(file));
const source = path.join(root, 'experiments/godot-native'), lock = read(path.join(source, 'toolchain-lock.json'));
assert.equal(lock.schemaVersion, 2);
const target = lock.platforms[process.platform];
const tools = read(options['--tools']);
if (tools.platform) assert.equal(tools.platform, process.platform);
for (const key of ['editor', 'bindings', 'cmake', 'ninja', 'python', 'exportRelease', 'exportDebug']) {
  assert.equal(typeof tools[key], 'string'); tools[key] = fs.realpathSync(tools[key]);
}
assert.equal(hash(tools.editor), target.editor.executableSha256);
assert.equal(hash(tools.exportRelease), target.templates.files[target.templates.release]);
assert.equal(hash(tools.exportDebug), target.templates.files[target.templates.debug]);
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
assert.equal(libraryProof.platform, process.platform); assert.equal(libraryProof.arch, 'x64');
const library = path.join(libraryDirectory, platform.library); assert.equal(hash(library), libraryProof.librarySha256);
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
  scope: `Experimental ${process.platform} x64 Godot 4.7.2 native addon, editor replay and standalone release export. Selected embedded-session capability only; no stable API, device performance or other-platform claim.`};
const env = {...nativeEnvironment(directory)};
// A library search override must not make a broken relocated package pass.
if (!windows) for (const key of ['LD_LIBRARY_PATH', 'LD_PRELOAD', 'LD_AUDIT', 'LD_DEBUG', 'LD_DEBUG_OUTPUT']) delete env[key];
// Code generation must not execute a pre-existing bytecode cache beside the
// pinned Python sources. This fresh prefix isolates both cache reads and writes.
env.PYTHONPYCACHEPREFIX = path.join(directory, 'python-cache');
report.pythonCachesIsolated = true;
function run(label, command, argv, engine = false, cwd = directory, extraEnv = {}) {
  const output = path.join(directory, label + '.txt'), fd = fs.openSync(output, 'wx');
  const record = {label, command, args: argv, cwd, extraEnv}; report.commands.push(record); let result;
  try { result = spawnSync(command, argv, {cwd, env: {...env, ...extraEnv}, windowsHide: true, stdio: ['ignore', fd, fd], timeout: 300000}); }
  finally { fs.closeSync(fd); }
  Object.assign(record, {pid: result.pid, exitCode: result.status, signal: result.signal});
  // Preserve loader diagnostics even when execution or the engine gate fails.
  if (extraEnv.LD_DEBUG_OUTPUT && result.pid) {
    const trace = extraEnv.LD_DEBUG_OUTPUT + '.' + result.pid;
    if (fs.existsSync(trace)) {
      record.loaderTrace = extraEnv.LD_DEBUG_OUTPUT + '.log';
      assert(!fs.existsSync(record.loaderTrace)); fs.renameSync(trace, record.loaderTrace);
    }
  }
  assert(!result.error, result.error?.message); assert.equal(result.signal, null, label); assert.equal(result.status, 0, label);
  const text = fs.readFileSync(output, 'utf8');
  if (engine) assert(!/ERROR:|SCRIPT ERROR|WARNING:.*(?:leak|ObjectDB)/i.test(text), label + ': engine diagnostics');
  return text;
}
const jsonLines = file => fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
const expected = jsonLines(path.join(fixture, 'node-original.jsonl'));
function verifyReplay(label, command, argv, exported, cwd, expectedLibraryPaths) {
  const output = path.join(directory, label + '.jsonl');
  const loaderPrefix = path.join(directory, label + '-loader');
  const text = run(label, command, [...argv, '--headless', '--log-file', path.join(directory, label + '-engine.log'), '--', output], true, cwd,
    windows ? {} : {LD_DEBUG: 'libs', LD_DEBUG_OUTPUT: loaderPrefix});
  const stats = text.split(/\r?\n/).filter(line => line.startsWith('{')).map(JSON.parse).at(-1);
  assert(stats?.passed && stats.thread_checks && stats.packaged_inputs);
  assert.equal(stats.requests, 60); assert.equal(stats.checks, 98);
  assert.equal(stats.editor_build, !exported);
  assert.equal(stats.live_bytes_after_dispose, 0); assert.equal(stats.live_blocks_after_dispose, 0);
  assert.deepEqual(jsonLines(output), expected, label + ': all observable gameplay responses');
  const result = {...stats, observationsSha256: hash(output)};
  if (!windows) {
    // glibc traces include failed optional dlsym probes even after successful
    // execution. Keep them separate from the unchanged Godot diagnostic gate.
    // LD_DEBUG_OUTPUT appends the actual child PID; require that exact trace.
    const traceLog = loaderPrefix + '.log';
    assert.equal(report.commands.at(-1).loaderTrace, traceLog, 'Trace from the actual replay process is required');
    const loaded = [...fs.readFileSync(traceLog, 'utf8').matchAll(/calling init:\s+([^\r\n]+)/g)].map(match => match[1].trim())
      .filter(file => [platform.library, platform.bridge].includes(path.basename(file))).map(file => fs.realpathSync(file)).sort();
    assert.deepEqual(loaded, expectedLibraryPaths.map(file => fs.realpathSync(file)).sort(), label + ': loaded package libraries');
    result.loadedLibraries = loaded;
  }
  return result;
}
const moved = [];
function makeUnavailable(from) {
  const to = from + '-unavailable';
  for (const target of [from, to]) assert.equal(path.dirname(path.resolve(target)), fs.realpathSync(directory));
  assert(!fs.existsSync(to)); fs.renameSync(from, to); moved.push([from, to]);
}
try {
  // Copy the pinned editor to isolate editor settings from every existing install.
  const editorDirectory = path.join(directory, 'editor'); fs.mkdirSync(editorDirectory);
  const editor = path.join(editorDirectory, windows ? 'godot.exe' : 'godot'); fs.copyFileSync(tools.editor, editor, fs.constants.COPYFILE_EXCL);
  if (!windows) fs.chmodSync(editor, 0o755);
  fs.writeFileSync(path.join(editorDirectory, '_sc_'), '', {flag: 'wx'});
  const version = run('editor-version', editor, ['--headless', '--version']).trim(); assert.equal(version, lock.godotVersionOutput);
  const staging = path.join(directory, 'staging'), addon = path.join(staging, 'addons/hollow_wake'), bin = path.join(addon, 'bin');
  fs.mkdirSync(bin, {recursive: true});
  // Compile against a private, verified copy so the original proof directory is
  // never a linker input and can remain untouched during relocation checks.
  const nativeInput = path.join(directory, 'native-input'); fs.mkdirSync(nativeInput);
  const nativeLibrary = path.join(nativeInput, platform.library); fs.copyFileSync(library, nativeLibrary, fs.constants.COPYFILE_EXCL);
  assert.equal(hash(nativeLibrary), libraryProof.librarySha256);
  // Rebuild a pure import library from the verified export list. The old build's
  // unrecorded .lib file is never accepted as compiler input.
  const names = ['cancel', 'copy_response', 'create', 'destroy', 'layout', 'metrics', 'release_response', 'submit'].map(name => 'hwe_js_' + name + '_v1');
  assert.deepEqual(libraryProof.exportedFunctions, names);
  const definition = path.join(directory, 'hwe_embedded.def'), importLibrary = path.join(directory, 'hwe_embedded.lib');
  if (windows) {
    fs.writeFileSync(definition, 'LIBRARY hwe_embedded.dll\nEXPORTS\n' + names.join('\n') + '\n', {flag: 'wx'});
    run('import-library', 'lib.exe', ['/nologo', '/machine:x64', '/def:' + definition, '/out:' + importLibrary]);
  } else {
    const dynamic = run('native-library-elf', 'readelf', ['--dynamic', '--wide', nativeLibrary]);
    assert(!/\(SONAME\)/.test(dynamic), 'Update the imported-target contract if the embedded library gains a SONAME');
  }
  run('configure', tools.cmake, ['-S', source, '-B', path.join(directory, 'build'), '-G', 'Ninja', '-DCMAKE_BUILD_TYPE=Release',
    '-DCMAKE_MAKE_PROGRAM=' + tools.ninja, '-DPython3_EXECUTABLE=' + tools.python, '-DGODOT_CPP_SOURCE=' + tools.bindings,
    '-DHWE_NATIVE_LIBRARY=' + nativeLibrary, ...(windows ? ['-DHWE_NATIVE_IMPORT_LIBRARY=' + importLibrary] : []), '-DHWE_OUTPUT=' + bin]);
  run('build', tools.cmake, ['--build', path.join(directory, 'build'), '--parallel', '4']);
  fs.copyFileSync(nativeLibrary, path.join(bin, platform.library), fs.constants.COPYFILE_EXCL);
  // Build metadata stays outside the installable addon.
  for (const file of fs.readdirSync(bin)) if (![platform.library, platform.bridge].includes(file)) fs.renameSync(path.join(bin, file), path.join(directory, file));
  if (!windows) {
    const dynamic = run('bridge-elf', 'readelf', ['--dynamic', '--wide', path.join(bin, platform.bridge)]);
    const needed = [...dynamic.matchAll(/\(NEEDED\).*?\[([^\]]+)\]/g)].map(match => match[1]);
    const search = [...dynamic.matchAll(/\((?:RUNPATH|RPATH)\).*?\[([^\]]+)\]/g)].map(match => match[1]);
    assert(needed.includes(platform.library)); assert(needed.every(name => !/[\\/]/.test(name)));
    assert.deepEqual(search, ['$ORIGIN'], 'Only adjacent package libraries may supply the runtime search path');
    run('bridge-symbol-versions', 'readelf', ['--version-info', '--wide', path.join(bin, platform.bridge)]);
    report.elf = {needed, search, loaderEnvironmentOverridesRemoved: true};
  }
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
    godotVersion: lock.godotVersionOutput, platforms: [platform.tag], nativeAbi: 65536, sources, files: addonFiles});
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
  for (const from of [nativeInput, path.join(directory, 'build'), staging]) makeUnavailable(from);
  // --quit exits after one iteration, not after import completion. The pinned
  // editor also has a cold-import documentation shutdown race (Godot #111048).
  // Use its import lifecycle plus the documented frame-delay workaround. This
  // is build-tool pacing only; every crash remains fatal and there are no retries.
  run('import', editor, ['--headless', '--import', '--path', project, '--frame-delay', '1000', '--log-file', path.join(directory, 'import-engine.log')], true);
  report.importLifecycle = {waitsForResources: true, frameDelayMs: 1000, retries: 0,
    upstreamWorkaround: 'https://github.com/godotengine/godot/issues/111048'};
  report.editor = verifyReplay('editor-replay', editor, ['--path', project], false, directory,
    [platform.library, platform.bridge].map(name => path.join(project, 'addons/hollow_wake/bin', name)));
  const exported = path.join(directory, 'exported'); fs.mkdirSync(exported);
  const preset = '[preset.0]\nname=' + JSON.stringify(platform.export) + '\nplatform=' + JSON.stringify(platform.export) + '\nrunnable=true\nexport_filter="all_resources"\ninclude_filter="*.txt,*.json,*.jsonl,*.md"\nexclude_filter=""\n\n[preset.0.options]\ncustom_template/debug=' + JSON.stringify(tools.exportDebug.replaceAll('\\', '/')) + '\ncustom_template/release=' + JSON.stringify(tools.exportRelease.replaceAll('\\', '/')) + '\nbinary_format/architecture="x86_64"\nbinary_format/embed_pck=false\n' + (windows ? 'application/modify_resources=false\ncodesign/enable=false\n' : '');
  fs.writeFileSync(path.join(project, 'export_presets.cfg'), preset, {flag: 'wx'});
  const executable = path.join(exported, platform.executable);
  run('export-release', editor, ['--headless', '--path', project, '--export-release', platform.export, executable, '--log-file', path.join(directory, 'export-engine.log')], true);
  const relocated = path.join(directory, 'relocated-game'); fs.cpSync(exported, relocated, {recursive: true, force: false, errorOnExist: true});
  // Also hide the original project/export during the standalone release replay.
  for (const from of [project, exported]) makeUnavailable(from);
  const exportedLibraries = [platform.library, platform.bridge].map(name => {
    const matches = listFiles(relocated).filter(file => path.basename(file) === name); assert.equal(matches.length, 1, name);
    const file = path.join(relocated, matches[0]);
    assert.equal(hash(file), addonFiles['bin/' + name], 'Exported library identity: ' + name);
    return file;
  });
  report.release = verifyReplay('release-replay', path.join(relocated, platform.executable), [], true, relocated, exportedLibraries);
  report.sourceProjectUnavailableDuringRelease = true;
  report.buildInputsUnavailableDuringReplay = true;
  report.addon = {archiveSha256: hash(archive), archiveBytes: fs.statSync(archive).size, files: addonFiles};
  report.exportedFiles = Object.fromEntries(listFiles(relocated).map(file => [file, hash(path.join(relocated, file))]));
  report.productionRuntimeChanged = false; report.deviceSupportEstablished = false; report.passed = true; report.status = 'completed';
} catch (error) {report.status = 'failed'; report.error = error.message; throw error;}
finally {
  for (const [from, to] of moved.reverse()) {assert(!fs.existsSync(from)); fs.renameSync(to, from);}
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
