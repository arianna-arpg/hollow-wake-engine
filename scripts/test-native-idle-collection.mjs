import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createInterface} from 'node:readline';
import {gzipSync} from 'node:zlib';
import {execFileSync, spawnSync} from 'node:child_process';
import {buildEmbeddedLibrary} from './embedded-native-tools.mjs';
import {root, sha256} from './reference-utils.mjs';

const args = process.argv.slice(2);
assert.equal(args.length, 8, '--amalgam-dir <pinned-source> --package <public-gameplay.tgz> --python <python> --output <fresh-report.json>');
assert.deepEqual([args[0], args[2], args[4], args[6]], ['--amalgam-dir', '--package', '--python', '--output']);
const upstream = fs.realpathSync(args[1]), archive = fs.realpathSync(args[3]), python = args[5], output = path.resolve(args[7]);
const rawOutput = output + '.raw.json.gz';
assert(!fs.existsSync(output) && !fs.existsSync(rawOutput), 'Use fresh output paths');
assert(fs.statSync(path.dirname(output)).isDirectory());
const hashFile = file => sha256(fs.readFileSync(file));
const sources = ['scripts/test-native-idle-collection.mjs', 'scripts/embedded-native-tools.mjs', 'scripts/native-tools.mjs',
  'scripts/reference-utils.mjs', 'experiments/embedded-js/native/hwe_embedded.c', 'experiments/embedded-js/native/hwe_embedded.h',
  'experiments/embedded-js/native/consumer.cpp', 'experiments/embedded-js/native/collection-consumer.cpp',
  'experiments/embedded-js/native/collection-state.c',
  'experiments/embedded-js/tracked-allocator.h', 'experiments/embedded-js/host-source-lock.json',
  'experiments/embedded-js/measurements/startup-inputs.py', 'evidence/unity-workshop/acceptance.json',
  'evidence/unity-workshop/replay.json.gz'];
const hashes = Object.fromEntries(sources.map(file => [file, hashFile(path.join(root, file))]));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'experiments/embedded-js/host-source-lock.json')));
for (const [file, hash] of Object.entries(lock.files)) assert.equal(hashFile(path.join(upstream, file)), hash, file);
const packageSha256 = hashFile(archive);
assert.equal(packageSha256, 'ea56ce53d14a5c0b669ba1dcc05e96e90ea768994ac682e6ec54c5fd38577c76');
const work = fs.mkdtempSync(path.join(root, '.artifacts/native-idle-collection-'));
const report = {schemaVersion: 1, passed: false, startedAt: new Date().toISOString(), sources: hashes, packageSha256,
  upstream: lock, environment: {platform: process.platform, arch: process.arch, node: process.version,
    os: os.release(), cpu: os.cpus()[0]?.model},
  scope: 'Explicit public-ABI idle collection and frozen workshop replay. No automatic integration, timing, device or engine-package claim.',
  repetitions: 8, rows: [], faults: []};
const raw = {sources: Object.fromEntries(sources.filter(file => !file.endsWith('.gz')).map(file =>
  [file, fs.readFileSync(path.join(root, file), 'utf8')])), runs: []};
