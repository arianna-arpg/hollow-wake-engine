import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {root, git, sha256, listFiles, writeJSON} from './reference-utils.mjs';
import {nativeEnvironment} from './native-tools.mjs';

assert.equal(process.platform, 'win32', 'Current library experiment validates Windows x64 only');
assert.equal(process.arch, 'x64');
const args = process.argv.slice(2);
assert([2, 4].includes(args.length)); assert.equal(args[0], '--amalgam-dir');
const upstream = fs.realpathSync(args[1]);
const lock = JSON.parse(fs.readFileSync(path.join(root, 'experiments/embedded-js/host-source-lock.json')));
for (const [file, hash] of Object.entries(lock.files)) assert.equal(sha256(fs.readFileSync(path.join(upstream, file))), hash);
if (args.length === 2) {
  execFileSync(process.execPath, [path.join(root, 'scripts/test-embedded-session.mjs'), '--amalgam-dir', upstream],
    {cwd: root, windowsHide: true, stdio: 'inherit', timeout: 180000});
} else assert.equal(args[2], '--session-fixture');
const pointer = JSON.parse(fs.readFileSync(path.resolve(root, args[3] ?? '.artifacts/embedded-session-latest.json')));
const fixture = fs.realpathSync(pointer.directory);
const priorBytes = fs.readFileSync(path.join(fixture, 'verification.json')), prior = JSON.parse(priorBytes);
assert.equal(prior.passed, true); assert.equal(prior.status, 'completed');
for (const [file, hash] of Object.entries(prior.sourceHashes)) assert.equal(sha256(fs.readFileSync(path.join(root, file))), hash, file);
for (const [file, hash] of Object.entries(prior.raw)) assert.equal(sha256(fs.readFileSync(path.join(fixture, file))), hash, file);
assert.equal(sha256(fs.readFileSync(path.join(fixture, 'input.json'))), prior.inputSha256);
assert.equal(sha256(fs.readFileSync(path.join(fixture, 'bundle.js'))), prior.bundleSha256);
const runtimeSnapshot = () => Object.fromEntries(listFiles(path.join(root, 'dist')).map(file => [file, sha256(fs.readFileSync(path.join(root, 'dist', file)))]));
const runtime = runtimeSnapshot();
assert.equal(sha256(JSON.stringify(runtime)), prior.runtimeMapSha256);
const sources = ['scripts/test-embedded-library.mjs', 'scripts/native-tools.mjs', 'scripts/reference-utils.mjs',
  'experiments/embedded-js/tracked-allocator.h', 'experiments/embedded-js/host-source-lock.json',
  ...listFiles(path.join(root, 'experiments/embedded-js/native')).map(file => 'experiments/embedded-js/native/' + file)];
const sourceHashes = Object.fromEntries(sources.map(file => [file, sha256(fs.readFileSync(path.join(root, file)))]));
const directory = fs.mkdtempSync(path.join(root, '.artifacts/embedded-library-'));
const receipt = path.join(directory, 'verification.json');
writeJSON(path.join(root, '.artifacts/embedded-library-latest.json'), {directory, receipt});
const report = {schemaVersion: 1, passed: false, status: 'started', commit: git(root, ['rev-parse', 'HEAD']).trim(),
  platform: process.platform, arch: process.arch, node: process.version, sourceHashes,
  runtimeOutputs: Object.keys(runtime).length, runtimeMapSha256: sha256(JSON.stringify(runtime)),
  upstream: lock, fixtureReceiptSha256: sha256(priorBytes), inputSha256: prior.inputSha256, bundleSha256: prior.bundleSha256,
  requests: prior.requests, exactNumbersPerConsumer: prior.exactNumericComparisons,
  scope: 'Experimental dynamically loaded Windows x64 library with C++ and .NET consumers. No stable ABI, engine package, device result or performance superiority claim.'};
