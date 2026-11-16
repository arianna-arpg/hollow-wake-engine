import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Mimic} from '../dist/mimic.js';
const rules={studyGroup:'arts',bankSize:2,expirySec:0,powerFactor:.85,witnessRadius:460,watchRefresh:1,denyTags:['summon'],denyDeliveries:['summon'],denyEffects:['commandMinions']};
const definition=(id,over={})=>({id,tags:['spell'],delivery:{type:'projectile'},effects:[],...over});
function setup(){
  const actor={skills:[{def:definition('mimic',{mimic:{}})}],mimicBank:null,mimicSel:null,mimicWatch:false,mimicWatchAt:0,mimicWitnessR:0,
    sheet:{get:s=>s==='mimicWitness'?2:0}},ports={tags:d=>new Set(d.tags),modifiers:()=>[],monsterExists:id=>id==='known',studied:()=>true};
  return {actor,ports,runtime:new Mimic(rules,ports)};
}
test('structural refusals outrank explicit permission, which outranks ordinary policy',()=>{
  const {runtime}=setup();
  for(const shape of[{mimic:{}},{invokes:{}},{throng:{}},{delivery:{type:'summon',grimoire:{}}}])assert(!runtime.allowed(definition('x',{...shape,mimicable:true})));
  assert(runtime.allowed(definition('x',{tags:['summon'],mimicable:true})));assert(!runtime.allowed(definition('x',{mimicable:false})));
  assert(!runtime.allowed(definition('x',{effects:[{type:'commandMinions'}]})));
});
test('policy caches belong to one content revision and never leak between services',()=>{
  const first=setup(),second=setup(),def=definition('x');assert(first.runtime.allowed(def));def.mimicable=false;
  assert(first.runtime.allowed(def));assert(!second.runtime.allowed(def));
});
test('knowledge refusal and missing monsters leave the transient bank untouched',()=>{
  const {actor,ports,runtime}=setup();ports.studied=()=>false;
  assert(!runtime.capture(actor,{defId:'known'},definition('x'),10));assert.equal(actor.mimicBank,null);
  ports.studied=()=>{assert.fail('unknown monster reached knowledge policy');};assert(!runtime.capture(actor,{defId:'unknown'},definition('x'),10));
});
test('capture preserves held selection and refreshes an existing entry in place',()=>{
  const {actor,runtime}=setup(),source={defId:'known'};
  for(const id of['a','b','c'])assert(runtime.capture(actor,source,definition(id),10));
  assert.deepEqual(actor.mimicBank.map(e=>e.sid),['a','c']);assert.equal(actor.mimicSel,'a');
  const entry=actor.mimicBank[0];assert(!runtime.capture(actor,source,definition('a'),20));assert.equal(actor.mimicBank[0],entry);assert.equal(entry.at,20);
});
test('capacity reduction evicts held selection only when no other entry remains',()=>{
  const {actor,runtime}=setup();actor.sheet.get=()=>-10;
  runtime.capture(actor,{defId:'known'},definition('a'),1);runtime.capture(actor,{defId:'known'},definition('b'),2);
  assert.deepEqual(actor.mimicBank.map(e=>e.sid),['b']);assert.equal(actor.mimicSel,'a');assert.equal(runtime.selected(actor,2).sid,'b');
});
test('expiry is strict, in place and repairs a selected expired entry',()=>{
  const {actor,ports}=setup(),runtime=new Mimic({...rules,expirySec:5},ports),bank=[{sid:'a',src:'known',at:0},{sid:'b',src:'known',at:1}];
  actor.mimicBank=bank;actor.mimicSel='a';assert.equal(runtime.entries(actor,5),bank);assert.equal(bank.length,2);
  assert.equal(runtime.selected(actor,6).sid,'b');assert.equal(bank.length,1);assert.equal(runtime.selected(actor,7),null);assert.equal(actor.mimicSel,null);
});
test('selection wraps signed steps, repairs missing ids and returns borrowed entries',()=>{
  const {actor,runtime}=setup();actor.mimicBank=['a','b','c'].map(sid=>({sid,src:'known',at:0}));
  assert.equal(runtime.select(actor,0,-1),actor.mimicBank[1]);assert.equal(runtime.select(actor,0,5),actor.mimicBank[0]);
  assert.equal(runtime.select(actor,0,'missing'),actor.mimicBank[0]);assert.equal(runtime.select(actor,0,'c'),actor.mimicBank[2]);
});
test('watch refresh uses its cadence, releases unslotted banks and never needs an account',()=>{
  const {actor,runtime}=setup();runtime.refresh(actor,5);assert.equal(actor.mimicWitnessR,920);assert(actor.mimicWatch);
  runtime.capture(actor,{defId:'known'},definition('a'),5);actor.skills=[];runtime.refresh(actor,5.5);assert(actor.mimicBank);
  runtime.refresh(actor,6);assert.equal(actor.mimicBank,null);assert.equal(actor.mimicSel,null);assert(!actor.mimicWatch);
});
test('neutral mimic power allocates no modifier and emitted modifiers are detached',()=>{
  const {runtime}=setup();assert.deepEqual(runtime.power({powerFactor:1}),[]);const mods=runtime.power();mods[0].value=99;
  assert.deepEqual(runtime.power(),[{stat:'damage',kind:'more',value:.85-1}]);
});
