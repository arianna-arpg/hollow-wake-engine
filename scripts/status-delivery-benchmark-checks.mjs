import assert from 'node:assert/strict';
export const statusDeliveryBenchmarkPlan={schemaVersion:1,seed:0x7421,populations:[8,64,256],workloads:['siphon','recall-cached','recall-tree'],auditCasts:3,rounds:12,
  order:[['original','previous','current'],['current','previous','original'],['previous','original','current'],['current','original','previous'],['original','current','previous'],['previous','current','original']],
  scope:'Warm whole executeSkill with native status re-application on every cycle, siphon healing or stored-damage recall, actual spear creation and selective retirement. Equal native resets and read-only counts are timed. Snapshots, IPC and explicit GC are outside timing. Fixed clock; no projectile travel, per-frame/world update or physical-device claim. Retained heap is not allocation volume.'};
export function statusDeliveryBatchSize(_name,population){return Math.max(8,Math.floor(512/(population-1)));}
const close=(a,b,label)=>assert(Number.isFinite(a)&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(b)),label+': '+a+' versus '+b);
export function checkStatusDeliveryBenchmark(check,name,population,count) {
  const siphon=name==='siphon',tree=name==='recall-tree',donors=population-1;
  assert.equal(check.roots,count);assert.equal(check.last.actors.length,population);
  assert(Number.isSafeInteger(check.draws)&&check.draws>=0);assert.equal(check.draws%count,0,'fixed draw schedule after cache prime');
  assert.deepEqual(check.last.order,Array.from({length:population},(_,i)=>i+1));
  assert.equal(check.launches,siphon?0:donors*count,'actual native projectile creation');
  assert.equal(check.retired,tree?donors*count:0,'exact-source retirement');
  for(let i=0;i<population;i++) {
    const actor=check.last.actors[i];assert.equal(actor.id,i+1);assert.equal(actor.dead,false);
    close(actor.life,i===0?(siphon?Math.min(10000,9000+8*donors):9000):siphon?9000:9000-100*(tree?1.8:1.2),'life '+(i+1));
    assert.equal(actor.statuses.length,siphon&&i===0?1:0,'status transfer and removal '+(i+1));
    if(siphon&&i===0){const status=actor.statuses[0];assert.equal(status.id,'burn');assert(status.dps>0&&status.remaining>0);assert.equal(status.sourceName,'Draw Corruption');}
  }
  assert.equal(check.last.spearCount,siphon?0:donors);
  assert.equal(check.last.spearInstances,siphon?0:tree?donors:1,'native cache versus per-occurrence tree identity');
  assert.deepEqual(check.last.spearPhysical,Array.from({length:siphon?0:donors},()=>tree?20:50));
  assert.equal(check.last.remainingProjectiles,siphon||tree?0:donors);
  assert.equal(check.last.ordinaryCache,!siphon&&!tree);
  return true;
}
