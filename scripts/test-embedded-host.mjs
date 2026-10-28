import fs from 'node:fs';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {root, git, sha256, listFiles, writeJSON} from './reference-utils.mjs';
import {nativeEnvironment} from './native-tools.mjs';
import {itemPack} from './compile-item-content.mjs';
import {passivePack} from './compile-passive-content.mjs';
import {build, version as bundlerVersion} from '../.reference/node_modules/esbuild/lib/main.js';

assert.equal(process.platform, 'win32', 'This experiment currently verifies Windows x64 only');
assert.equal(process.arch, 'x64');
const args = process.argv.slice(2);
assert.equal(args.length, 2);
assert.equal(args[0], '--amalgam-dir', 'Supply --amalgam-dir /path/to/extracted/pinned/sources');
const upstream = fs.realpathSync(args[1]);
const lockFile = path.join(root, 'experiments/embedded-js/host-source-lock.json');
const lockBytes = fs.readFileSync(lockFile), lock = JSON.parse(lockBytes);
for (const [file, hash] of Object.entries(lock.files)) {
  assert.equal(sha256(fs.readFileSync(path.join(upstream, file))), hash, 'Pinned upstream source: ' + file);
}
const runtimeSnapshot = () => Object.fromEntries(listFiles(path.join(root, 'dist')).map(file =>
  [file, sha256(fs.readFileSync(path.join(root, 'dist', file)))]));
