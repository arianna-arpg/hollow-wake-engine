import assert from 'node:assert/strict';
export const sustainBenchmarkPlan={schemaVersion:2,seed:0x51a8,populations:[8,64,256],
  workloads:['idle','siphon','share','sparse','bond','trees','combined'],auditHits:3,warmup:1500,batch:2000,rounds:12,
  order:[['original','previous','current'],['current','previous','original'],['previous','original','current'],['current','original','previous'],['original','current','previous'],['previous','current','original']],
  scope:'Warm full resolver with native healing, cues and equal per-hit life/tree/text resets. Read-only hit/heal counters and RNG counting remain inside timing. IPC, snapshot creation, assertions on snapshots and explicit GC are outside timing. Three isolated workers; six orders repeated twice. Coalesced cues persist, simulation time is fixed. Retained heap is not allocation volume. Not whole-frame or device acceptance.'};
const close=(actual,expected,label)=>assert(Number.isFinite(actual)&&Math.abs(actual-expected)<=1e-8*Math.max(1,Math.abs(expected)),label+': '+actual+' versus '+expected);
export function checkSustainBenchmark(check,name,population,count,audit=false) {
  assert.equal(check.hits,count,'benchmark must execute every hit');
  assert(check.unitDamage>0&&check.unitDamage<200,'known nonlethal damage range');
  close(check.damage,check.unitDamage*count,'damage sum');
  assert(Number.isSafeInteger(check.draws)&&check.draws>0,'random stream must be observed');
  assert.equal(check.draws%count,0,'fixed workload random schedule');
  assert.equal(check.heals.length,population);assert.equal(check.last.actors.length,population);
  assert.deepEqual(check.last.order,Array.from({length:population},(_,i)=>i+1),'borrowed actor order');
  const expectedOrder=[],factors=Array.from({length:population},()=>[]);
  if(name==='siphon'||name==='combined'){factors[0].push(.5);expectedOrder.push(1);}
  if(['share','sparse','combined'].includes(name))for(let i=2;i<population;i++)if(name!=='sparse'||i%8===0){factors[i].push(.25);expectedOrder.push(i+1);}
  if(name==='bond'||name==='combined'){factors[population-1].push(.75);expectedOrder.push(population);}
  for(let i=0;i<population;i++) {
    const h=check.heals[i],a=check.last.actors[i],factor=factors[i].reduce((sum,n)=>sum+n,0),tree=i>=2&&(name==='trees'||name==='combined'&&i%4===0);
    assert.equal(h.id,i+1);assert.equal(a.id,i+1);assert.equal(h.count,factors[i].length*count,'measured recovery count for '+(i+1));
    close(h.total,check.unitDamage*factor*count,'measured healing '+(i+1));
    close(a.life,9000+(i===1?-check.unitDamage:check.unitDamage*factor),'final life '+(i+1));
    close(a.healedSince,check.unitDamage*factor,'healed ledger '+(i+1));
    const stored=Math.min(300,40+check.unitDamage);
    if(tree){close(a.stored,stored,'tree storage');close(a.radius,12*(1+.6*stored/300),'tree radius');}else{assert.equal(a.stored,null);assert.equal(a.radius,12);}
    const flow=factors[i].some(n=>n===.25||i===0&&n===.5);
    assert.equal(a.flows.length,flow?1:0,'measured resource flow count '+(i+1));
    if(flow){assert.equal(a.flows[0].source,2);assert.equal(a.flows[0].resource,'life');}
  }
  if(audit)assert.deepEqual(check.healingOrder,Array.from({length:count},()=>expectedOrder).flat(),'ordered actual healing');
  return true;
}
