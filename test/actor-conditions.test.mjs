import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ActorConditions,ACTOR_CONDITION_IDS,DEFAULT_ACTOR_CONDITIONS} from '../dist/actor-conditions.js';
import {ActorGaugePublisher} from '../dist/actor-gauges.js';

const recovery=JSON.parse(fs.readFileSync(new URL('../baseline/milestone-thirty-seven/publication-recovery.json',import.meta.url)));
const original=JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-thirty-seven/actor-condition-boundary.json.gz',import.meta.url))));
const caseById=id=>recovery.cases.find(row=>row.id===id);
const conditions=(service,actor)=>ACTOR_CONDITION_IDS.filter(id=>service.holds(actor,id));
function rig(config){
  const reads=[],calls=[],hooks={},sheet={active:[],setConditions(active){
    calls.push(active);hooks.before?.();sheet.active=active;hooks.after?.();
  }};
  const actor={life:50,mana:50,es:0,poise:0,poiseBroken:false,esRecharging:false,plantFor:0,idleFor:1,
    strideDist:0,comboWatch:false,comboCondLeft:0,comboCondBits:0,since:new Float64Array(9).fill(999),
    condMask:-1,condSheet:null,condRose:[],sheet,maxLife:100,maxMana:100,maxEs:0,lowLine:.35,reach:100};
  const read=(a,name,value)=>{reads.push(name);hooks.read?.(name,a);return value;};
  const ports={maxLife:a=>read(a,'life',a.maxLife),maxMana:a=>read(a,'mana',a.maxMana),maxEs:a=>read(a,'energyShield',a.maxEs),
    lowLifeFraction:a=>read(a,'lowLifeLine',a.lowLine),strideReach:a=>read(a,'strideReach',a.reach)};
  const service=new ActorConditions(ports,config);
  const prime=()=>{service.refresh(actor);calls.length=0;reads.length=0;};
  const view=()=>({actor:conditions(service,actor),sheet:actor.sheet.active,queue:[...actor.condRose],confirmed:actor.condSheet===actor.sheet});
  const check=expected=>{const actual={...view(),calls:calls.length,reads:reads.length};for(const [key,value]of Object.entries(expected)){
    if(key==='rejected')continue;
    assert.deepEqual(actual[key],(key==='actor'||key==='sheet')&&typeof value==='string'?recovery.conditions[value]:value,key);
  }};
  return {actor,sheet,service,ports,reads,calls,hooks,prime,view,check};
}

test('native condition policy matches 154 immutable original sampling observations',()=>{
  assert.deepEqual(ACTOR_CONDITION_IDS,original.conditionIds);let observations=0;
  for(const course of original.courses)for(const step of course.steps){
    const b=step.before,publications=[],reads=[];
    const actor={life:b.life,mana:b.mana,es:b.es,poise:b.poise,poiseBroken:b.poiseBroken,esRecharging:b.recharging,
      casting:b.guard?{mode:'guard'}:null,plantFor:b.plant,idleFor:b.idle,strideDist:b.stride,
      comboWatch:b.comboWatch,comboCondLeft:b.comboLeft,comboCondBits:b.comboBits,since:b.since,
      condMask:b.mask,condSheet:null,condRose:[...b.rose],sheet:null};
    // The host owns pending stride consumption before a timer-phase sample.
    if(course.name.startsWith('timer-phase-')&&b.strideSpent)actor.strideDist=0;
    const sheet=actor.sheet={active:b.sheetConditions,setConditions(active){publications.push({active,maskAtSink:actor.condMask,roseAtSink:[...actor.condRose]});this.active=active;}};
    if(b.sheetMarkerCurrent)actor.condSheet=sheet;
    const query=stat=>{const row=step.reads[reads.length];assert.equal(row?.stat,stat,course.name+'/'+step.label);reads.push(row);return row.value;};
    const service=new ActorConditions({maxLife:()=>query('life'),maxMana:()=>query('mana'),maxEs:()=>query('energyShield'),lowLifeFraction:()=>query('lowLifeLine'),strideReach:()=>query('strideReach')});
    const queue=actor.condRose;
    assert.equal(service.refresh(actor),step.publications.length>0);
    assert.equal(actor.condMask,step.after.mask,course.name+'/'+step.label);assert.equal(actor.condSheet,sheet);
    assert.deepEqual(conditions(service,actor),step.after.actorConditions);assert.deepEqual(sheet.active,step.after.sheetConditions);
    assert.equal(actor.condRose,queue);assert.deepEqual(queue,step.after.rose);assert.deepEqual(reads,step.reads);assert.deepEqual(publications,step.publications);
    observations++;
  }
  assert.equal(observations,154);
});

