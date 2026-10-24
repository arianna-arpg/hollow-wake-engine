import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {Actor} from '../src/engine/actor';
import {StatSheet,CONDITION_IDS,mod} from '../src/engine/stats';
import {createActorConditions} from '../src/engine/actorConditionAdapter';
import {seedGlobalRandom} from '../src/sim/rng';

bootSimEngine();
const initial=['notHurtRecently'],low=['lowLife','notHurtRecently'],full=['fullLife','notHurtRecently'];
const results:string[]=[];
function sheet(){const s=new StatSheet();s.setBase('life',100);s.setBase('mana',100);s.setBase('energyShield',0);s.setBase('lowLifeLine',.35);s.setSource('diagnostic',[mod('damage','increased',1,undefined,'lowLife')]);return s;}
const refresh=(a:Actor)=>a['refreshConditions']();
const sampled=(a:Actor)=>CONDITION_IDS.filter(id=>a.conditionHolds(id));
const published=(a:Actor)=>CONDITION_IDS.filter(id=>a.sheet.hasCondition(id));
function body(){
  const a=new Actor('condition-recovery','player',{x:0,y:0});a.sheet=sheet();
  a.life=50;a.mana=50;a.es=0;a.poise=0;a.poiseBroken=false;a.esRecharging=false;
  a.idleFor=1;a.plantFor=0;a.strideDist=0;a.comboWatch=false;a.comboCondLeft=0;a.comboCondBits=0;a.since.fill(999);
  refresh(a);assert.deepEqual(sampled(a),initial);assert.deepEqual(a.condRose,[]);return a;
}
function state(a:Actor,actor:string[],stored:string[],events:string[],confirmed:boolean){
  assert.deepEqual(sampled(a),actor);assert.deepEqual(published(a),stored);assert.deepEqual(a.condRose,events);assert.equal(a.condSheet===a.sheet,confirmed);
}
// Contract cases are specified independently in publication-recovery.json.
for(const replacement of [false,true])for(const applyFirst of [false,true]){
  const a=body();if(replacement)a.sheet=sheet();a.life=20;const apply=a.sheet.setConditions.bind(a.sheet),failure=new Error('intentional sink failure');let calls=0,fail=true;
  a.sheet.setConditions=active=>{calls++;if(applyFirst)apply(active);if(fail)throw failure;if(!applyFirst)apply(active);};
  assert.throws(()=>refresh(a),e=>e===failure);state(a,low,applyFirst?low:replacement?[]:initial,['lowLife'],false);
  fail=false;refresh(a);state(a,low,low,['lowLife'],true);assert.equal(calls,2);refresh(a);assert.equal(calls,2);assert.equal(a.sheet.get('damage'),2);
  results.push((replacement?'replacement':'existing')+'-throw-'+(applyFirst?'after':'before'));
}
{
  const a=body();a.life=20;const apply=a.sheet.setConditions.bind(a.sheet);let fail=true,calls=0;
  a.sheet.setConditions=active=>{calls++;if(fail)throw new Error('intentional failure');apply(active);};
  assert.throws(()=>refresh(a));fail=false;a.life=100;refresh(a);state(a,full,full,['lowLife','fullLife'],true);assert.equal(calls,2);results.push('changed-before-retry');
}
for(const read of [false,true])for(const caught of [false,true]){
  const a=body();a.life=20;let enabled=true,rejected=0,reads=0,calls=0;
  const nested=()=>{try{refresh(a);}catch(error){assert.match(String(error),/cannot reenter/);rejected++;if(!caught)throw error;}};
  const max=a.maxLife.bind(a),apply=a.sheet.setConditions.bind(a.sheet);
  a.maxLife=()=>{reads++;if(read&&enabled)nested();return max();};
  a.sheet.setConditions=active=>{calls++;if(!read&&enabled)nested();apply(active);};
  if(caught){refresh(a);state(a,low,low,['lowLife'],true);assert.equal(reads,1);assert.equal(calls,1);}
  else{assert.throws(()=>refresh(a),/cannot reenter/);state(a,read?initial:low,initial,read?[]:['lowLife'],false);enabled=false;refresh(a);state(a,low,low,['lowLife'],true);assert.equal(reads,2);assert.equal(calls,read?1:2);}
  assert.equal(rejected,1);results.push((read?'read':'sink')+'-reentry-'+(caught?'caught':'propagated'));
}
{
  const a=body(),b=body();a.life=20;b.life=100;let outer=0,inner=0;
  const applyA=a.sheet.setConditions.bind(a.sheet),applyB=b.sheet.setConditions.bind(b.sheet);
  a.sheet.setConditions=active=>{outer++;refresh(b);applyA(active);};b.sheet.setConditions=active=>{inner++;applyB(active);};
  refresh(a);state(a,low,low,['lowLife'],true);state(b,full,full,['fullLife'],true);assert.equal(outer,1);assert.equal(inner,1);results.push('different-actor-nested');
}
{
  const a=body(),apply=a.sheet.setConditions.bind(a.sheet),retained:string[][]=[];a.sheet.setConditions=active=>{retained.push(active);apply(active);};
  a.life=20;refresh(a);a.life=100;refresh(a);assert.deepEqual(retained,[low,full]);assert.notEqual(retained[0],retained[1]);
  a.sheet=sheet();refresh(a);state(a,full,full,['lowLife','fullLife'],true);assert.deepEqual(retained[0],low);results.push('retained-array-and-replacement');
}
{
  const a=body(),max=a.maxLife.bind(a),apply=a.sheet.setConditions.bind(a.sheet);let calls=0;
  a.sheet.setConditions=active=>{calls++;apply(active);};a.maxLife=()=>{throw new Error('read failure');};assert.throws(()=>refresh(a));state(a,initial,initial,[],false);
  a.maxLife=max;refresh(a);state(a,initial,initial,[],true);assert.equal(calls,1);results.push('read-failure-forces-replacement');
}
{
  const a=body();a.life=20;a.charges.set('communion',1);let conditions=0,gauges=0;
  const setConditions=a.sheet.setConditions.bind(a.sheet),setGauges=a.sheet.setGauges.bind(a.sheet);
  a.sheet.setConditions=active=>{conditions++;setConditions(active);};a.sheet.setGauges=entries=>{if(++gauges===1)throw new Error('gauge failure');setGauges(entries);};
  assert.throws(()=>refresh(a));state(a,low,low,['lowLife'],true);refresh(a);assert.equal(conditions,1);assert.equal(gauges,2);assert.equal(a.sheet.gauge('charge:communion'),1);results.push('condition-success-then-gauge-failure');
}
{
  const a=body(),policy=createActorConditions(1,.15),apply=a.sheet.setConditions.bind(a.sheet);a.life=20;let calls=0;
  a.sheet.setConditions=active=>{calls++;assert.throws(()=>policy.invalidate(a),/cannot reenter/);apply(active);};
  refresh(a);policy.invalidate(a);refresh(a);state(a,low,low,['lowLife'],true);assert.equal(calls,2);results.push('invalidation');
}
// The original adversarial mutation cases now reject their recursive call.
// Preserve the host's mutation, then sample it on the explicit subsequent call.
for(const replacement of [false,true])for(const applyFirst of [false,true]){
  const a=body();if(replacement)a.sheet=sheet();a.life=20;const apply=a.sheet.setConditions.bind(a.sheet);let entered=false,calls=0;
  a.sheet.setConditions=active=>{calls++;if(applyFirst)apply(active);if(!entered){entered=true;a.life=100;refresh(a);}if(!applyFirst)apply(active);};
  assert.throws(()=>refresh(a),/cannot reenter/);assert.equal(a.life,100);state(a,low,applyFirst?low:replacement?[]:initial,['lowLife'],false);
  refresh(a);state(a,full,full,['lowLife','fullLife'],true);assert.equal(calls,2);assert.equal(a.sheet.get('damage'),1);results.push('mutating-reentry-'+replacement+'-'+applyFirst);
}
{
  const restore=seedGlobalRandom(371039);try{const w=makeSimWorld('warrior',371039),a=w.player;a.condRose=['lowLife','recentlyHit'];const queue=a.condRose;a.healedSince=5;a.gasped=true;a.dead=true;let calls=0;w.rollOwnProcs=()=>{calls++;};w['sweepTalentEvents'](a);assert.equal(calls,0);assert.equal(a.condRose,queue);assert.deepEqual(queue,[]);assert.equal(a.healedSince,0);assert.equal(a.gasped,false);results.push('native-dead-sweep');}finally{restore();}
}
assert.equal(results.length,19);fs.writeFileSync(process.argv[2],JSON.stringify({decision:'condition-publication-recovery/v1',checks:results},null,2)+'\n',{flag:'wx'});
