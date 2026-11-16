import assert from 'node:assert/strict';
export function compareCombatPerformanceChecks(baseline,candidate){
 const receipt=report=>{
  assert.equal(report.passed,true);assert.equal(report.mode,'check');assert.equal(report.courses.length,8);
  assert.deepEqual(report.courses.map(c=>c.name),report.specification.courses);
  return report.courses.map(c=>{
   assert.equal(c.runs.length,1);const r=c.runs[0];
   assert.match(r.traceSha256,/^[a-f0-9]{64}$/);assert.match(r.receiptSha256,/^[a-f0-9]{64}$/);
   if(c.name.includes('-32')||c.name.includes('-128')){
    assert.equal(r.samples,report.specification.frames);assert.equal(r.warmup,report.specification.warmup);
    assert.equal(r.counters.frame,r.samples+r.warmup);assert(r.counters.accepted>0);
   }
   if(c.name==='summons-procs-32')assert(r.counters.procEvents>0&&r.counters.maxBodies>32,'Heavy course did no proc/summon work');
   return {name:c.name,trace:r.traceSha256,state:r.receiptSha256,samples:r.samples,warmup:r.warmup,counters:r.counters};
  });
 };
 assert.deepEqual(candidate.specification,baseline.specification,'Different course definitions');
 assert.equal(candidate.environment.node,baseline.environment.node,'Different Node runtime');
 assert.deepEqual(receipt(candidate),receipt(baseline),'Output, continuation or work count changed');
 return {courses:baseline.courses.length,observations:baseline.courses.reduce((n,c)=>n+c.runs[0].samples,0)};
}