for(const row of recovery.cases.filter(row=>row.failure))test('predeclared recovery: '+row.id,()=>{
  const r=rig();r.prime();r.actor.life=20;
  if(row.sink==='replacement')r.actor.sheet={active:[],setConditions(active){r.calls.push(active);r.hooks.before?.();this.active=active;r.hooks.after?.();}};
  const error=new Error('host sink failure');r.hooks[row.failure]=()=>{throw error;};
  assert.throws(()=>r.service.refresh(r.actor),e=>e===error);r.check(row.afterFailure);
  delete r.hooks[row.failure];if(row.retryLife)r.actor.life=row.retryLife;
  assert.equal(r.service.refresh(r.actor),true);r.check(row.afterRetry);
  assert.equal(r.service.refresh(r.actor),false);r.check(row.afterRetry);
});

for(const row of recovery.cases.filter(row=>row.reentry))test('predeclared recovery: '+row.id,()=>{
  const r=rig();r.prime();r.actor.life=20;let rejected=0;
  const reenter=()=>{try{r.service.refresh(r.actor);}catch(error){rejected++;assert.match(error.message,/cannot reenter/);if(!row.caught)throw error;}};
  if(row.reentry==='read')r.hooks.read=name=>{if(name==='life')reenter();};else r.hooks.before=reenter;
  if(row.caught){r.service.refresh(r.actor);r.check(row.expected);assert.equal(rejected,row.expected.rejected);}
  else{
    assert.throws(()=>r.service.refresh(r.actor),/cannot reenter/);r.check(row.afterFailure);assert.equal(rejected,1);
    delete r.hooks.read;delete r.hooks.before;r.service.refresh(r.actor);r.check(row.afterRetry);
  }
});

