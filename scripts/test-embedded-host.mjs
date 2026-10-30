import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {root, git, sha256, listFiles, writeJSON} from './reference-utils.mjs';
import {buildEmbeddedExecutable} from './embedded-native-tools.mjs';
import {embeddedProbeCases,verifyEmbeddedHostCase} from './embedded-host-case.mjs';
import {itemPack} from './compile-item-content.mjs';
import {passivePack} from './compile-passive-content.mjs';
import {build, version as bundlerVersion} from '../.reference/node_modules/esbuild/lib/main.js';

assert(['win32', 'linux'].includes(process.platform), 'Only Windows and Linux proof builds are configured');
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
const support = path.join(root, 'experiments/embedded-js/host-support.h');
const supportBytes = fs.readFileSync(support);
const allocationSource = path.join(root, 'experiments/embedded-js/tracked-allocator.h');
const allocationBytes = fs.readFileSync(allocationSource);
const toolSources = Object.fromEntries(['scripts/test-embedded-host.mjs', 'scripts/embedded-host-case.mjs', 'scripts/embedded-native-tools.mjs', 'scripts/native-tools.mjs']
  .map(file => [file, sha256(fs.readFileSync(path.join(root, file)))]));
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
  supportSourceSha256: sha256(supportBytes),
  allocationSourceSha256: sha256(allocationBytes),
  observationSourceSha256: sha256(observationBytes), sourceLockSha256: sha256(lockBytes),
  upstreamFiles: lock.files, runtimeOutputs: Object.keys(before).length,
  runtimeMapSha256: sha256(JSON.stringify(before)), inputSha256: inputHash, toolSources,
  inputBytes: fs.statSync(input).size, cases: [],
  scope: 'Development executable with three fresh runtimes per case. No reusable native ABI, persistent-context, timing, engine-package or device result.'
};
try {
  const built = buildEmbeddedExecutable(directory, upstream, source, 'host');
  const {env, binary} = built;
  report.compilerBanner = built.compilerBanner;
  report.compilerFlags = built.compilerFlags;
  report.buildCommands = built.commands;
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

  for (const [mode] of embeddedProbeCases) {
    const exitCode=run(mode,binary,[bundle,input,mode]);
    const output = fs.readFileSync(path.join(directory, mode + '.jsonl'), 'utf8');
    const {stats,errors}=verifyEmbeddedHostCase({mode,exitCode,stderr:fs.readFileSync(path.join(directory,mode+'.txt'),'utf8'),stdout:output});
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
    // load-memory repeats the exact bundle proven valid above, with only its
    // heap budget reduced. Parser failure text can vary under allocation
    // pressure; the stage, budget, exit code, empty output and cleanup are exact.
    // The separate direct allocation case still requires the precise OOM error.
    report.cases.push({mode, stats, errors});
    console.log({mode, runtimeCycles: stats.length, trackedAllocationsAfterDispose: 0});
  }
  report.raw = Object.fromEntries(fs.readdirSync(directory).filter(file => /\.(jsonl|txt)$/.test(file))
    .map(file => [file, sha256(fs.readFileSync(path.join(directory, file)))]));
  report.runtimeCycles = 24;
  report.passed = true;
  report.status = 'completed';
} catch (error) { report.status = 'failed'; throw error; }
finally {
  assert.deepEqual(runtimeSnapshot(), before);
  assert(fs.readFileSync(source).equals(sourceBytes));
  assert(fs.readFileSync(support).equals(supportBytes));
  assert(fs.readFileSync(allocationSource).equals(allocationBytes));
  assert(fs.readFileSync(observation).equals(observationBytes));
  assert(fs.readFileSync(lockFile).equals(lockBytes));
  for (const [file, hash] of Object.entries(toolSources)) assert.equal(sha256(fs.readFileSync(path.join(root, file))), hash, file);
  for (const [file, hash] of Object.entries(lock.files)) assert.equal(sha256(fs.readFileSync(path.join(upstream, file))), hash);
  assert.equal(sha256(fs.readFileSync(input)), inputHash);
  report.inputsUnchanged = true;
  writeJSON(receipt, report);
  console.log({directory, passed: report.passed, runtimeCycles: report.runtimeCycles});
}