const before = runtimeSnapshot();
const source = path.join(root, 'experiments/embedded-js/host.c');
const observation = path.join(root, 'experiments/embedded-js/compatibility.mjs');
const sourceBytes = fs.readFileSync(source), observationBytes = fs.readFileSync(observation);
const directory = fs.mkdtempSync(path.join(root, '.artifacts/embedded-host-'));
const receipt = path.join(directory, 'verification.json');
writeJSON(path.join(root, '.artifacts/embedded-host-latest.json'), {directory, receipt});
const input = path.join(directory, 'input.json');
writeJSON(input, {
  core: JSON.parse(fs.readFileSync(path.join(root, 'content/milestone-one.json'))),
  items: itemPack(), passives: passivePack()
});
const inputHash = sha256(fs.readFileSync(input));
const report = {
  schemaVersion: 1, passed: false, status: 'started', runtime: lock.runtime, version: lock.version,
  platform: process.platform, arch: process.arch, node: process.version, bundlerVersion,
  commit: git(root, ['rev-parse', 'HEAD']).trim(), hostSourceSha256: sha256(sourceBytes),
  observationSourceSha256: sha256(observationBytes), sourceLockSha256: sha256(lockBytes),
  upstreamFiles: lock.files, runtimeOutputs: Object.keys(before).length,
  runtimeMapSha256: sha256(JSON.stringify(before)), inputSha256: inputHash,
  inputBytes: fs.statSync(input).size, cases: [],
  scope: 'Development executable with three fresh runtimes per case. No reusable native ABI, persistent-context, timing, engine-package or device result.'
};
try {
  const env = nativeEnvironment(directory), log = path.join(directory, 'build.txt');
  const descriptor = fs.openSync(log, 'wx');
  const hostObject = path.join(directory, 'host.obj');
  const upstreamObject = path.join(directory, 'quickjs-amalgam.obj');
  const binary = path.join(directory, 'host.exe');
  const flags = ['/nologo', '/O2', '/std:c11', '/fp:strict', '/MT', '/experimental:c11atomics', '/I' + upstream];
  const compile = argv => execFileSync('cl.exe', argv, {
    cwd: directory, env, windowsHide: true, stdio: ['ignore', descriptor, descriptor]
  });
  try {
    compile([...flags, '/W4', '/WX', '/c', source, '/Fo:' + hostObject]);
    compile([...flags, '/c', path.join(upstream, 'quickjs-amalgam.c'), '/Fo:' + upstreamObject]);
    compile(['/nologo', '/MT', hostObject, upstreamObject, '/Fe:' + binary]);
  } finally { fs.closeSync(descriptor); }
  const compiler = spawnSync('cl.exe', [], {cwd: directory, env, windowsHide: true, encoding: 'utf8'});
  assert(!compiler.error, compiler.error?.message);
  report.compilerBanner = (compiler.stdout + compiler.stderr).trim();
  report.compilerFlags = flags.filter(flag => !flag.startsWith('/I'));
  report.hostWarningsAsErrors = true;
  report.binarySha256 = sha256(fs.readFileSync(binary));
  report.binaryBytes = fs.statSync(binary).size;
  const bundle = path.join(directory, 'bundle.js');
  const bundled = await build({entryPoints: [observation], bundle: true, platform: 'neutral',
    format: 'iife', globalName: 'HollowWakeProbe', target: 'es2022', minify: false, metafile: true, outfile: bundle});
  for (const output of Object.values(bundled.metafile.outputs)) assert.equal(output.imports.length, 0);
  writeJSON(path.join(directory, 'bundle-map.json'), bundled.metafile);
  report.bundleSha256 = sha256(fs.readFileSync(bundle));
  report.bundleBytes = fs.statSync(bundle).size;

  const run = (label, command, argv) => {
    const out = fs.openSync(path.join(directory, label + '.jsonl'), 'wx');
    const err = fs.openSync(path.join(directory, label + '.txt'), 'wx');
    let result;
    try { result = spawnSync(command, argv, {cwd: directory, env, windowsHide: true,
      stdio: ['ignore', out, err], timeout: 60000}); }
    finally { fs.closeSync(out); fs.closeSync(err); }
    assert(!result.error, result.error?.message);
    assert.equal(result.signal, null);
    return result.status;
  };
  fs.writeFileSync(path.join(directory, 'original.mjs'),
    `import fs from 'node:fs';import {observe} from ${JSON.stringify(pathToFileURL(observation).href)};console.log(JSON.stringify(observe(JSON.parse(fs.readFileSync('input.json')))));\n`, {flag: 'wx'});
  fs.writeFileSync(path.join(directory, 'bundled.mjs'),
    "import fs from 'node:fs';import vm from 'node:vm';const context=vm.createContext({raw:fs.readFileSync('input.json','utf8')});vm.runInContext(fs.readFileSync('bundle.js','utf8'),context);console.log(vm.runInContext('JSON.stringify(HollowWakeProbe.observe(JSON.parse(raw)))',context));\n", {flag: 'wx'});
  assert.equal(run('node-original', process.execPath, ['original.mjs']), 0);
  assert.equal(run('node-bundled', process.execPath, ['bundled.mjs']), 0);
  const original = JSON.parse(fs.readFileSync(path.join(directory, 'node-original.jsonl')));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'node-bundled.jsonl'))), original);
  report.nodeSourceAndBundleEqual = true;
  assert.equal(run('allocator', binary, ['--allocator-check']), 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'allocator.jsonl'))), {allocatorChecksPassed: true});
  report.allocatorChecksPassed = true;

  const cases = [ ['success', 0, null], ['invalid-json', 2, /SyntaxError:/],
    ['sdk-error', 2, /TypeError:/], ['interrupt', 2, /InternalError: interrupted/],
    ['memory', 2, /InternalError: out of memory/], ['startup-memory', 3, null],
    ['stack', 2, /RangeError: Maximum call stack size exceeded/] ];
  for (const [mode, expectedCode, errorPattern] of cases) {
    assert.equal(run(mode, binary, [bundle, input, mode]), expectedCode, mode);
    const lines = fs.readFileSync(path.join(directory, mode + '.txt'), 'utf8').trim().split(/\r?\n/);
    const stats = lines.filter(line => line.startsWith('{')).map(line => JSON.parse(line));
    assert.equal(stats.length, 3, mode);
    const errors = lines.filter(line => line.startsWith('exception:'));
    assert.equal(errors.length, errorPattern ? 3 : 0, mode);
    for (const error of errors) assert.match(error, errorPattern);
    for (const [iteration, entry] of stats.entries()) {
      assert.equal(entry.mode, mode); assert.equal(entry.iteration, iteration); assert.equal(entry.code, expectedCode);
      assert.equal(entry.liveRequestedBytesAfterDispose, 0); assert.equal(entry.liveBlocksAfterDispose, 0);
      assert(entry.peakRequestedBytes > 0 && entry.allocationRequests > 0);
      assert.equal(entry.interruptCalls, mode === 'interrupt' ? 2 : 0);
      if (mode === 'memory') assert(entry.peakRequestedBytes <= 1024 * 1024);
      if (mode === 'startup-memory') assert(entry.peakRequestedBytes <= 32768);
    }
    const output = fs.readFileSync(path.join(directory, mode + '.jsonl'), 'utf8');
    if (mode === 'success') {
      const results = output.trim().split(/\r?\n/).map(line => JSON.parse(line));
      assert.equal(results.length, 3);
      let numbers = 0;
      function count(value) {
        if (typeof value === 'number') { assert(Number.isFinite(value)); numbers++; }
        else if (value && typeof value === 'object') Object.values(value).forEach(count);
      }
      count(original);
      assert.equal(numbers, 5153);
      for (const result of results) assert.deepEqual(result, original);
      report.exactNumbersPerRuntime = numbers;
      report.exactNumericComparisons = numbers * results.length;
      report.peakTrackedVmRequestedBytes = Math.max(...stats.map(entry => entry.peakRequestedBytes));
    } else assert.equal(output, '');
    report.cases.push({mode, stats});
    console.log({mode, runtimeCycles: stats.length, trackedAllocationsAfterDispose: 0});
  }
  report.raw = Object.fromEntries(fs.readdirSync(directory).filter(file => /\.(jsonl|txt)$/.test(file))
    .map(file => [file, sha256(fs.readFileSync(path.join(directory, file)))]));
  report.runtimeCycles = 21;
  report.passed = true;
  report.status = 'completed';
} catch (error) { report.status = 'failed'; throw error; }
finally {
  assert.deepEqual(runtimeSnapshot(), before);
  assert(fs.readFileSync(source).equals(sourceBytes));
  assert(fs.readFileSync(observation).equals(observationBytes));
  assert(fs.readFileSync(lockFile).equals(lockBytes));
  for (const [file, hash] of Object.entries(lock.files)) assert.equal(sha256(fs.readFileSync(path.join(upstream, file))), hash);
  assert.equal(sha256(fs.readFileSync(input)), inputHash);
  report.inputsUnchanged = true;
  writeJSON(receipt, report);
  console.log({directory, passed: report.passed, runtimeCycles: report.runtimeCycles});
}
