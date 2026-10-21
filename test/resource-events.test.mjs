import fs from 'node:fs';import assert from 'node:assert/strict';import test from 'node:test';
import {gunzipSync} from 'node:zlib';
import {ResourceEvents} from '../dist/resource-events.js';
import {ChargeRuntime} from '../dist/charge-runtime.js';
const fixture=JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-twenty-three/resource-events.json.gz',import.meta.url))));
const banks=JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-twenty-two/charge-banks.json.gz',import.meta.url))));
const wire=v=>JSON.parse(JSON.stringify(v));
function ports(overrides={}){
 return {skills:()=>[],taps:()=>[],toggled:()=>false,distance:()=>0,elite:()=>false,random:()=>0,
  gain:()=>{},gaugeTerms:()=>({need:4,gain:1,lockoutSec:4,cap:4}),cooldown:()=>0,setCooldown:()=>{},...overrides};
}
test('original authored feed predicates preserve all 1300 filter and random draw observations',()=>{
 for(const c of fixture.predicates){
  const i=c.input,draws=[],runtime=new ResourceEvents(ports({toggled:()=>i.toggled,distance:()=>i.distance,elite:()=>i.elite,random:()=>{draws.push(i.roll);return i.roll;}}),{deathRadius:360});
  const actual=runtime.fires({}, {def:{id:'predicate'}},i.spec,i.on,i.distance===null?undefined:{},i.orbKind??undefined,i.victimPresent?{}:undefined);
  assert.equal(actual,c.fires,c.row+'/'+c.context);assert.deepEqual(draws,c.draws,c.row+'/'+c.context);
 }
 assert.equal(fixture.predicates.length,1300);
});
test('original ordered awards compose with the extracted charge and gauge runtimes',()=>{
 let transitions=0;
 for(const course of fixture.courses)for(const step of course.steps){
  const before=structuredClone(step.before),state={charges:new Map(before.charges),clocks:new Map(before.clocks),modifierCounts:new Map(before.modifierCounts)};
  const events=before.events,cooldowns=new Map(before.cooldowns),sources=new Map(before.sources.map(id=>[id,[]]));
  const skills=course.skills.map((s,index)=>({def:{id:s.id,tags:s.tags,gauge:s.gauge??undefined},taps:s.taps,state:before.skills[index].state??undefined,terms:before.skills[index].terms}));
  const unused=()=>{throw new Error('Unexpected charge clock call during event award');};
  const charges=new ChargeRuntime(state,{definition:id=>banks.definitions[id],definitions:unused,capacityBonus:()=>0,chargeCapacityBonus:()=>0,regenerationBonus:unused,
   skills:()=>skills,taps:inst=>inst.taps,socketTaps:unused,spentCharge:unused,toggled:unused,channelSkillId:unused,gaugeTerms:unused,walked:unused,clearWalked:unused,
   gainEventCount:()=>events.length,emitGainEvent:(id,n,inst,depth)=>events.push({kind:'charge',id,depth,n,tags:inst?.def.tags}),setSource:(id,mods)=>sources.set(id,mods),removeSource:id=>sources.delete(id)});
  const draws=[],runtime=new ResourceEvents(ports({skills:()=>skills,taps:inst=>inst.taps,distance:()=>step.distance,elite:()=>!!step.elite,
   random:()=>{const n=[.1,.9,.5,0][draws.length%4];draws.push(n);return n;},gain:(_actor,inst,tap)=>charges.gain(tap.charge,tap.amount,tap.max,inst),gaugeTerms:(_actor,inst)=>inst.terms,
   cooldown:(_actor,inst)=>cooldowns.get(inst.def.id)??0,setCooldown:(_actor,inst,sec)=>cooldowns.set(inst.def.id,sec)}),{deathRadius:360});
  runtime.dispatch({},step.on,step.distance===undefined?undefined:{},step.orbKind,{});
  const after=wire({charges:[...state.charges],clocks:[...state.clocks],modifierCounts:[...state.modifierCounts],events,cooldowns:[...cooldowns],skills:skills.map(s=>({id:s.def.id,state:s.state??null,terms:s.terms})),sources:[...sources.keys()]});
  assert.deepEqual(after,step.after,course.name+'/'+step.label);assert.deepEqual(draws,step.draws,course.name+'/'+step.label);transitions++;
 }
 assert.equal(transitions,21);
});
test('radius/toggle rejection is lazy and defaults do not draw randomness',()=>{
 const read=[],runtime=new ResourceEvents(ports({toggled:()=>{read.push('toggle');return false;},distance:()=>{read.push('distance');return 11;},elite:()=>{read.push('elite');return true;},random:()=>{read.push('random');return .5;}}),{deathRadius:10});
 const inst={def:{id:'art'}};
 assert.equal(runtime.fires({},inst,{on:'enemyDeath',amount:1,whileToggled:true,chance:1},'enemyDeath',{},undefined,{}),false);assert.deepEqual(read,['toggle']);
 read.length=0;assert.equal(runtime.fires({},inst,{on:'enemyDeath',amount:1,eliteVictim:true,chance:1},'enemyDeath',{},undefined,{}),false);assert.deepEqual(read,['distance']);
 read.length=0;assert.equal(runtime.fires({},inst,{on:'enemyDeath',amount:1},'enemyDeath'),true);assert.deepEqual(read,[]);
});
test('ports are instance bound, no shared state, and reentry releases its guard',()=>{
 const inst={def:{id:'art'},taps:[{on:'kill',amount:1,max:2,charge:'fuel'}]},awards=[];let runtime;
 const host=ports({marker:'host',skills(){assert.equal(this.marker,'host');return [null,inst];},taps:i=>i.taps,gain:()=>{runtime.dispatch({},'kill');}});
 runtime=new ResourceEvents(host,{deathRadius:360});assert.throws(()=>runtime.dispatch({},'kill'),/Reentrant/);
 assert.equal(runtime.fires({},inst,{on:'kill',amount:1},'kill'),true);
 const other=new ResourceEvents(ports({skills:()=>[inst],taps:i=>i.taps,gain:(_a,i,t)=>awards.push(t.charge)}),{deathRadius:360});other.dispatch({},'kill');assert.deepEqual(awards,['fuel']);
});
test('invalid numeric observations fail explicitly without swallowing previous awards',()=>{
 const inst={def:{id:'art'},taps:[{on:'kill',amount:1,max:2,charge:'fuel'},{on:'kill',amount:1,max:2,charge:'fuel',chance:.5}]},awards=[];
 const runtime=new ResourceEvents(ports({skills:()=>[inst],taps:i=>i.taps,gain:()=>awards.push('paid'),random:()=>1}),{deathRadius:360});
 assert.throws(()=>runtime.dispatch({},'kill'),/random draw/);assert.deepEqual(awards,['paid']);
 assert.throws(()=>runtime.fires({},inst,{on:'kill',amount:1,chance:NaN},'kill'),/finite/);
 assert.throws(()=>runtime.dispatch({},'unknown'),/Unknown/);assert.throws(()=>new ResourceEvents(ports(),{deathRadius:-1}),/nonnegative/);
});
test('one simulation binding routes interleaved actors without sharing banks or cooldowns',()=>{
 const skill=()=>({def:{id:'art',gauge:{need:4,feeds:[{on:'kill',amount:1}],cooldownPer:2}},taps:[{on:'kill',charge:'fuel',max:4,amount:1}]}),actor=()=>({skills:[skill()],bank:0,cooldown:0});
 const a=actor(),b=actor();b.cooldown=3;
 const runtime=new ResourceEvents(ports({skills:a=>a.skills,taps:i=>i.taps,gain:(a,_i,t)=>{a.bank+=t.amount;},cooldown:a=>a.cooldown,setCooldown:(a,_i,t)=>{a.cooldown=t;}}),{deathRadius:360});
 runtime.dispatch(a,'kill');runtime.dispatch(b,'kill');runtime.dispatch(a,'kill');runtime.dispatch(b,'kill');
 assert.equal(a.bank,2);assert.equal(b.bank,2);assert.equal(a.skills[0].state.gauge,2);assert.equal(b.skills[0].state,undefined);assert.equal(b.cooldown,0);
 runtime.dispatch(b,'kill');assert.equal(b.skills[0].state.gauge,1);assert.equal(a.skills[0].state.gauge,2);
});
