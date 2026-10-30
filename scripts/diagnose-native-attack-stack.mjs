import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {root, sha256, writeJSON} from './reference-utils.mjs';
import {buildEmbeddedExecutable} from './embedded-native-tools.mjs';
import {compareAttackCourse} from './native-attack-comparison.mjs';

// Diagnostic-only upstream copy. Never changes the production host's stack guard.
const args = process.argv.slice(2);
assert(args.length === 2 || args.length === 4);
assert.equal(args[0], '--amalgam-dir');
if (args.length === 4) assert.equal(args[2], '--course');
const upstream = fs.realpathSync(args[1]);
const course = fs.realpathSync(args[3] ?? JSON.parse(fs.readFileSync(path.join(root, '.artifacts/native-attack-course-latest.json'))).directory);
const inputs = new Map();
function read(file) {
  const bytes = fs.readFileSync(file);
  inputs.set(file, sha256(bytes));
  return bytes;
}
const lock = JSON.parse(read(path.join(root, 'experiments/embedded-js/host-source-lock.json')));
const base = JSON.parse(read(path.join(course, 'verification.json')));
assert.equal(base.runtimeVersion, lock.version);
const fixtures = ['original', 'installed'].map(label => {
  const bundle = read(path.join(course, label, 'bundle.js'));
  assert.equal(sha256(bundle), base.runs.find(row => row.label === label)?.bundleSha256);
  const node = read(path.join(course, label, 'node.jsonl')).toString().trim().split(/\r?\n/).map(JSON.parse);
  assert.equal(node.length, 32);
  return {label, bundle, node};
});
const directory = fs.mkdtempSync(path.join(root, '.artifacts/native-attack-stack-'));
writeJSON(path.join(root, '.artifacts/native-attack-stack-latest.json'), {directory});
const copiedUpstream = path.join(directory, 'upstream'); fs.mkdirSync(copiedUpstream);
const report = {schemaVersion: 1, passed: false, directory, course, platform: process.platform, arch: process.arch,
  runtimeVersion: lock.version, sourceCommit: base.commit, runtimeMapSha256: base.runtimeMapSha256,
  gameSourceMapSha256: base.gameSourceMapSha256, productionLimitsChanged: false,
  scope: 'Instrumented checked stack spans; instrumentation can change compiler layout. Larger diagnostic guard is not production acceptance, performance or device evidence.', runs: []};
