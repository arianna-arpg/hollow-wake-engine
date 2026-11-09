// Verify retained native compatibility inputs without duplicating shared content.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {gzipSync,gunzipSync} from 'node:zlib';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const report=JSON.parse(fs.readFileSync(new URL('./native.json',import.meta.url)));
const delta=JSON.parse(gunzipSync(fs.readFileSync(new URL('./native-input-delta.json.gz',import.meta.url))));
const baseBytes=fs.readFileSync(new URL('../../'+delta.base,import.meta.url));
assert.equal(sha(baseBytes),delta.baseSha256);assert.equal(delta.baseSha256,report.frozenCapsuleSha256);
const base=JSON.parse(gunzipSync(baseBytes)),inputs={};
for(const file of delta.order){
 const text=Object.hasOwn(delta.files,file)?delta.files[file]:base[file];assert.equal(typeof text,'string');
 assert.equal(sha(text),report.inputs[file].sha256,file);assert.equal(Buffer.byteLength(text),report.inputs[file].bytes,file);inputs[file]=text;
}
assert.deepEqual(Object.keys(inputs),Object.keys(report.inputs));
// With the recorded Node/zlib toolchain this also reproduces the full capsule
// archive; per-file byte/hash checks remain the portable content proof.
const compressed=gzipSync(JSON.stringify(inputs),{level:9});
console.log({passed:true,files:delta.order.length,reconstructedBytes:compressed.length,archiveSha256:sha(compressed),recordedArchiveMatches:sha(compressed)===report.inputsSha256});
