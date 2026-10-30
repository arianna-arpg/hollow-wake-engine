import assert from 'node:assert/strict';

// Positive checks ensure named scenarios actually exercise the intended native outcomes.
export function assertHitLandingObservations(data) {
  const row=name=>{const r=data.rows.find(r=>r.name===name);assert(r,name);return r;},events=(r,kind)=>r.events.filter(e=>e.kind===kind),outcome=r=>events(r,'applied-hit')[0]?.args[2];
  const errors=data.rows.flatMap(r=>r.steps.filter(s=>!s.error.$undefined).map(s=>[r.name,s.error.message]));
  assert.deepEqual(errors,[['packet-callback-failure','packet observer fault'],['deed-callback-failure','deed observer fault'],['evade-heal-failure','evade heal observer fault'],['block-proc-failure','block proc observer fault'],['pool-bank-failure','pool observer fault']]);
  assert.equal(data.rows.length,112);assert.equal(new Set(data.rows.map(r=>r.name)).size,112);
  for(const r of data.rows)for(const step of r.steps)for(const a of step.state.actors)assert.equal(typeof a.life,'number',r.name+' life must remain numeric');
  for(const authored of [false,true])for(const force of [false,true])for(const delivery of [false,true]){
   const r=row('admission-'+authored+'-'+force+'-'+delivery);assert.equal(events(r,'applied-hit').length,authored||force?1:0,r.name);
  }
  for(const depth of [-1,0,1,3])for(const name of ['land','evade','block','immune']){
   const r=row('outcome-'+name+'-depth-'+depth),result=outcome(r);assert(result,r.name);
   assert.equal(result.evaded,name==='evade',r.name);assert.equal(result.blocked,name==='block',r.name);assert.equal(result.immune,name==='immune',r.name);
   if(name!=='land')assert.equal(events(r,'before-effects').length,0,r.name);
   if(name==='block')assert.equal(events(r,'tapCharges').filter(e=>e.args[1]==='block').length,depth===0?1:0,r.name);
   if(name==='evade'||name==='block'){const target=r.steps[0].state.actors.find(a=>a.id===70);assert(!target.buffs.$map.some(([id])=>id==='landing-consumable'));}
   if(name==='immune'){assert.equal(events(r,'knockFixtures').length,1);assert.equal(events(r,'knockFixtures')[0].args[3],false);}
  }
  for(const name of ['native-attack-evade','native-area-evade'])assert.equal(outcome(row(name)).evaded,true,name);
  for(const kind of ['zero','negative','ward','shield','ply']){const r=row('zero-land-'+kind);assert.equal(outcome(r).total,0,r.name);assert.equal(events(r,'before-effects').length,1,r.name);}
  assert.equal(outcome(row('zero-land-ply')).plyEaten,true);
  assert.equal(outcome(row('deed-flags-critical')).crit,true);
  assert.equal(outcome(row('crit-downgraded')).crit,false);
  assert.equal(outcome(row('deed-flags-poise')).poiseBroke,true);
  const deeds=r=>events(r,'recordDeed').map(e=>e.args[0]);
  for(const [name,flag]of [['invisible','hidden'],['concealed','hidden'],['quiet','hidden'],['panicked','panicked'],['critical','crit'],['lethal','lethal']]){
   assert(deeds(row('deed-flags-'+name)).some(d=>d.kind==='hit'&&d.flags.includes(flag)),name);
  }
  assert(deeds(row('hidden-panicked-captured-before-packet')).some(d=>d.kind==='hit'&&d.flags.includes('hidden')&&d.flags.includes('panicked')));
  assert(deeds(row('received-elements-after-conversion')).some(d=>d.kind==='hit'&&d.keys.includes('cold')&&!d.keys.includes('fire')));
  assert.equal(outcome(row('deed-block-stopped-zero')).blockedAmount,0);assert(!deeds(row('deed-block-stopped-zero')).some(d=>d.kind==='block'));
  assert(!deeds(row('deed-target-already-zero-life')).some(d=>d.kind==='hit'));
  for(const life of [1,50,200,9000]){const r=row('self-damage-life-'+life),record=events(r,'recordSelfDamage')[0];assert(record);const victim=record.before.actors.find(a=>a.id===record.args[0].$actor);assert.equal(record.args[1],Math.max(0,life-Math.max(0,victim.life)),r.name);}
  for(const heal of [0,200]){const r=row('block-lethal-seep-heal-'+heal);assert(outcome(r).total>10);assert.equal(events(r,'kill').length,heal===0?1:0,r.name);}
  assert.equal(events(row('mimic-watching'),'notice').filter(e=>String(e.args[0]).startsWith('ART CAPTURED:')).length,1);
  for(const gate of ['no-slot','unstudied','forbidden','friendly','non-player','cool-watch'])assert.equal(events(row('mimic-'+gate),'notice').filter(e=>String(e.args[0]).startsWith('ART CAPTURED:')).length,0,gate);
  assert.equal(events(row('mimic-known-refresh'),'notice').filter(e=>String(e.args[0]).startsWith('ART CAPTURED:')).length,1);
  const pool=row('pool-bank-ordered-snapshot');assert.deepEqual(events(pool,'bankPools').filter(e=>e.args[1].type).map(e=>[e.args[1].type,e.args[2]]),[['fire',20],['cold',0],['physical',100],['chaos',0]]);
  const banked=row('pool-bank-real-skill'),fire=events(banked,'bankPools').find(e=>e.args[1].type==='fire').args[2],actor=banked.steps[0].state.actors[0];assert.equal(actor.pools.$map.find(([id])=>id==='pyre')[1],fire*.25);
  for(const name of ['nested-struck-hit','nested-block-hit'])assert.equal(events(row(name),'applied-hit').length,2,name);

}