try {
  const env = nativeEnvironment(directory);
  const log = fs.openSync(path.join(directory, 'build.txt'), 'wx');
  const source = path.join(root, 'experiments/embedded-js/native');
  const library = path.join(directory, 'hwe_embedded.dll'), native = path.join(directory, 'consumer.exe');
  const ownObject = path.join(directory, 'hwe_embedded.obj'), upstreamObject = path.join(directory, 'quickjs-amalgam.obj');
  const flags = ['/nologo', '/O2', '/std:c11', '/fp:strict', '/MT', '/experimental:c11atomics', '/I' + upstream];
  const compile = argv => execFileSync('cl.exe', argv, {cwd: directory, env, windowsHide: true, stdio: ['ignore', log, log]});
  try {
    compile([...flags, '/W4', '/WX', '/DHWE_JS_BUILD_SHARED', '/c', path.join(source, 'hwe_embedded.c'), '/Fo:' + ownObject]);
    compile([...flags, '/c', path.join(upstream, 'quickjs-amalgam.c'), '/Fo:' + upstreamObject]);
    compile(['/nologo', '/MT', '/LD', ownObject, upstreamObject, '/Fe:' + library]);
    compile(['/nologo', '/O2', '/W4', '/WX', '/std:c++17', '/utf-8', '/EHsc', '/MT', path.join(source, 'consumer.cpp'),
      '/Fo:' + path.join(directory, 'consumer.obj'), '/Fe:' + native, '/link', '/STACK:2097152']);
  } finally { fs.closeSync(log); }
  const exported = execFileSync('dumpbin.exe', ['/exports', library], {cwd: directory, env, windowsHide: true, encoding: 'utf8'});
  fs.writeFileSync(path.join(directory, 'exports.txt'), exported, {flag: 'wx'});
  const names = [...exported.matchAll(/^\s+\d+\s+[\dA-F]+\s+[\dA-F]+\s+(\S+)\s*$/gm)].map(match => match[1]).sort();
  assert.deepEqual(names, ['cancel', 'copy_response', 'create', 'destroy', 'layout', 'metrics', 'release_response', 'submit'].map(name => 'hwe_js_' + name + '_v1').sort());
  const compiler = spawnSync('cl.exe', [], {cwd: directory, env, windowsHide: true, encoding: 'utf8'});
  assert(!compiler.error); report.compilerBanner = (compiler.stdout + compiler.stderr).trim();
  report.librarySha256 = sha256(fs.readFileSync(library)); report.libraryBytes = fs.statSync(library).size; report.exportedFunctions = names;
  const managed = path.join(directory, 'managed'), intermediate = path.join(directory, 'managed-obj') + path.sep;
  const managedEnv = {...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1', DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1', DOTNET_CLI_HOME: path.join(directory, 'dotnet-home')};
  const sdk = execFileSync('dotnet', ['--list-sdks'], {cwd: directory, env: managedEnv, windowsHide: true, encoding: 'utf8'})
    .split(/\r?\n/).map(line => line.split(' ')[0]).filter(version => /^8\.\d+\.\d+$/.test(version))
    .sort((a, b) => Number(a.split('.')[2]) - Number(b.split('.')[2])).at(-1);
  assert(sdk, 'Install the .NET 8 SDK, including its offline targeting packs');
  writeJSON(path.join(directory, 'global.json'), {sdk: {version: sdk, rollForward: 'disable'}});
  const buildLog = fs.openSync(path.join(directory, 'dotnet-build.txt'), 'wx');
  try {
    execFileSync('dotnet', ['build', path.join(source, 'dotnet/Consumer.csproj'), '-c', 'Release', '-o', managed,
      '-p:BaseIntermediateOutputPath=' + intermediate, '-p:MSBuildProjectExtensionsPath=' + intermediate,
      '-p:NuGetAudit=false', '-p:UseSharedCompilation=false', '--disable-build-servers', '--configfile', path.join(source, 'dotnet/NuGet.Config')],
      {cwd: directory, env: managedEnv, windowsHide: true, stdio: ['ignore', buildLog, buildLog], timeout: 120000});
  } finally { fs.closeSync(buildLog); }
  report.dotnetSdk = execFileSync('dotnet', ['--version'], {cwd: directory, env: managedEnv, windowsHide: true, encoding: 'utf8'}).trim();
  const expected = fs.readFileSync(path.join(fixture, 'node-original.jsonl'), 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line));
  const consumer = (label, command, prefix, environment) => {
    const out = fs.openSync(path.join(directory, label + '.txt'), 'wx');
    const output = path.join(directory, label + '.jsonl');
    let completed;
    try {
      completed = spawnSync(command, [...prefix, library, path.join(fixture, 'bundle.js'), path.join(fixture, 'input.json'),
        path.join(fixture, 'requests.jsonl'), output], {cwd: directory, env: environment, windowsHide: true,
        stdio: ['ignore', out, out], timeout: 60000});
    } finally { fs.closeSync(out); }
    assert(!completed.error, completed.error?.message); assert.equal(completed.signal, null); assert.equal(completed.status, 0, label);
    const stats = JSON.parse(fs.readFileSync(path.join(directory, label + '.txt'), 'utf8').trim());
    assert.equal(stats.passed, true); assert.equal(stats.requests, expected.length);
    assert.equal(stats.liveBytesAfterDispose, 0); assert.equal(stats.liveBlocksAfterDispose, 0);
    const responses = fs.readFileSync(output, 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line));
    assert.deepEqual(responses, expected, label + ': all observable responses');
    return stats;
  };
  report.cpp = consumer('cpp', native, [], env);
  report.dotnet = consumer('dotnet', 'dotnet', [path.join(managed, 'Consumer.dll')], managedEnv);
  report.passed = true; report.status = 'completed';
  report.raw = Object.fromEntries(fs.readdirSync(directory).filter(file => /\.(jsonl|txt)$/.test(file)).map(file => [file, sha256(fs.readFileSync(path.join(directory, file)))]));
} catch (error) { report.status = 'failed'; throw error; }
finally {
  assert.deepEqual(runtimeSnapshot(), runtime);
  for (const [file, hash] of Object.entries(sourceHashes)) assert.equal(sha256(fs.readFileSync(path.join(root, file))), hash, file);
  for (const [file, hash] of Object.entries(prior.sourceHashes)) assert.equal(sha256(fs.readFileSync(path.join(root, file))), hash, file);
  for (const [file, hash] of Object.entries(prior.raw)) assert.equal(sha256(fs.readFileSync(path.join(fixture, file))), hash, file);
  assert.equal(sha256(fs.readFileSync(path.join(fixture, 'verification.json'))), sha256(priorBytes));
  assert.equal(sha256(fs.readFileSync(path.join(fixture, 'input.json'))), prior.inputSha256);
  assert.equal(sha256(fs.readFileSync(path.join(fixture, 'bundle.js'))), prior.bundleSha256);
  for (const [file, hash] of Object.entries(lock.files)) assert.equal(sha256(fs.readFileSync(path.join(upstream, file))), hash);
  report.inputsUnchanged = true; writeJSON(receipt, report);
  console.log({directory, passed: report.passed, requests: report.requests, exactNumbersPerConsumer: report.exactNumbersPerConsumer});
}
