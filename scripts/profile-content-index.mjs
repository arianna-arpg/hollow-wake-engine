import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {root, sha256, writeJSON} from './reference-utils.mjs';

assert.deepEqual(process.argv.slice(2, 3), ['--candidate-proof']); assert.equal(process.argv.length, 6);
assert.equal(process.argv[4], '--amalgam-dir');
const proofDirectory = fs.realpathSync(process.argv[3]);
const read = file => JSON.parse(fs.readFileSync(file)), hash = file => sha256(fs.readFileSync(file));
const lock = read(path.join(root, 'experiments/embedded-js/host-source-lock.json'));
const upstream = path.join(fs.realpathSync(process.argv[5]), 'quickjs-amalgam.c');
assert.equal(hash(upstream), lock.files['quickjs-amalgam.c']);
const native = read(path.join(proofDirectory, 'native/verification.json'));
assert(native.passed && native.inputsUnchanged);
const original = native.bundles.candidate.file, consumer = path.join(proofDirectory, 'native/consumer.exe');
assert.equal(hash(original), native.bundles.candidate.sha256);
assert.equal(hash(consumer), native.binaryHashes[consumer]); assert.equal(hash(native.library), native.librarySha256);
assert.equal(hash(native.input), native.inputSha256); assert.equal(hash(native.requests), native.requestsSha256);
const directory = fs.mkdtempSync(path.join(root, '.artifacts/content-index-diagnostic-'));
let code = fs.readFileSync(original, 'utf8');
const once = (before, after) => {assert.equal(code.split(before).length, 2, before); code = code.replace(before, after);};
// Diagnostic-only clocks and endpoint. Never used for acceptance timings or production.
once('    pools(base) {', '    pools(base) {\n      const __indexStart = Date.now();');
once('      for (const row of [...matches].sort((a, b) => a - b)) {', `      const __merged = Date.now(), __rows = [...matches], __materialized = Date.now();
      __rows.sort((a, b) => a - b);
      const __sorted = Date.now();
      for (const row of __rows) {`);
once('      return { prefix, suffix };', `      (globalThis.__indexDiagnostics ??= []).push({base:base.id,rows:__rows.length,
        mergeMs:__merged-__indexStart,materializeMs:__materialized-__merged,sortMs:__sorted-__materialized,emitMs:Date.now()-__sorted});
      return { prefix, suffix };`);
code += `\nconst __ordinaryDispatch=HollowWakeSession.dispatch;
HollowWakeSession={create:HollowWakeSession.create,dispatch(root,request){
 if(request.op==='__indexDiagnostics')return globalThis.__indexDiagnostics??[];
 return __ordinaryDispatch(root,request);
}};\n`;
const bundle = path.join(directory, 'instrumented-bundle.js'), requests = path.join(directory, 'requests.jsonl');
fs.writeFileSync(bundle, code, {flag: 'wx'});
fs.writeFileSync(requests, fs.readFileSync(native.requests, 'utf8').trimEnd() + '\n{"op":"__indexDiagnostics"}\n', {flag: 'wx'});
const output = path.join(directory, 'responses.jsonl');
const stats = execFileSync(consumer, [native.library, bundle, native.input, requests, output],
  {cwd: directory, windowsHide: true, encoding: 'utf8', timeout: 60000});
fs.writeFileSync(path.join(directory, 'consumer.json'), stats);
const values = fs.readFileSync(output, 'utf8').trim().split(/\r?\n/).map(JSON.parse), rows = values.pop();
assert.deepEqual(values, read(path.join(proofDirectory, 'native/candidate-node.json')));
assert(rows.length > 0); const metrics = JSON.parse(stats); assert(metrics.passed);
assert.equal(metrics.liveBytesAfterDispose, 0); assert.equal(metrics.liveBlocksAfterDispose, 0);
const totals = Object.fromEntries(['mergeMs', 'materializeMs', 'sortMs', 'emitMs'].map(key => [key, rows.reduce((sum, row) => sum + row[key], 0)]));
// Model the pinned source's numeric hash and final power-of-two table mask.
// The context salt and tag hash are common XOR offsets, so they change bucket
// labels but cannot change collision counts. This is a model, not native counters.
const pack = read(native.input).items, definitions = Object.values(pack.affixes);
const numberBytes = Buffer.alloc(8);
const hashModel = [...new Set(rows.map(row => row.base))].map(id => {
  const base = pack.bases[id], tags = new Set([...base.tags, base.category]);
  const indices = definitions.flatMap((affix, index) =>
    (affix.tags ? affix.tags.some(tag => tags.has(tag)) : base.affixPool !== 'explicit') ? [index] : []);
  assert.equal(indices.length, rows.find(row => row.base === id).rows);
  let tableSize = 4; while (indices.length >= tableSize * 2) tableSize *= 2;
  const buckets = new Map();
  for (const index of indices) {
    numberBytes.writeDoubleLE(index);
    const bucket = Math.imul(numberBytes.readUInt32LE(0) ^ numberBytes.readUInt32LE(4), 3163) & (tableSize - 1);
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  return {base: id, rows: indices.length, finalTableSize: tableSize, occupiedBuckets: buckets.size,
    largestBucket: Math.max(...buckets.values()), bucketCounts: [...buckets.values()].sort((a, b) => a - b)};
});
for (const [file, expected] of Object.entries(native.binaryHashes)) assert.equal(hash(file), expected);
assert.equal(hash(original), native.bundles.candidate.sha256); assert.equal(hash(native.library), native.librarySha256);
const result = {passed: true, scope: 'Coarse wall-clock instrumentation of a diagnostic copy; not optimization acceptance or a representative workload',
  directory, originalBundleSha256: hash(original), diagnosticBundleSha256: hash(bundle), scriptSha256: hash(path.join(root, 'scripts/profile-content-index.mjs')),
  exactOriginalResponses: values.length, calls: rows.length, totals, rows, nativeMetrics: metrics,
  numericHashModel: {upstreamSha256: hash(upstream), sourceFunctions: ['map_hash_key', 'map_hash_resize', 'map_find_record'], cases: hashModel}};
writeJSON(path.join(directory, 'verification.json'), result);
writeJSON(path.join(root, '.artifacts/content-index-diagnostic-latest.json'), {directory});
console.log({passed: true, directory, totals, calls: rows.length, hashModel});
