import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';
import {root,sha256} from '../../../scripts/reference-utils.mjs';
import {verifyCStringReportV2} from './verify-cstring-v2.mjs';
const base=path.join(root,'evidence/native-cstring-cleanup');
const read=file=>JSON.parse(fs.readFileSync(file)),unpack=file=>JSON.parse(gunzipSync(fs.readFileSync(file)));
function files(directory,manifest){for(const[file,hash]of Object.entries(manifest.files)){
 assert(!path.isAbsolute(file)&&!file.includes('..'));assert.equal(sha256(fs.readFileSync(path.join(directory,file))),hash,file);
}}
const hosted=path.join(base,'qualification-v2/hosted'),acceptance=read(path.join(hosted,'acceptance.json'));
assert.equal(acceptance.contractRevision,2);assert.equal(acceptance.productionAdopted,false);assert.equal(acceptance.deviceQualified,false);files(hosted,acceptance);
const workflow=read(path.join(hosted,'workflow.json'));assert.equal(workflow.headSha,acceptance.producerCommit);
assert.deepEqual(unpack(path.join(hosted,'workflow-capture.json.gz')),workflow);
assert.equal(workflow.headSha,'64e2f113c9988df0173b92642013630c3049f045');assert.equal(workflow.url,acceptance.workflow);
assert.equal(workflow.conclusion,'success');assert.equal(workflow.status,'completed');assert.equal(workflow.jobs.length,2);
assert(workflow.jobs.every(job=>job.conclusion==='success'));
const controls=read(path.join(hosted,'controls.json'));
for(const [platform,name,count]of [['win32','Windows',16],['linux','Linux',19]]){
 const report=unpack(path.join(hosted,name.toLowerCase()+'.json.gz'));assert.equal(report.platform,platform);
 assert.deepEqual(verifyCStringReportV2(report,fs.readFileSync(path.join(hosted,name.toLowerCase()+'.raw.json.gz'))),acceptance.summaries[name]);
 assert(controls[name].passed&&controls[name].restoredControl);assert.equal(controls[name].controls,count);assert.equal(new Set(controls[name].names).size,count);
}
const native=path.join(base,'native-followthrough'),finding=read(path.join(native,'finding.json'));files(native,finding);
assert.equal(finding.exploratory,true);assert.equal(finding.productionAdopted,false);assert.equal(finding.deviceQualified,false);
const capsule=fs.readFileSync(path.join(native,'inputs.json.gz')),inputs=JSON.parse(gunzipSync(capsule));
const course=JSON.parse(inputs['courses.json']).flatMap(item=>item.rows);assert.equal(course.length,579);
for(const revision of ['r1','r2']){
 const report=unpack(path.join(native,revision+'.json.gz')),packed=fs.readFileSync(path.join(native,revision+'.raw.json.gz'));
 assert(report.cleaned&&report.inputsUnchanged&&report.upstreamUnchanged&&report.preparedUnchanged);assert.equal(report.capsuleSha256,sha256(capsule));
 assert.equal(sha256(packed),report.rawSha256);const raw=JSON.parse(gunzipSync(packed));
 for(const[file,hash]of Object.entries(report.sources))assert.equal(sha256(fs.readFileSync(path.join(root,file))),hash,file);
 if(revision==='r1'){assert.equal(report.passed,false);assert.match(report.failure,/5 !== 8/);continue;}
 assert.equal(report.passed,true);assert.deepEqual(report.rows.map(row=>row.variant),['original','patched']);
 for(const row of report.rows){
  assert.deepEqual(row.consumers.map(consumer=>consumer.name),['cpp','dotnet']);
  for(const consumer of row.consumers){
   const captured=raw[row.variant][consumer.name];assert.deepEqual(captured.process,{status:0,signal:null,error:null});
   assert.deepEqual(JSON.parse(captured.stdout),consumer.stats);
   assert(consumer.stats.passed&&consumer.stats.requests===579&&consumer.stats.liveBytesAfterDispose===0&&consumer.stats.liveBlocksAfterDispose===0);
   assert.deepEqual(captured.replies.trim().split(/\r?\n/).map(line=>JSON.parse(line)),course.map(row=>row.reply));
  }
  const memory=raw[row.variant].lowMemory;assert.equal(memory.status,0);assert.equal(memory.error,null);assert.equal(memory.signal,null);
  assert.deepEqual(JSON.parse(memory.stdout),row.memory.rows);assert.equal(row.memory.rows.length,2);
  const [low,roomy]=row.memory.rows;assert.equal(low.heapMiB,32);assert.equal(roomy.heapMiB,48);
  assert.equal(low.error,"AssertionError(('submit', 4))");assert.equal(low.failedMetrics.poisoned,1);assert.equal(low.failedMetrics.pending,0);
  assert.equal(low.retryStatus,5);assert.equal(low.retryLength,0);assert.equal(low.copyStatus,8);assert.equal(low.copyWritten,0);
  assert.deepEqual(low.afterRejectedRetry,low.failedMetrics);assert.equal(low.destroyStatus,row.variant==='original'?11:0);
  assert.equal(low.remainingBytes,row.variant==='original'?86410:0);
  assert(roomy.coursePassed&&roomy.commands===579&&roomy.destroyStatus===0&&roomy.remainingBytes===0);
 }
}
console.log({passed:true,hosted:['Windows','Linux'],nativeCallers:['C++','C#'],commandsPerCaller:579,failedHostDisposes:true,productionAdopted:false});