let failure;
try {
  execFileSync(python, ['-I', '-B', path.join(root, 'experiments/embedded-js/measurements/startup-inputs.py'), archive, work],
    {cwd: root, windowsHide: true, stdio: 'pipe', timeout: 30000});
  const requestsFile = path.join(work, 'requests.jsonl');
  const requests = fs.readFileSync(requestsFile, 'utf8').trimEnd().split('\n');
  assert.equal(requests.length, 58);
  fs.appendFileSync(requestsFile, (requests.slice(2).join('\n') + '\n').repeat(report.repetitions - 1));
  const expected = fs.readFileSync(path.join(work, 'expected.jsonl'), 'utf8').trim().split(/\r?\n/).map(JSON.parse);
  assert.equal(expected.length, 56);
  const build = path.join(work, 'build'); fs.mkdirSync(build);
  const built = buildEmbeddedLibrary(build, upstream, {collectionConsumer: true});
  report.compiler = built.compilerBanner; report.commands = built.commands; report.exports = built.exportedFunctions;
  report.librarySha256 = hashFile(built.library); report.consumerSha256 = hashFile(built.native);
  const sourceFile = path.join(root, 'experiments/embedded-js/native/hwe_embedded.c');
  const oldObject = path.join(build, process.platform === 'win32' ? 'hwe_embedded.obj' : 'hwe_embedded.o');
  raw.buildLogs = {};
  const compile = (dir, commands) => {
    const file = path.join(dir, 'build.txt'), log = fs.openSync(file, 'wx');
    try {for (const c of commands) execFileSync(c.command, c.args, {cwd: dir, env: built.env,
      windowsHide: true, stdio: ['ignore', log, log], timeout: 180000});}
    finally {fs.closeSync(log); raw.buildLogs[path.basename(dir)] = fs.readFileSync(file, 'utf8');}
  };
  const stateProbe = (label, implementation = sourceFile) => {
    const dir = path.join(work, label); fs.mkdirSync(dir);
    const file = path.join(dir, 'collection-state.c'), object = path.join(dir, path.basename(oldObject));
    const binary = path.join(dir, process.platform === 'win32' ? 'state.exe' : 'state');
    const source = fs.readFileSync(path.join(root, 'experiments/embedded-js/native/collection-state.c'), 'utf8')
      .replace('#include "hwe_embedded.h"', '#include "' + path.join(root, 'experiments/embedded-js/native/hwe_embedded.h').replaceAll('\\', '/') + '"')
      .replace('#include "hwe_embedded.c"', '#include "' + implementation.replaceAll('\\', '/') + '"');
    fs.writeFileSync(file, source, {flag: 'wx'});
    const commands = [built.commands[0], built.commands[2]].map(c => ({command: c.command, args: c.args
      .filter(a => a !== '/LD' && a !== '-shared' && a !== '-Wl,-z,defs,-z,relro,-z,now').map(a =>
        a.replaceAll(sourceFile, file).replaceAll(oldObject, object).replaceAll(built.library, binary))}));
    compile(dir, commands);
    const result = spawnSync(binary, [], {cwd: dir, env: built.env, windowsHide: true, encoding: 'utf8', timeout: 60000});
    assert(!result.error, result.error?.message); assert.equal(result.signal, null);
    raw.runs.push({state: label, status: result.status, stdout: result.stdout, stderr: result.stderr, commands});
    return result;
  };
  const injected = stateProbe('state-baseline');
  assert.equal(injected.status, 0, injected.stderr);
  report.stateInjections = JSON.parse(injected.stdout); assert(report.stateInjections.passed && report.stateInjections.cases === 6);
  report.inputs = Object.fromEntries(['bundle.js', 'content.json', 'requests.jsonl', 'expected.jsonl'].map(file =>
    [file, hashFile(path.join(work, file))]));
  const verify = async file => {
    let count = 0;
    const input = fs.createReadStream(file), lines = createInterface({input, crlfDelay: Infinity});
    try {
      for await (const line of lines) {
        const reply = JSON.parse(line);
        if (count < 2) assert.equal(reply.ok, true, 'Configuration');
        else assert.deepEqual(reply, expected[(count - 2) % expected.length], 'Frozen original workshop reply ' + count);
        count++;
      }
    } finally {lines.close(); input.destroy();}
    assert.equal(count, 2 + expected.length * report.repetitions);
  };
  const run = (library, mode) => {
    const reply = path.join(work, 'replies.jsonl');
    const result = spawnSync(built.native, [library, path.join(work, 'bundle.js'), path.join(work, 'content.json'),
      requestsFile, reply, mode], {cwd: work, env: built.env, windowsHide: true, encoding: 'utf8', timeout: 180000,
      maxBuffer: 1024 * 1024});
    return {result, reply};
  };
  // Balanced ordering measures retained bytes only; elapsed times are not evidence.
  for (const mode of ['none', 'configured', 'every-release', 'every-release', 'configured', 'none']) {
    const {result, reply} = run(built.library, mode);
    raw.runs.push({mode, status: result.status, stdout: result.stdout, stderr: result.stderr});
    assert(!result.error, result.error?.message); assert.equal(result.signal, null); assert.equal(result.status, 0, result.stderr);
    await verify(reply);
    const row = JSON.parse(result.stdout);
    assert(row.passed && row.contracts); assert.equal(row.requests, 450);
    assert.equal(row.collections, mode === 'none' ? 0 : mode === 'configured' ? 1 : row.requests);
    assert.equal(row.closedBytes, 0); assert.equal(row.closedBlocks, 0); assert(row.peakBytes <= 32 * 1024 * 1024);
    row.mode = mode; row.replySha256 = hashFile(reply); report.rows.push(row); fs.unlinkSync(reply);
    console.log(JSON.stringify(row));
  }
  assert.equal(new Set(report.rows.map(row => row.replySha256)).size, 1);
  for (const mode of ['none', 'configured', 'every-release']) {
    const rows = report.rows.filter(row => row.mode === mode);
    assert.deepEqual(rows[0], rows[1], 'Repeatable tracked allocations');
  }
  const configured = report.rows.find(row => row.mode === 'configured'), unchanged = report.rows[0];
  assert(configured.afterBytes < configured.beforeBytes, 'Configuration garbage reclaimed');
  // Record a regression too; do not turn a workload observation into a speed gate.
  report.peakDeltaBytes = configured.peakBytes - unchanged.peakBytes;
  report.endDeltaBytes = configured.endBytes - unchanged.endBytes;
  const source = fs.readFileSync(sourceFile, 'utf8'), begin = source.indexOf('int32_t HWE_JS_CALL hwe_js_collect_v1(');
  const end = source.indexOf('int32_t HWE_JS_CALL hwe_js_cancel_v1(', begin), collector = source.slice(begin, end);
  assert(begin > 0 && end > begin);
  for (const [name, mutate, expectedFailure, stateOnly] of [
    ['no-collection', text => text.replace('JS_RunGC(host->runtime);', '/* deliberate missing collection */'),
      'Explicit collection reclaims unreachable cycle'],
    ['pending-admitted', text => text.replace('else if (host->response)', 'else if (0)'),
      'Pending response collection refuses without mutation'],
    ['async-ignored', text => text.replaceAll('host->async_violation || JS_IsJobPending(host->runtime) || JS_HasException(host->context)', '0'),
      'Collection rejects existing cleanup'],
    ['cancellation-ignored', text => text.replaceAll('atomic_load_explicit(&host->cancellation, memory_order_relaxed)', '0'),
      'Idle collection respects sticky cancellation'],
    ['prior-exception-ignored', text => text.replace(' || JS_HasException(host->context)', ''),
      'Reject pending exception before collection', true],
    ['gc-exception-ignored', text => text.replace('JS_IsJobPending(host->runtime) || JS_HasException(host->context) ||',
      'JS_IsJobPending(host->runtime) ||'), 'Reject post-collection exception without job', true],
    ['accounting-cancel-ignored', text => text.replace('if (status == HWE_JS_OK && atomic_load_explicit(&host->cancellation, memory_order_relaxed))',
      'if (0)'), 'Observe cancellation during accounting', true]
  ]) {
    const changed = mutate(collector); assert.notEqual(changed, collector, name);
    const dir = path.join(work, name); fs.mkdirSync(dir);
    const mutated = (source.slice(0, begin) + changed + source.slice(end))
      .replace('#include "hwe_embedded.h"', '#include "' + path.join(root, 'experiments/embedded-js/native/hwe_embedded.h').replaceAll('\\', '/') + '"')
      .replace('#include "../tracked-allocator.h"', '#include "' + path.join(root, 'experiments/embedded-js/tracked-allocator.h').replaceAll('\\', '/') + '"');
    const file = path.join(dir, 'hwe_embedded.c'); fs.writeFileSync(file, mutated, {flag: 'wx'});
    const library = path.join(dir, path.basename(built.library));
    const ownObject = path.join(dir, path.basename(oldObject));
    const commands = [built.commands[0], built.commands[2]].map(c => ({command: c.command, args: c.args.map(a =>
      a.replaceAll(sourceFile, file).replaceAll(oldObject, ownObject).replaceAll(built.library, library))}));
    let result;
    if (stateOnly) result = stateProbe(name + '-state', file);
    else {compile(dir, commands); result = run(library, 'configured').result;}
    assert(!result.error, result.error?.message); assert.equal(result.signal, null);
    assert.equal(result.status, 1, name); assert(result.stderr.includes(expectedFailure), result.stderr);
    report.faults.push({name, rejected: true, expectedFailure, mutatedSourceSha256: sha256(mutated)});
    raw.runs.push({fault: name, status: result.status, stdout: result.stdout, stderr: result.stderr, commands});
  }
  if (process.platform === 'linux') {
    const dir = path.join(work, 'sanitized'); fs.mkdirSync(dir);
    const sanitized = buildEmbeddedLibrary(dir, upstream, {collectionConsumer: true, sanitize: true});
    const reply = path.join(work, 'sanitized-replies.jsonl');
    const result = spawnSync(sanitized.native, [sanitized.library, path.join(work, 'bundle.js'), path.join(work, 'content.json'),
      requestsFile, reply, 'configured'], {cwd: dir, env: {...sanitized.env,
        ASAN_OPTIONS: 'detect_leaks=1:halt_on_error=1', UBSAN_OPTIONS: 'halt_on_error=1:print_stacktrace=1'},
      windowsHide: true, encoding: 'utf8', timeout: 180000, maxBuffer: 1024 * 1024});
    raw.runs.push({sanitized: true, status: result.status, stdout: result.stdout, stderr: result.stderr, commands: sanitized.commands});
    assert(!result.error, result.error?.message); assert.equal(result.signal, null); assert.equal(result.status, 0, result.stderr);
    await verify(reply); report.sanitizers = JSON.parse(result.stdout); assert(report.sanitizers.passed);
    report.sanitizers.replySha256 = hashFile(reply); assert.equal(report.sanitizers.replySha256, report.rows[0].replySha256);
  }
  report.passed = true;
} catch (error) {failure = error; report.failure = String(error.stack ?? error);}
finally {
  try {
    for (const [file, hash] of Object.entries(hashes)) assert.equal(hashFile(path.join(root, file)), hash, file);
    assert.equal(hashFile(archive), packageSha256);
    for (const [file, hash] of Object.entries(lock.files)) assert.equal(hashFile(path.join(upstream, file)), hash, file);
    const log = path.join(work, 'build/build.txt'); if (fs.existsSync(log)) raw.build = fs.readFileSync(log, 'utf8');
  } catch (error) {failure ??= error; report.failure = String(error.stack ?? error); report.passed = false;}
  finally {
    const resolved = fs.realpathSync(work);
    assert(resolved.startsWith(fs.realpathSync(path.join(root, '.artifacts')) + path.sep));
    fs.rmSync(resolved, {recursive: true}); report.cleaned = !fs.existsSync(resolved);
  }
  report.finishedAt = new Date().toISOString();
  const bytes = gzipSync(JSON.stringify(raw)); report.rawSha256 = sha256(bytes);
  fs.writeFileSync(rawOutput, bytes, {flag: 'wx'});
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
}
if (failure) throw failure;
console.log(JSON.stringify({passed: true, runs: report.rows.length, faults: report.faults.length, cleaned: report.cleaned, output}));
