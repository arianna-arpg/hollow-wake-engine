import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync,gzipSync} from 'node:zlib';
import {verifyCStringRowsV2,verifyCStringReportV2} from './verify-cstring-v2.mjs';
const args=process.argv.slice(2);assert.equal(args.length,2);assert.equal(args[0],'--report');
const report=JSON.parse(fs.readFileSync(args[1])),packed=fs.readFileSync(args[1]+'.raw.json.gz'),raw=JSON.parse(gunzipSync(packed));
verifyCStringReportV2(report,packed);
const controls=[];
function reject(name,mutate){
  const changed=structuredClone(report),logs=structuredClone(raw);
  mutate(changed,logs);
  // Re-encode changed cases so faults must be detected semantically, not just
  // by disagreement between the receipt and its raw observations.
  for(const row of changed.rows)if(logs[row.variant])logs[row.variant].stdout=row.cases.map(test=>JSON.stringify(test)).join('\n')+'\n';
  assert.throws(()=>verifyCStringRowsV2(changed,logs),undefined,name);controls.push(name);
}
const row=(report,name)=>report.rows.find(item=>item.variant===name);
reject('missing-case',r=>row(r,'patched-cold').cases.pop());
reject('duplicate-case',r=>row(r,'patched-cold').cases[1]=row(r,'patched-cold').cases[0]);
reject('altered-initial-byte',r=>row(r,'patched-cold').cases.find(test=>test.case==='ascii').first.hex='62'.repeat(4096));
reject('altered-retry-byte',r=>row(r,'patched-cold').cases.find(test=>test.case==='ascii').retry.hex='62'.repeat(4096));
reject('shared-invalid-initial-byte',r=>{for(const name of ['original-cold','patched-cold'])row(r,name).cases.find(test=>test.case==='ascii').first.hex='62'.repeat(4096);});
reject('silent-candidate-retry-error',r=>{
  const test=row(r,'patched-cold').cases.find(test=>test.case==='object');
  test.retry={failed:1,length:0,terminated:0,hex:'',errorTag:-1,messageString:1,messageHex:'626164'};test.retryValid=0;
});
reject('shared-warm-retry-error',r=>{for(const name of ['original-warm','patched-warm']){
  const test=row(r,name).cases.find(test=>test.case==='object');
  test.retry={failed:1,length:0,terminated:0,hex:'',errorTag:-1,messageString:1,messageHex:'626164'};test.retryValid=0;
}});
reject('retained-candidate-byte',r=>{const test=row(r,'patched-cold').cases[0];test.liveBytes=1;test.liveBlocks=1;test.passed=0;});
reject('missing-original-leak-control',r=>{for(const test of row(r,'original-cold').cases){test.liveBytes=0;test.liveBlocks=0;test.passed=1;}});
reject('nonzero-failed-length',r=>row(r,'patched-cold').cases.find(test=>test.first.failed).first.length=1);
reject('wrong-nul-termination',r=>row(r,'patched-cold').cases.find(test=>!test.first.failed).first.terminated=0);
reject('success-status-hidden',r=>row(r,'patched-cold').status=1);
reject('unexpected-diagnostic',(_,logs)=>logs['patched-cold'].stderr='unexpected runtime error\n');
reject('process-error',r=>row(r,'patched-cold').error='timeout');
if(report.platform==='linux'){
  reject('sanitizer-disabled',r=>row(r,'patched-sanitized-cold').sanitizers.ASAN_OPTIONS='detect_leaks=0');
  reject('sanitizer-flags-removed',r=>row(r,'patched-sanitized-cold').commands=[]);
  reject('untracked-original-leak',(_,logs)=>logs['original-sanitized-cold'].stderr=logs['original-sanitized-cold'].stderr.replace(/(\d+) byte\(s\) leaked/,(_,bytes)=>(Number(bytes)+1)+' byte(s) leaked'));
}
const changedSource=structuredClone(report);changedSource.sources['experiments/embedded-js/patches/cstring-contracts-v2.c']='0'.repeat(64);
assert.throws(()=>verifyCStringReportV2(changedSource,packed));controls.push('source-drift');
assert.throws(()=>verifyCStringReportV2(report,gzipSync('{}')));controls.push('raw-drift');
verifyCStringReportV2(report,packed);
console.log(JSON.stringify({passed:true,controls:controls.length,names:controls,restoredControl:true},null,2));
