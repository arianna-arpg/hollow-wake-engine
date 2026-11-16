import test from 'node:test';import assert from 'node:assert/strict';import {ActorVitals} from '../dist/actor-vitals.js';import {ActorTimers} from '../dist/actor-timers.js';
function rig(){const events=[],stats={life:100,mana:60,energyShield:40,poise:80,insight:20,endurance:25,healTaken:.5,poiseOvercharge:.5,poiseRegenDelay:2,wardGain:1.5,weight:2,staggerWindow:4,insightTaper:1,insightStillTaper:2,insightSap:0,insightInversion:0};
  const a={name:'Body',life:30,mana:20,reservedLife:10,reservedMana:5,dead:false,healedSince:0,es:10,esJustFilled:false,esDelay:1,esRecharging:true,poise:80,poiseBroken:false,poiseCalm:4,poiseDelay:0,poiseJustBroke:false,poiseBracketHits:[],insight:0,endurance:0,ward:0,idleFor:0,since:new Float64Array(9).fill(999),sheet:{get:(k,t,e)=>stats[k]??0},applyStatus:(...args)=>events.push(['status',...args]),noteRecent:k=>events.push(['recent',k]),onLifeHealed:(...args)=>events.push(['observed',...args])};
  const rules={insightGrace:.15,weightMin:.05,weightPerPoise:.012,poiseBrackets:[.75,.5,.25],poiseBreakStatus:'sundered'},v=new ActorVitals(rules,{tags:i=>new Set(i.def.tags),modifiers:i=>i.mods??[],statusExists:()=>true,healed:(_a,n)=>events.push(['tapped',n])});
  for(const method of ['maxLife','maxMana','maxEs','maxPoise','maxInsight','maxEndurance','availableMaxMana','lifeCeiling','stanceRead','insightMomentum','damagePoise','gainPoise','gainEs','gainEndurance','gainWard','effectiveWeight','staggerDamage','healBy','refillLife','fillResources'])a[method]=(...args)=>v[method](a,...args);
  return{a,v,stats,events};}
test('poise break crosses each rung once, uses breaker duration and leaves broken recovery undelayed',()=>{
  const {a,events}=rig(),breaker={name:'Breaker',sheet:{get:()=>3}};assert.equal(a.damagePoise(70,breaker),false);assert.deepEqual(a.poiseBracketHits,[.75,.5,.25]);assert.equal(a.damagePoise(20,breaker),true);assert.equal(a.poiseDelay,2);assert.deepEqual(events,[['status','sundered',0,3,'Breaker']]);
  a.poiseDelay=.3;a.poiseCalm=1;assert.equal(a.damagePoise(10,breaker),false);assert.equal(a.poiseDelay,.3);assert.equal(a.poiseCalm,0);assert.equal(events.length,1);
});
test('explicit poise overcharge cannot rearm a broken bar and weight reads only unbroken current poise',()=>{
  const {a}=rig();assert.equal(a.gainPoise(80),40);assert.equal(a.poise,120);assert.equal(a.effectiveWeight(),2*(1+120*.012));a.poiseBroken=true;assert.equal(a.effectiveWeight(),2);a.poise=0;assert.equal(a.gainPoise(30),30);assert.equal(a.poiseBroken,true);
});
test('shield gains flag only a new fill and do not run the recharge clock',()=>{
  const {a}=rig();assert.equal(a.gainEs(50),30);assert.equal(a.esJustFilled,true);assert.equal(a.esDelay,1);a.esJustFilled=false;assert.equal(a.gainEs(1),0);assert.equal(a.esJustFilled,false);a.dead=true;a.es=0;assert.equal(a.gainEs(5),0);
});
test('healing observes actual scaled gain, respects live seals and marks recency only for explicit healing',()=>{
  const {a,events}=rig();a.lifeSealAt=35;assert.equal(a.healBy(30),5);assert.equal(a.healedSince,5);assert.deepEqual(events,[['tapped',5],['observed',5,false],['recent','heal']]);
  a.life=30;events.length=0;assert.equal(a.healBy(6,true),3);assert.equal(a.healedSince,5);assert.deepEqual(events,[['tapped',3],['observed',3,true]]);a.refillLife();assert.equal(a.life,100);assert.deepEqual(events.at(-1),['observed',67,true]);
});
test('momentum blends motion and stillness, while sap suppresses both',()=>{
  const {a,stats}=rig();assert.equal(a.insightMomentum(),1);a.idleFor=1.15;assert(Math.abs(a.insightMomentum())<1e-12);stats.insightInversion=1;assert(Math.abs(a.insightMomentum()-.5)<1e-12);stats.insightSap=.4;assert(Math.abs(a.insightMomentum()-.3)<1e-12);stats.insightSap=1;assert.equal(a.insightMomentum(),0);
});
test('resource fill and stagger use shared pools and retain reservation authority',()=>{
  const {a}=rig();a.staggerDamage(8);a.staggerDamage(4);assert.deepEqual(a.stagger,{amount:12,perSec:3});a.gainWard(4);assert.equal(a.ward,6);assert.equal(a.gainEndurance(30),25);
  a.poiseBroken=true;a.fillResources();assert.equal(a.poise,80);assert.equal(a.poiseBroken,false);assert.equal(a.esDelay,0);assert.equal(a.esRecharging,false);assert.equal(a.mana,60);assert.equal(a.availableMaxMana(),55);assert.equal(a.lifeCeiling(),90);
});
test('held stance queries use the exact current skill modifiers and end immediately on mode change',()=>{
  const {a}=rig(),mods=[{stat:'poise',value:4}],i={def:{tags:['guard']},mods};a.casting={mode:'guard',inst:i};assert.equal(a.stanceRead().extra,mods);assert(a.stanceRead().tags.has('guard'));a.casting.mode='cast';assert.equal(a.stanceRead(),null);
});
test('invalid actor frame time fails before any clock, cue, condition or resource mutation',()=>{
  let calls=0;const actor={},services={cues:()=>calls++,tags:()=>new Set(),modifiers:()=>[],definitionTags:()=>new Set()};const clock=new ActorTimers(actor,services,{recentNever:999,plantTime:1,poiseOverDecay:.4});
  for(const dt of [-1,NaN,Infinity])assert.throws(()=>clock.advance(dt),/finite and nonnegative/);assert.throws(()=>clock.advance(.1,-1),/finite and nonnegative/);assert.equal(calls,0);assert.deepEqual(actor,{});
});