test('predeclared recovery: different-actor-nested',()=>{
  const r=rig(),inner=rig();r.prime();r.service.refresh(inner.actor);inner.calls.length=0;
  r.actor.life=20;inner.actor.life=100;r.hooks.before=()=>r.service.refresh(inner.actor);r.service.refresh(r.actor);
  const expected=caseById('different-actor-nested').expected;
  assert.deepEqual({outerActor:conditions(r.service,r.actor),innerActor:conditions(r.service,inner.actor),outerQueue:r.actor.condRose,innerQueue:inner.actor.condRose,
    outerCalls:r.calls.length,innerCalls:inner.calls.length,bothConfirmed:r.actor.condSheet===r.sheet&&inner.actor.condSheet===inner.sheet},
    {...expected,outerActor:recovery.conditions[expected.outerActor],innerActor:recovery.conditions[expected.innerActor]});
});
test('predeclared recovery: retained-array-and-replacement',()=>{
  const r=rig();r.prime();r.actor.life=20;r.service.refresh(r.actor);const first=r.calls[0];
  r.actor.life=100;r.service.refresh(r.actor);let replacementCalls=0,latest;
  r.actor.sheet={setConditions(active){latest=active;replacementCalls++;}};r.service.refresh(r.actor);
  const e=caseById('retained-array-and-replacement').expected;
  assert.deepEqual({retainedFirst:first,latest,queue:r.actor.condRose,existingCalls:r.calls.length,replacementCalls,distinctArrays:first!==r.calls[1]&&latest!==r.calls[1]},
    {...e,retainedFirst:recovery.conditions[e.retainedFirst],latest:recovery.conditions[e.latest]});
  latest.push('moving');assert.equal(r.service.holds(r.actor,'moving'),false);assert.deepEqual(first,recovery.conditions.low);
});
test('predeclared recovery: read-failure-forces-replacement',()=>{
  const r=rig();r.prime();const failure=new Error('read');r.hooks.read=()=>{throw failure;};
  assert.throws(()=>r.service.refresh(r.actor),e=>e===failure);const afterFailureConfirmed=r.actor.condSheet===r.sheet;
  delete r.hooks.read;r.service.refresh(r.actor);const e=caseById('read-failure-forces-replacement').expected;
  assert.deepEqual({...r.view(),confirmed:undefined,afterFailureConfirmed,afterRetryConfirmed:r.actor.condSheet===r.sheet,calls:r.calls.length},
    {...e,actor:recovery.conditions[e.actor],sheet:recovery.conditions[e.sheet],confirmed:undefined});
});
test('predeclared recovery: condition-success-then-gauge-failure',()=>{
  const r=rig();r.prime();r.actor.life=20;const gauges=new ActorGaugePublisher(),source={statuses:[],charges:new Map()},error=new Error('gauge');let gaugeCalls=0;
  const sink={setGauges(){if(++gaugeCalls===1)throw error;}};
  const frame=()=>{r.service.refresh(r.actor);gauges.refresh(source,sink);};
  assert.throws(frame,e=>e===error);const conditionConfirmedAfterGaugeFailure=r.actor.condSheet===r.sheet;frame();
  assert.deepEqual({conditionCalls:r.calls.length,gaugeCalls,queue:r.actor.condRose,conditionConfirmedAfterGaugeFailure},caseById('condition-success-then-gauge-failure').expected);
});
test('predeclared recovery: invalidation',()=>{
  const r=rig();r.prime();r.actor.life=20;let nestedInvalidationRejected=false;
  r.hooks.before=()=>{assert.throws(()=>r.service.invalidate(r.actor),/cannot reenter/);nestedInvalidationRejected=true;};r.service.refresh(r.actor);
  r.service.invalidate(r.actor);assert.equal(r.actor.condSheet,null);r.service.refresh(r.actor);
  const {nestedInvalidationRejected:expected,...state}=caseById('invalidation').expected;
  r.check(state);assert.equal(nestedInvalidationRejected,expected);
});

