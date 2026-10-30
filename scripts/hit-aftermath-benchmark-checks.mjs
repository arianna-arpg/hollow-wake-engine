import assert from 'node:assert/strict';
export const aftermathBenchmarkPlan={schemaVersion:1,seed:0x51a8,populations:[8,64,256],workloads:['sharing','spread','splash','combined'],auditHits:3,rounds:12,
  order:[['original','previous','current'],['current','previous','original'],['previous','original','current'],['current','original','previous'],['original','current','previous'],['previous','current','original']],
  scope:'Warm whole resolver with active native damage sharing, status transplantation, splash and their combination. Actor life/status/text reset and read-only hit/RNG counters are timed equally. Snapshots, IPC and explicit GC are outside timing. Fixed simulation clock; no per-frame/world update or physical-device claim. Retained heap is not allocation volume.'};
export function aftermathBatchSize(name,population){return name==='splash'||name==='combined'?Math.max(16,Math.floor(2048/(population-1))):1000;}
const close=(a,b,label)=>assert(Number.isFinite(a)&&Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(b)),label+': '+a+' versus '+b);
export function checkAftermathBenchmark(check,name,population,count,audit=false) {
  const sharing=name==='sharing'||name==='combined',spread=name==='spread'||name==='combined',splash=name==='splash'||name==='combined';
  assert.equal(check.roots,count);assert.equal(check.hits.length,population);assert.equal(check.last.actors.length,population);
  assert(Number.isSafeInteger(check.draws)&&check.draws>0);assert.equal(check.draws%count,0,'fixed draw schedule');
  assert.deepEqual(check.last.order,Array.from({length:population},(_,i)=>i+1));
  const primary=check.hits[1].damage/count;assert(primary>0&&primary<200,'known nonlethal primary damage');
  const share=sharing?primary*.5/(population-2):0;
  for(let i=0;i<population;i++) {
    const hit=check.hits[i],actor=check.last.actors[i];assert.equal(hit.id,i+1);assert.equal(actor.id,i+1);assert.equal(actor.dead,false);
    assert.equal(hit.count,i===1||i>=2&&splash?count:0,'actual hit count '+(i+1));
    close(hit.damage,i===1?primary*count:i>=2&&splash?primary*.5*count:0,'actual hit damage '+(i+1));
    close(actor.life,9000-(i===1?primary*(sharing?.5:1):i>=2?share+(splash?primary*.5:0):0),'life after all aftermath '+(i+1));
    const carries=spread&&(i===1||i===population-1);assert.equal(actor.statuses.length,carries?1:0,'native status recipients '+(i+1));
    if(carries) {
      const status=actor.statuses[0];assert.equal(status.id,'burn');assert(check.initialStatus&&check.initialStatus.dps>0&&check.initialStatus.remaining>0);
      close(status.dps,check.initialStatus.dps*(i===1?1:.5),'native status magnitude');
      close(status.remaining,check.initialStatus.remaining*(i===1?1:.75),'native status clock');
      assert.equal(status.stacks,check.initialStatus.stacks);assert.equal(status.sourceName,i===1?'benchmark source':'Carrier Strain');
    }
  }
  if(audit){const perHit=splash?Array.from({length:population-1},(_,i)=>i+2):[2];assert.deepEqual(check.hitOrder,Array.from({length:count},()=>perHit).flat());}
  return true;
}
