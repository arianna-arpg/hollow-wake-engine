import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync, execFileSync} from 'node:child_process';
import {root, git, sha256, listFiles, writeJSON} from './reference-utils.mjs';

assert.equal(process.platform, 'linux'); assert.equal(process.arch, 'x64');
const read = file => JSON.parse(fs.readFileSync(file)), hash = file => sha256(fs.readFileSync(file));
const lockDirectory = path.join(root, 'experiments/steamrt-godot');
const lock = read(path.join(lockDirectory, 'toolchain-lock.json'));
assert.equal(lock.schemaVersion, 1); assert.equal(process.version, 'v' + lock.node);
assert.deepEqual(Object.keys(lock.images).sort(), ['platform', 'sdk']);
assert.equal(lock.images.sdk.buildId, lock.images.platform.buildId);
for (const image of Object.values(lock.images)) {
  assert.deepEqual(image.platform, {os: 'linux', architecture: 'amd64'});
  for (const record of image.records) {
    assert.equal(path.basename(record.file), record.file);
    assert.equal('sha256:' + hash(path.join(lockDirectory, record.file)), record.digest);
    assert.equal(fs.statSync(path.join(lockDirectory, record.file)).size, record.bytes);
  }
  const manifestRecord = image.records.find(r => r.file.endsWith('-manifests.json'));
  const configRecord = image.records.find(r => r.file.endsWith('-blobs.json'));
  assert.equal(manifestRecord.digest, image.manifestDigest); assert.equal(configRecord.digest, image.configDigest);
  const manifest = read(path.join(lockDirectory, manifestRecord.file));
  const config = read(path.join(lockDirectory, configRecord.file));
  assert.equal(manifest.config.digest, image.configDigest); assert.equal(config.config.Labels['os_release.build_id'], image.buildId);
}
const args = process.argv.slice(2), inside = args[0] === '--sdk';
assert(inside ? args.length === 2 : args.length === 0, 'Run in a fresh Linux checkout with Docker, Node and .NET installed');
if (!inside) fs.mkdirSync(path.join(root, '.artifacts'), {recursive: true});
const directory = inside ? fs.realpathSync(args[1]) : fs.mkdtempSync(path.join(root, '.artifacts/steamrt-godot-'));
assert(/^\.artifacts\/steamrt-godot-[A-Za-z0-9]+(?:\/sdk)?$/.test(path.relative(root, directory).split(path.sep).join('/')));
const sourceFiles = ['scripts/test-steamrt-godot.mjs', '.github/workflows/steamrt-godot.yml',
  ...listFiles(lockDirectory).map(file => 'experiments/steamrt-godot/' + file)];
const sources = Object.fromEntries(sourceFiles.map(file => [file, hash(path.join(root, file))]));
const report = {schemaVersion: 1, passed: false, status: 'started', phase: inside ? 'sdk' : 'host',
  commit: git(root, ['rev-parse', 'HEAD']).trim(), sources, commands: [], images: lock.images,
  scope: 'Steam Runtime 4 SDK build and runtime-only headless Godot export. Selected capability, not Steam client/device/performance qualification.'};
