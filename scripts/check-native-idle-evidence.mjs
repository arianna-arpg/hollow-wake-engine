import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {root, sha256} from './reference-utils.mjs';

const dir = path.join(root, 'evidence/native-idle-collection');
const report = JSON.parse(fs.readFileSync(path.join(dir, 'windows.json')));
assert(report.passed && report.cleaned && report.stateInjections.passed);
assert.equal(report.stateInjections.cases, 6);
assert.equal(report.rows.length, 6); assert.equal(report.faults.length, 7);
assert(report.faults.every(row => row.rejected));
const bytes = fs.readFileSync(path.join(dir, 'windows-raw.json.gz'));
assert.equal(sha256(bytes), report.rawSha256);
const raw = JSON.parse(gunzipSync(bytes));
for (const [file, hash] of Object.entries(report.sources)) {
  assert.equal(sha256(fs.readFileSync(path.join(root, file))), hash, file);
  if (Object.hasOwn(raw.sources, file)) assert.equal(sha256(raw.sources[file]), hash, file);
}
assert.equal(report.exports.length, 9); assert(report.exports.includes('hwe_js_collect_v1'));
assert.equal(new Set(report.rows.map(row => row.replySha256)).size, 1);
assert.deepEqual(report.rows.map(row => row.mode),
  ['none', 'configured', 'every-release', 'every-release', 'configured', 'none']);
for (const row of report.rows) {
  assert(row.contracts && row.passed); assert.equal(row.requests, 450);
  assert.equal(row.closedBytes, 0); assert.equal(row.closedBlocks, 0); assert(row.peakBytes <= 32 * 1024 * 1024);
  assert.equal(row.collections, row.mode === 'none' ? 0 : row.mode === 'configured' ? 1 : 450);
}
for (const mode of ['none', 'configured', 'every-release']) {
  const rows = report.rows.filter(row => row.mode === mode); assert.deepEqual(rows[0], rows[1]);
}
const unchanged = report.rows[0], configured = report.rows[1];
assert.equal(report.peakDeltaBytes, configured.peakBytes - unchanged.peakBytes);
assert.equal(report.endDeltaBytes, configured.endBytes - unchanged.endBytes);
const preparation = JSON.parse(fs.readFileSync(path.join(dir, 'preparation-failure.json')));
assert(!preparation.passed && preparation.cleaned && preparation.rows.length === 0 && preparation.failure.includes('ENOENT'));
assert.deepEqual(preparation.sources, report.sources);
const sdk = JSON.parse(fs.readFileSync(path.join(dir, 'sdk-verification.json')));
assert(sdk.passed && sdk.unchanged && sdk.results.length === 1);
assert.equal(sdk.results[0].name, 'verify'); assert.equal(sdk.results[0].exitCode, 0);
assert(!sdk.results[0].signal && !sdk.results[0].error);
for (const [file, hash] of Object.entries(sdk.sources))
  assert.equal(sha256(fs.readFileSync(path.join(root, file.replaceAll('\\', '/')))), hash, file);
const cleanup = JSON.parse(fs.readFileSync(path.join(dir, 'cleanup.json')));
assert(cleanup.passed && cleanup.foldersRemoved === 68 && cleanup.bytesRemoved === 333992810);
const hosted = JSON.parse(fs.readFileSync(path.join(dir, 'hosted-run.json')));
assert.equal(hosted.headSha, 'd478454871039cd18c8181de896ce715b757b48f');
assert.equal(hosted.conclusion, 'success'); assert.equal(hosted.jobs.length, 2);
assert(hosted.jobs.every(job => job.conclusion === 'success' && job.status === 'completed'));
for (const platform of ['linux', 'hosted-windows']) {
  const current = JSON.parse(fs.readFileSync(path.join(dir, platform + '.json')));
  const compressed = fs.readFileSync(path.join(dir, platform + '-raw.json.gz'));
  assert(current.passed && current.cleaned && current.stateInjections.passed);
  assert.equal(current.stateInjections.cases, 6);
  assert.equal(current.rows.length, 6); assert.equal(current.faults.length, 7);
  assert(current.faults.every(fault => fault.rejected));
  assert.equal(sha256(compressed), current.rawSha256);
  const observations = JSON.parse(gunzipSync(compressed));
  assert.deepEqual(current.sources, report.sources);
  for (const [file, hash] of Object.entries(current.sources))
    if (Object.hasOwn(observations.sources, file)) assert.equal(sha256(observations.sources[file]), hash, file);
  for (const row of current.rows) {
    assert(row.passed && row.contracts && row.requests === 450);
    assert.equal(row.replySha256, report.rows[0].replySha256);
    assert.equal(row.closedBytes, 0); assert.equal(row.closedBlocks, 0);
  }
  if (platform === 'linux') {
    assert(current.sanitizers.passed && current.sanitizers.contracts);
    assert.equal(current.sanitizers.requests, 450);
    assert.equal(current.sanitizers.replySha256, report.rows[0].replySha256);
    assert.equal(current.sanitizers.closedBytes, 0); assert.equal(current.sanitizers.closedBlocks, 0);
    const run = observations.runs.find(row => row.sanitized);
    assert.equal(run.status, 0); assert.equal(run.signal, null); assert(!run.error);
    assert(run.stderr.includes('collection-progress: replay 450'));
  }
}
console.log({passed: true, replays: 6, requestsEach: 450, deliberateFaults: 7,
  scope: 'Current native source, Windows/Linux contracts and Linux sanitizers; no engine or device performance claim'});