test('same actor cannot reenter through a different policy instance',()=>{
  const r=rig(),second=new ActorConditions(r.ports);r.prime();r.actor.life=20;
  r.hooks.before=()=>assert.throws(()=>second.refresh(r.actor),/cannot reenter/);r.service.refresh(r.actor);
  assert.equal(r.calls.length,1);assert.equal(r.reads.length,4);assert.deepEqual(r.actor.condRose,['lowLife']);
});
test('holds reads last sample inside the sink and ignores unknown core condition names',()=>{
  const r=rig();assert(!r.service.holds(r.actor,'notHurtRecently'));r.prime();r.actor.life=20;
  assert(!r.service.holds(r.actor,'lowLife'));r.hooks.before=()=>{assert(r.service.holds(r.actor,'lowLife'));assert.deepEqual(r.actor.condRose,['lowLife']);};
  r.service.refresh(r.actor);for(const id of ['custom-host-condition','toString','__proto__','constructor'])assert(!r.service.holds(r.actor,id));
});
test('queue order and identity survive limited capacity and already overfull input',()=>{
  for(const length of [0,14,15,16,17]){
    const r=rig();r.prime();const queue=r.actor.condRose;queue.push(...Array(length).fill('moving'));
    r.actor.life=0;r.actor.mana=0;r.actor.casting={mode:'guard'};r.service.refresh(r.actor);
    assert.equal(r.actor.condRose,queue);assert.deepEqual(queue,[...Array(length).fill('moving'),...['lowLife','lowMana','guarding'].slice(0,Math.max(0,16-length))]);
    r.service.refresh(r.actor);assert.equal(r.calls.length,1);
  }
});
test('birth does not append edges and stable samples preserve sink array identity',()=>{
  const r=rig(),queue=r.actor.condRose;r.actor.life=20;queue.push('moving');r.service.refresh(r.actor);const active=r.sheet.active;
  assert.deepEqual(queue,['moving']);assert(!r.service.refresh(r.actor));assert.equal(r.sheet.active,active);assert.equal(r.calls.length,1);
});
test('configuration capture is immutable and separate policies stay independent',()=>{
  const config={...DEFAULT_ACTOR_CONDITIONS,recentWindows:Array(9).fill(10)},r=rig(config),other=rig();
  config.recentWindows[0]=1;config.fullLifeFraction=.4;r.actor.since[0]=5;other.actor.since[0]=5;
  r.prime();other.prime();assert(r.service.holds(r.actor,'recentlyHit'));assert(!other.service.holds(other.actor,'recentlyHit'));assert(!r.service.holds(r.actor,'fullLife'));
  assert(Object.isFrozen(DEFAULT_ACTOR_CONDITIONS));assert(Object.isFrozen(DEFAULT_ACTOR_CONDITIONS.recentWindows));assert(Object.isFrozen(ACTOR_CONDITION_IDS));
});
test('distinct recency windows retain counter indexing, strict expiry and the hurt inverse',()=>{
  const windows=[1,2,3,4,5,6,7,8,9],r=rig({...DEFAULT_ACTOR_CONDITIONS,recentWindows:windows});
  const recent=()=>conditions(r.service,r.actor).filter(id=>id.startsWith('recently')||id==='notHurtRecently');
  r.actor.since.fill(5.5);r.service.refresh(r.actor);
  assert.deepEqual(recent(),['notHurtRecently','recentlyBlocked','recentlyEvaded','recentlyMoved','recentlyHealed']);
  // critHurt is a native counter without an actor condition of its own.
  r.actor.since[4]=0;assert.equal(r.service.refresh(r.actor),false);
  r.actor.since.set(windows);r.service.refresh(r.actor);assert.deepEqual(recent(),['notHurtRecently']);
  r.actor.since.set(windows.map(value=>value-.25));r.service.refresh(r.actor);
  assert.deepEqual(recent(),['recentlyHit','recentlyCrit','recentlyKilled','recentlyHurt','recentlyBlocked','recentlyEvaded','recentlyMoved','recentlyHealed']);
});

test('invalid configuration and sparse recency windows fail before any host read',()=>{
  for(const field of ['fullLifeFraction','lowManaFraction','fullManaFraction','fullEsFraction','lowEsFraction'])for(const value of [-1,1.1,NaN,Infinity,undefined,null])assert.throws(()=>rig({...DEFAULT_ACTOR_CONDITIONS,[field]:value}));
  for(const field of ['plantSeconds','movingSeconds'])for(const value of [-1,NaN,Infinity,undefined,null])assert.throws(()=>rig({...DEFAULT_ACTOR_CONDITIONS,[field]:value}));
  for(const recentWindows of [[],Array(8).fill(4),Array(10).fill(4),Array(9),[NaN,4,4,4,4,4,4,4,4],[4,-1,4,4,4,4,4,4,4]])assert.throws(()=>rig({...DEFAULT_ACTOR_CONDITIONS,recentWindows}));
});
test('one-pass conditional-maximum feedback is not iterated to a fixed point',()=>{
  const r=rig();r.actor.life=30;
  const service=new ActorConditions({...r.ports,maxLife:actor=>actor.sheet.active.includes('lowLife')?50:100});
  const seen=[];for(let i=0;i<4;i++){service.refresh(r.actor);seen.push(service.holds(r.actor,'lowLife'));}
  assert.deepEqual(seen,[true,false,true,false]);assert.deepEqual(r.actor.condRose,['lowLife']);
});