const replaceOnce = (text, before, after) => {
  assert.equal(text.split(before).length, 2, 'Diagnostic source anchor changed: ' + before);
  return text.replace(before, after);
};
try {
  for (const [file, hash] of Object.entries(lock.files)) {
    const bytes = read(path.join(upstream, file)); assert.equal(sha256(bytes), hash);
    fs.writeFileSync(path.join(copiedUpstream, file), bytes, {flag: 'wx'});
  }
  const runtimeFile = path.join(copiedUpstream, 'quickjs-amalgam.c');
  let runtime = fs.readFileSync(runtimeFile, 'utf8');
  runtime = replaceOnce(runtime, 'static inline bool js_check_stack_overflow(JSRuntime *rt, size_t alloca_size)',
    'size_t hwe_diagnostic_peak_stack = 0;\nstatic inline bool js_check_stack_overflow(JSRuntime *rt, size_t alloca_size)');
  runtime = replaceOnce(runtime, 'sp = js_get_stack_pointer() - alloca_size;',
    'sp = js_get_stack_pointer() - alloca_size;\n    if (rt->stack_top > sp && rt->stack_top - sp > hwe_diagnostic_peak_stack) hwe_diagnostic_peak_stack = rt->stack_top - sp;');
  fs.writeFileSync(runtimeFile, runtime); report.instrumentedRuntimeSha256 = sha256(runtime);
  for (const file of ['host-support.h', 'tracked-allocator.h']) {
    fs.writeFileSync(path.join(directory, file), read(path.join(root, 'experiments/embedded-js', file)), {flag: 'wx'});
  }
  let driver = read(path.join(root, 'experiments/embedded-js/session-host.c')).toString();
  driver = replaceOnce(driver, '#include "host-support.h"', '#include "host-support.h"\nextern size_t hwe_diagnostic_peak_stack;');
  driver = replaceOnce(driver, 'argc != 4', 'argc != 5');
  driver = replaceOnce(driver, 'JS_SetMaxStackSize(runtime, 256 * 1024);', 'JS_SetMaxStackSize(runtime, (size_t)strtoull(argv[4], NULL, 10));');
  driver = replaceOnce(driver, 'return code;', 'fprintf(stderr, "{\\"instrumentedPeakStackBytes\\":%zu}\\n", hwe_diagnostic_peak_stack);\n    return code;');
  const source = path.join(directory, 'driver.c'); fs.writeFileSync(source, driver, {flag: 'wx'});
  report.instrumentedDriverSha256 = sha256(driver);
  const buildDir = path.join(directory, 'build'); fs.mkdirSync(buildDir);
  const built = buildEmbeddedExecutable(buildDir, copiedUpstream, source, 'stack-driver');
  Object.assign(report, {compiler: built.compilerBanner, buildCommands: built.commands, binarySha256: sha256(fs.readFileSync(built.binary))});
  const content = path.join(directory, 'input.json'), requests = path.join(directory, 'requests.jsonl');
  fs.writeFileSync(content, read(path.join(course, 'input.json')), {flag: 'wx'});
  fs.writeFileSync(requests, read(path.join(course, 'requests.jsonl')), {flag: 'wx'});
  for (const {label, bundle, node} of fixtures) {
    const diagnosticBundle = path.join(directory, label + '.js');
    fs.writeFileSync(diagnosticBundle, 'Error.stackTraceLimit=64;\n' + bundle.toString(), {flag: 'wx'});
    for (const limitBytes of label === 'original' ? [262144, 524288, 65536] : [262144, 524288]) {
      const stem = path.join(directory, label + '-' + limitBytes);
      const output = fs.openSync(stem + '.jsonl', 'wx'), errors = fs.openSync(stem + '.txt', 'wx'); let result;
      try {
        result = spawnSync(built.binary, [diagnosticBundle, content, requests, String(limitBytes)], {
          cwd: directory, env: built.env, windowsHide: true, stdio: ['ignore', output, errors], timeout: 180000,
        });
      } finally {fs.closeSync(output); fs.closeSync(errors);}
      assert(!result.error, result.error?.message); assert.equal(result.signal, null);
      const log = fs.readFileSync(stem + '.txt', 'utf8').trim().split(/\r?\n/);
      const metrics = JSON.parse(log.at(-2)), stack = JSON.parse(log.at(-1));
      const run = {label, limitBytes, status: result.status, metrics, ...stack,
        inputBundleSha256: sha256(bundle), diagnosticBundleSha256: sha256(fs.readFileSync(diagnosticBundle)),
        outputSha256: sha256(fs.readFileSync(stem + '.jsonl')), logSha256: sha256(fs.readFileSync(stem + '.txt'))};
      report.runs.push(run); writeJSON(path.join(directory, 'verification.json'), report);
      assert.equal(metrics.liveRequestedBytesAfterDispose, 0); assert.equal(metrics.liveBlocksAfterDispose, 0);
      assert(Number.isSafeInteger(stack.instrumentedPeakStackBytes) && stack.instrumentedPeakStackBytes > 0);
      if (result.status === 0) {
        assert.notEqual(limitBytes, 65536, 'Low-stack negative control unexpectedly passed');
        const values = fs.readFileSync(stem + '.jsonl', 'utf8').trim().split(/\r?\n/).map(JSON.parse);
        assert.equal(metrics.completedRequests, 33); assert.equal(values.length, 33);
        run.comparison = compareAttackCourse(values.slice(0, 32), node, true);
        assert(stack.instrumentedPeakStackBytes <= limitBytes);
      } else {
        assert.equal(result.status, 2); assert.notEqual(limitBytes, 524288, 'Diagnostic ceiling insufficient');
        assert.match(log.join('\n'), /RangeError: Maximum call stack size exceeded/);
        assert(metrics.completedRequests < 33);
        run.stackGuardDetected = true;
      }
      console.log({label, limitBytes, status: result.status, ...stack});
    }
  }
  report.passed = true;
} catch (error) {
  report.error = {message: error.message, stack: error.stack}; throw error;
} finally {
  for (const [file, hash] of inputs) assert.equal(sha256(fs.readFileSync(file)), hash, file);
  report.inputsUnchanged = true; report.inputs = Object.fromEntries(inputs);
  writeJSON(path.join(directory, 'verification.json'), report);
  console.log({directory, passed: report.passed});
}
