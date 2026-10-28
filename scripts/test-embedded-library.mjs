import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {root, git, sha256, listFiles, writeJSON} from './reference-utils.mjs';
import {buildEmbeddedLibrary} from './embedded-native-tools.mjs';

assert(['win32', 'linux'].includes(process.platform), 'Only Windows and Linux proof builds are configured');
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
const sources = ['scripts/test-embedded-library.mjs', 'scripts/embedded-native-tools.mjs', 'scripts/native-tools.mjs', 'scripts/reference-utils.mjs',
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
  scope: 'Experimental dynamically loaded x64 library with C++ and .NET consumers on the recorded platform. No stable ABI, engine package, device result or performance superiority claim.'};
try {
  const built = buildEmbeddedLibrary(directory, upstream);
  const {env, library, native} = built;
  const source = path.join(root, 'experiments/embedded-js/native');
  report.compilerBanner = built.compilerBanner; report.cppCompilerBanner = built.cppCompilerBanner;
  report.buildCommands = built.commands;
  report.librarySha256 = sha256(fs.readFileSync(library)); report.libraryBytes = fs.statSync(library).size; report.exportedFunctions = built.exportedFunctions;
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
  const consumer = (label, command, prefix, environment, selectedLibrary = library) => {
    const out = fs.openSync(path.join(directory, label + '.txt'), 'wx');
    const output = path.join(directory, label + '.jsonl');
    let completed;
    try {
      completed = spawnSync(command, [...prefix, selectedLibrary, path.join(fixture, 'bundle.js'), path.join(fixture, 'input.json'),
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
  if (process.platform === 'linux') {
    const sanitizedDirectory = path.join(directory, 'sanitized'); fs.mkdirSync(sanitizedDirectory);
    const sanitized = buildEmbeddedLibrary(sanitizedDirectory, upstream, {sanitize: true});
    report.sanitizers = {address: true, undefinedBehavior: true, leakDetection: true, consumer: 'C++ only; normal .NET proof remains separate',
      librarySha256: sha256(fs.readFileSync(sanitized.library)), consumerSha256: sha256(fs.readFileSync(sanitized.native)),
      buildCommands: sanitized.commands, exportedFunctions: sanitized.exportedFunctions,
      result: consumer('cpp-sanitized', sanitized.native, [], {...sanitized.env,
        ASAN_OPTIONS: 'detect_leaks=1:halt_on_error=1', UBSAN_OPTIONS: 'halt_on_error=1:print_stacktrace=1'}, sanitized.library)};
  }
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