const receipt = path.join(directory, 'verification.json');
if (!inside) writeJSON(path.join(root, '.artifacts/steamrt-godot-latest.json'), {directory, receipt});
function run(label, command, argv, timeout = 300000) {
  const output = path.join(directory, label + '.txt'), fd = fs.openSync(output, 'wx');
  const record = {label, command, args: argv}; report.commands.push(record); let result;
  try { result = spawnSync(command, argv, {cwd: root, stdio: ['ignore', fd, fd], timeout}); }
  finally { fs.closeSync(fd); }
  Object.assign(record, {exitCode: result.status, signal: result.signal});
  assert(!result.error, result.error?.message); assert.equal(result.signal, null, label); assert.equal(result.status, 0, label);
  return fs.readFileSync(output, 'utf8').trim();
}
function commandPath(name) {return fs.realpathSync(execFileSync('which', [name], {encoding: 'utf8'}).trim());}
function localArtifact(relative) {
  assert(relative.startsWith('.artifacts/')); const target = fs.realpathSync(path.resolve(root, relative));
  assert(target.startsWith(path.join(root, '.artifacts') + path.sep)); return target;
}
function pointer(name) {
  const value = read(path.join(root, '.artifacts/' + name + '-latest.json'));
  const relative = path.relative(root, value.directory).split(path.sep).join('/'); localArtifact(relative); return relative;
}
const containers = [];
try {
  if (inside) {
    const releaseText = fs.readFileSync('/usr/lib/os-release', 'utf8');
    const release = Object.fromEntries(releaseText.trim().split('\n').filter(line => /^[A-Z_]+=/.test(line)).map(line => {
      const split = line.indexOf('='); return [line.slice(0, split), line.slice(split + 1).replace(/^"|"$/g, '')];
    }));
    assert.equal(release.ID, 'steamrt'); assert.equal(release.BUILD_ID, lock.images.sdk.buildId);
    assert.equal(release.VARIANT_ID, lock.images.sdk.variant); fs.writeFileSync(path.join(directory, 'os-release.txt'), releaseText, {flag: 'wx'});
    report.environment = {release, node: process.version, libc: run('libc', 'getconf', ['GNU_LIBC_VERSION']),
      cc: run('cc', 'cc', ['--version']), cxx: run('cxx', 'c++', ['--version']),
      cmake: run('cmake', 'cmake', ['--version']), python: run('python', 'python3', ['--version']),
      dotnet: run('dotnet', 'dotnet', ['--version'])};
    assert.equal(report.environment.dotnet, lock.dotnetSdk);
    run('npm-install', 'npm', ['ci'], 600000);
    run('sdk-verification', 'npm', ['run', 'verify'], 1800000);
    run('reference-prepare', 'npm', ['run', 'reference:prepare'], 300000);
    run('reference-install', 'npm', ['run', 'reference:install'], 600000);
    const upstream = path.join(directory, 'upstream'); fs.mkdirSync(upstream);
    const runtimeLock = read(path.join(root, 'experiments/embedded-js/host-source-lock.json'));
    const archive = path.join(upstream, runtimeLock.archive.name);
    const response = await fetch('https://github.com/quickjs-ng/quickjs/releases/download/v0.17.0/' + runtimeLock.archive.name, {signal: AbortSignal.timeout(120000)});
    assert(response.ok, String(response.status)); const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(sha256(bytes), runtimeLock.archive.sha256); fs.writeFileSync(archive, bytes, {flag: 'wx'});
    const extraction = 'import pathlib,sys,zipfile\nroot=pathlib.Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2]) as z:\n for name in ("quickjs-amalgam.c","quickjs.h"):\n  with (root/name).open("xb") as out: out.write(z.read(name))\n';
    run('extract-runtime', 'python3', ['-c', extraction, upstream, archive]);
    for (const [file, expected] of Object.entries(runtimeLock.files)) assert.equal(hash(path.join(upstream, file)), expected);
    run('native-library', process.execPath, ['scripts/test-embedded-library.mjs', '--amalgam-dir', upstream], 1200000);
    run('godot-tools', process.execPath, ['scripts/prepare-godot-tools.mjs', '--cmake', commandPath('cmake'), '--ninja', commandPath('ninja'), '--python', commandPath('python3')], 1200000);
    const toolsPointer = read(path.join(root, '.artifacts/godot-tools-latest.json'));
    run('godot-package', process.execPath, ['scripts/test-godot-native.mjs', '--tools', toolsPointer.tools,
      '--library-proof', localArtifact(pointer('embedded-library')), '--session-proof', localArtifact(pointer('embedded-session'))], 1200000);
    report.generated = Object.fromEntries(['embedded-library', 'embedded-session', 'godot-tools', 'godot-native'].map(name => [name, pointer(name)]));
  } else {
    for (const name of ['embedded-library', 'embedded-session', 'godot-tools', 'godot-native'])
      assert(!fs.existsSync(path.join(root, '.artifacts/' + name + '-latest.json')), 'Use a fresh checkout; prior experiment artifacts are preserved');
    assert.equal(run('dotnet-version', 'dotnet', ['--version']), lock.dotnetSdk);
    report.dockerVersion = run('docker-version', 'docker', ['version', '--format', '{{json .}}']);
    const images = {};
    for (const [kind, image] of Object.entries(lock.images)) {
      const ref = image.repository + '@' + image.manifestDigest;
      run(kind + '-pull', 'docker', ['pull', '--platform', 'linux/amd64', ref], 1200000);
      const actual = JSON.parse(run(kind + '-image', 'docker', ['image', 'inspect', ref]))[0];
      assert.equal(actual.Id, image.configDigest); assert(actual.RepoDigests.includes(ref));
      assert.equal(actual.Architecture, 'amd64'); assert.equal(actual.Os, 'linux');
      assert.equal(actual.Config.Labels['os_release.build_id'], image.buildId);
      assert.equal(actual.Config.Labels['os_release.variant_id'], image.variant); images[kind] = ref;
    }
    const create = (kind, parameters, command) => {
      const id = run(kind + '-create', 'docker', ['create', '--platform', 'linux/amd64', '--label', 'org.hollow-wake.proof=' + path.basename(directory),
        ...parameters, images[kind], ...command]); assert(/^[0-9a-f]{64}$/.test(id)); containers.push(id); return id;
    };
    const sdkDirectory = path.join(directory, 'sdk'); fs.mkdirSync(sdkDirectory);
    const nodeRoot = path.dirname(path.dirname(fs.realpathSync(process.execPath))), dotnetRoot = path.dirname(commandPath('dotnet'));
    const sdk = create('sdk', ['--volume', root + ':/workspace', '--volume', nodeRoot + ':/tools/node:ro', '--volume', dotnetRoot + ':/tools/dotnet:ro',
      '--workdir', '/workspace', '--env', 'PATH=/tools/node/bin:/tools/dotnet:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      '--env', 'CI=true', '--env', 'DOTNET_ROOT=/tools/dotnet', '--entrypoint', '/tools/node/bin/node'],
      ['/workspace/scripts/test-steamrt-godot.mjs', '--sdk', '/workspace/' + path.relative(root, sdkDirectory).split(path.sep).join('/')]);
    run('sdk-execution', 'docker', ['start', '--attach', sdk], 2700000);
    const sdkState = JSON.parse(run('sdk-container', 'docker', ['inspect', sdk]))[0];
    assert.equal(sdkState.Image, lock.images.sdk.configDigest); assert.equal(sdkState.State.ExitCode, 0); assert.equal(sdkState.State.Status, 'exited');
    const sdkProof = read(path.join(sdkDirectory, 'verification.json')); assert(sdkProof.passed && sdkProof.inputsUnchanged);
    const godotDirectory = localArtifact(sdkProof.generated['godot-native']), godot = read(path.join(godotDirectory, 'verification.json'));
    const sessionDirectory = localArtifact(sdkProof.generated['embedded-session']);
    assert(godot.passed && godot.inputsUnchanged && godot.sourceProjectUnavailableDuringRelease && godot.buildInputsUnavailableDuringReplay);
    const exported = path.join(godotDirectory, 'relocated-game');
    const gameFiles = () => Object.fromEntries(listFiles(exported).map(file => [file, hash(path.join(exported, file))]));
    assert.deepEqual(gameFiles(), godot.exportedFiles);
    const output = path.join(directory, 'platform'); fs.mkdirSync(output);
    const platform = create('platform', ['--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '--volume', exported + ':/package:ro', '--volume', output + ':/evidence', '--tmpfs', '/tmp:rw,nosuid,nodev,size=268435456',
      '--workdir', '/package', '--env', 'XDG_DATA_HOME=/tmp/data', '--env', 'XDG_CONFIG_HOME=/tmp/config', '--env', 'XDG_CACHE_HOME=/tmp/cache',
      '--env', 'LD_DEBUG=libs', '--env', 'LD_DEBUG_OUTPUT=/evidence/platform-loader', '--entrypoint', '/package/hollow-wake-proof.x86_64'],
      ['--headless', '--log-file', '/evidence/platform-engine.log', '--', '/evidence/platform.jsonl']);
    // Keep the exact container configuration before execution, including mounts.
    const configuration = JSON.parse(run('platform-container-created', 'docker', ['inspect', platform]))[0];
    assert.equal(configuration.Image, lock.images.platform.configDigest); assert.equal(configuration.HostConfig.NetworkMode, 'none');
    assert.equal(configuration.HostConfig.ReadonlyRootfs, true);
    assert.deepEqual(Object.keys(configuration.HostConfig.Tmpfs), ['/tmp']);
    for (const mount of configuration.Mounts) if (mount.Type !== 'bind') assert(mount.Type === 'tmpfs' && mount.Destination === '/tmp');
    assert.deepEqual(configuration.Mounts.filter(m => m.Type === 'bind').map(m => ({source: m.Source, destination: m.Destination, writable: m.RW})).sort((a,b) => a.destination.localeCompare(b.destination)),
      [{source: output, destination: '/evidence', writable: true}, {source: exported, destination: '/package', writable: false}]);
    const text = run('platform-execution', 'docker', ['start', '--attach', platform]);
    const state = JSON.parse(run('platform-container-completed', 'docker', ['inspect', platform]))[0];
    assert.equal(state.State.ExitCode, 0); assert.equal(state.State.Status, 'exited');
    assert(!/ERROR:|SCRIPT ERROR|WARNING:.*(?:leak|ObjectDB)/i.test(text), 'Runtime-only engine diagnostics');
    const stats = text.split(/\r?\n/).filter(line => line.startsWith('{')).map(JSON.parse).at(-1);
    const comparison = {...godot.release}; delete comparison.loadedLibraries; delete comparison.observationsSha256;
    assert.deepEqual(stats, comparison);
    const jsonl = file => fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
    assert.deepEqual(jsonl(path.join(output, 'platform.jsonl')), jsonl(path.join(sessionDirectory, 'node-original.jsonl')));
    // Direct executable entrypoint, with no init or shell, makes Godot PID 1.
    const trace = fs.readFileSync(path.join(output, 'platform-loader.1'), 'utf8');
    const loaded = [...trace.matchAll(/calling init:\s+([^\r\n]+)/g)].map(m => m[1].trim())
      .filter(file => ['libhwe_embedded.so', 'libhwe_godot.so'].includes(path.posix.basename(file))).sort();
    assert.deepEqual(loaded, ['/package/libhwe_embedded.so', '/package/libhwe_godot.so']);
    assert.deepEqual(gameFiles(), godot.exportedFiles);
    report.sdk = {receipt: path.relative(root, path.join(sdkDirectory, 'verification.json')), sha256: hash(path.join(sdkDirectory, 'verification.json')), generated: sdkProof.generated};
    report.platform = {...stats, loadedLibraries: loaded, observationsSha256: hash(path.join(output, 'platform.jsonl')),
      image: lock.images.platform.configDigest, gameFiles: godot.exportedFiles, sourceAndBuildToolsNotMounted: true, networkDisabled: true, packageUnchanged: true};
  }
  report.passed = true; report.status = 'completed';
} catch (error) {report.status = 'failed'; report.error = error.message; throw error;}
finally {
  // Only containers created by this invocation are removed; no image/cache prune.
  for (const id of containers.reverse()) {
    const outcome = spawnSync('docker', ['rm', '--force', id], {encoding: 'utf8'});
    (report.cleanup ??= []).push({container: id, exitCode: outcome.status, output: outcome.stdout, error: outcome.stderr});
    if (outcome.error || outcome.status !== 0) {report.passed = false; report.status = 'cleanup-failed';}
  }
  for (const [file, expected] of Object.entries(sources)) assert.equal(hash(path.join(root, file)), expected, file);
  report.inputsUnchanged = true;
  // Include a partial loader trace in failure artifacts as well.
  const pidTrace = path.join(directory, 'platform/platform-loader.1');
  if (fs.existsSync(pidTrace)) fs.renameSync(pidTrace, path.join(directory, 'platform/platform-loader.log'));
  report.raw = Object.fromEntries(listFiles(directory).filter(file => /\.(txt|log|jsonl)$/.test(file)).map(file => [file, hash(path.join(directory, file))]));
  writeJSON(receipt, report); console.log({directory, passed: report.passed, status: report.status, platform: report.platform});
  if (!report.passed) process.exitCode = 1;
}
