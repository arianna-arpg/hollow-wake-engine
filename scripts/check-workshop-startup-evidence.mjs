import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {root,sha256} from './reference-utils.mjs';
import path from 'node:path';

const dir=path.join(root,'evidence/workshop-startup');
const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name)));
const summary=read('summary.json'),report=read('windows.json'),failure=read('preparation-failure.json');
assert(summary.passed && report.passed && report.cleaned && report.replyMutationRejected);
assert.equal(report.rows.length,15);
for(const [file,hash] of Object.entries(summary.files))assert.equal(sha256(fs.readFileSync(path.join(dir,file))),hash,file);
const rawBytes=fs.readFileSync(path.join(dir,'windows-raw.json.gz'));
assert.equal(sha256(rawBytes),report.rawSha256);
const raw=JSON.parse(gunzipSync(rawBytes));
for(const [file,hash] of Object.entries(report.sources)){
 assert.equal(sha256(fs.readFileSync(path.join(root,file))),hash,file);
 if(Object.hasOwn(raw.sourceText,file))assert.equal(sha256(raw.sourceText[file]),hash,file);
}
assert(!failure.passed && failure.cleaned && failure.rows.length===0 && failure.failure.includes('ENOENT'));
assert.deepEqual(failure.sources,report.sources);
assert.equal(new Set(report.rows.map(row=>row.responseSha256)).size,1);
assert.deepEqual(report.rows.map(row=>row.mode),report.schedule);
for(const method of summary.methods){
 const rows=report.rows.filter(row=>row.mode===method.mode);assert.equal(rows.length,3);
 for(const row of rows){
  assert.equal(row.closedBytes,0);assert.equal(row.requests,58);assert(row.peakBytes<=32*1024*1024);
  for(const key of ['beforeBytes','afterBytes','endBytes','peakBytes'])assert.equal(row[key],method[key]);
 }
}
console.log({passed:true,runs:report.rows.length,scope:'Research evidence integrity; shipping packages unchanged'});
