import assert from 'node:assert/strict';import test from 'node:test';
import fs from 'node:fs';import {gunzipSync} from 'node:zlib';
import {ChargeRuntime,createChargeState,chargeCostReady,chargePayment} from '../dist/charge-runtime.js';
import {StatSheet} from '../dist/stats.js';import {StatRules} from '../dist/stat-rules.js';
function rig(definitions={}){
 const r={state:createChargeState(),definitions,skills:[],events:[],sources:new Map(),writes:[],capacity:0,namedCapacity:0,regen:{},walked:0,toggled:new Set(),channel:undefined};
 const ports={definition:key=>r.definitions[key],definitions:()=>Object.entries(r.definitions),capacityBonus:inst=>typeof r.capacity==='function'?r.capacity(inst):r.capacity,chargeCapacityBonus:()=>r.namedCapacity,regenerationBonus:key=>r.regen[key]??0,
  skills:()=>r.skills,taps:inst=>inst.taps??inst.def.chargeGain??[],socketTaps:inst=>inst.sockets??[],spentCharge:inst=>inst.spent,toggled:inst=>r.toggled.has(inst.def.id),channelSkillId:()=>r.channel,
  gaugeTerms:inst=>inst.terms,walked:()=>r.walked,clearWalked:()=>{r.walked=0;},gainEventCount:()=>r.events.length,
  emitGainEvent:(id,n,inst,depth)=>r.events.push({kind:'charge',id,depth,n,tags:inst?.def.tags}),
  setSource:(id,mods)=>{r.sources.set(id,mods);r.writes.push({id,mods});r.sheet?.setSource(id,mods);},removeSource:id=>{r.sources.delete(id);r.writes.push({id,removed:true});r.sheet?.removeSource(id);}};
 r.runtime=new ChargeRuntime(r.state,ports);r.ports=ports;return r;
}
const mute={label:'Fuel',color:'#fff',baseCap:3};
test('charge gains fold capacity, preserve capped idle and gate shared event capacity',()=>{
 const r=rig({fuel:mute}),b=r.runtime;r.capacity=1.5;r.namedCapacity=.75;
 assert.equal(b.capFor('fuel'),5);b.gain('fuel',20,5);assert.equal(r.state.charges.get('fuel'),7);assert.equal(r.events[0].n,7);
 r.state.clocks.get('fuel').idle=8;b.gain('fuel',1,5);assert.equal(r.state.clocks.get('fuel').idle,8);assert.equal(r.events.length,1);
 b.gain('fuel',1,0);assert.equal(r.state.charges.get('fuel'),2);assert.equal(r.state.clocks.get('fuel').idle,8);assert.equal(r.events.length,1);
 const shared=rig();shared.events.push(...Array.from({length:60},()=>({kind:'buff'})));for(let i=0;i<10;i++)shared.runtime.gain('fuel',1,100,undefined,2);
 assert.equal(shared.events.length,64);assert.equal(shared.state.charges.get('fuel'),10);assert.equal(shared.events.at(-1).depth,2);
});
test('draining blocks gain until empty and defers drain-only modifiers until synchronization',()=>{
 const r=rig({blood:{...mute,modsWhileDraining:true,perCharge:[{stat:'attackSpeed',kind:'increased',value:.1}]}}),b=r.runtime;
 b.gain('blood',5,10);assert.equal(r.sources.size,0);b.startDrain('blood',2);assert.equal(r.sources.size,0);b.gain('blood',99,100);assert.equal(r.state.charges.get('blood'),5);
 b.advance(.25);assert.equal(r.sources.get('charge:blood')[0].value,.5);b.advance(2);assert.equal(r.state.charges.get('blood'),1);assert.equal(r.sources.get('charge:blood')[0].value,.1);
 b.advance(.25);assert.equal(b.isDraining('blood'),false);assert.equal(r.sources.size,0);b.gain('blood',1,10);assert.equal(r.state.charges.get('blood'),1);assert.equal(r.sources.size,0);
});
test('charge frame policy keeps full crossing-frame decay, fractional overdraw and regeneration debt',()=>{
 const r=rig({verse:{...mute,decay:{perSec:.5,delay:8}},fuel:mute}),b=r.runtime;r.regen.fuel=10;b.gain('verse',10,12);b.advance(10);
 assert.equal(r.state.charges.get('verse'),5);assert.equal(r.state.charges.get('fuel'),1);assert.equal(r.state.clocks.get('__regen').tick,9);
 b.advance(0);assert.equal(r.state.charges.get('fuel'),2);assert.equal(r.state.clocks.get('__regen').tick,8);
 const fractional=rig({fuel:{...mute,decay:{perSec:1}}});fractional.runtime.gain('fuel',.5,3);fractional.runtime.advance(1);assert.equal(fractional.state.charges.get('fuel'),-.5);fractional.runtime.spend('fuel',0);assert.equal(fractional.state.charges.get('fuel'),0);
});
test('regeneration requires a spender only for the definition baseline and preserves phase order',()=>{
 const r=rig({wisp:{...mute,regen:10,regenNeedsSpender:true}}),b=r.runtime;b.advance(1);assert.equal(r.state.charges.has('wisp'),false);
 r.regen.wisp=10;b.advance(1);assert.equal(r.state.charges.get('wisp'),1);
 const spec={charge:'wisp',on:'second',amount:1,max:10},inst={def:{id:'art',tags:['spell'],chargeGain:[spec],gauge:{need:10,regen:1}},state:{gaugeLock:.25},spent:'wisp',terms:{need:10,cap:10,gain:1,lockoutSec:1}};
 r.skills=[inst];b.advance(1);assert.equal(inst.state.gauge,.75);assert.equal(r.state.charges.get('wisp'),4);assert.equal(r.events.at(-1).tags,inst.def.tags);
});
test('timed taps preserve duplicate shared clocks, tree cleanup and matching channel definition',()=>{
 const a={charge:'fuel',on:'second',amount:1,max:10,everySeconds:1},second={...a,amount:2},move={charge:'fuel',on:'move',amount:1,max:10,perDistance:30},tree={charge:'other',on:'channelSecond',amount:1,max:10,everySeconds:.5};
 const inst={def:{id:'art',chargeGain:[a,second,move]},taps:[a,second,move,tree]},r=rig();r.skills=[inst];r.walked=30;r.channel='other';r.runtime.advance(.5);
 assert.equal(r.state.charges.get('fuel'),3);assert.equal(r.state.charges.has('other'),false);assert.equal(r.walked,0);
 r.channel='art';r.runtime.advance(.5);assert.equal(r.state.charges.get('other'),1);assert(r.state.clocks.has('treeTap:art:'+JSON.stringify(tree)));
 r.skills=[];r.runtime.advance(0);assert.equal([...r.state.clocks.keys()].some(k=>k.startsWith('treeTap:')),false);assert(r.state.clocks.has('fuel:second:art'));
});
test('modifier caches preserve count semantics, borrowed maps, copy-on-write rows and separate instances',()=>{
 const per=[{value:.2,stat:'speed',kind:'increased',tags:['attack']}],r=rig({fuel:{...mute,perCharge:per}}),s=r.state,b=r.runtime;
 b.gain('fuel',2,4);assert.equal(b.state,s);assert.notEqual(r.sources.get('charge:fuel')[0],per[0]);assert.equal(r.sources.get('charge:fuel')[0].value,.4);
 r.definitions.fuel.perCharge=[{value:.9}];b.gain('fuel',0,4);assert.equal(r.sources.get('charge:fuel')[0].value,.4);b.gain('fuel',1,4);assert.equal(r.sources.get('charge:fuel')[0].value,2.7);
 const other=rig(r.definitions);other.runtime.gain('fuel',1,3);assert.equal(s.charges.get('fuel'),3);assert.equal(other.state.charges.get('fuel'),1);
});
test('public charge numeric failures and reentry are explicit; malformed meters terminate',()=>{
 const r=rig(),b=r.runtime;
 for(const action of [()=>b.advance(NaN),()=>b.advance(-1),()=>b.gain('fuel',Infinity,3),()=>b.spend('fuel',NaN),()=>b.startDrain('fuel',-1),()=>b.gain('__regen',1,2)])assert.throws(action);
 assert.equal(r.state.charges.size,0);assert.equal(r.state.clocks.size,0);
 const tap={charge:'fuel',on:'second',amount:1,max:3,everySeconds:0};r.skills=[{def:{id:'art',chargeGain:[tap]}}];assert.throws(()=>b.advance(1),/interval/);assert.equal(r.state.charges.size,0);
 tap.everySeconds=1e-20;assert.throws(()=>b.advance(1),/work limit/);
 const reentrant=rig({fuel:{...mute,perCharge:[{value:1}]}}),ports={...reentrant.ports,setSource(){reentrant.runtime.spend('fuel',1);}};reentrant.runtime=new ChargeRuntime(reentrant.state,ports);
 assert.throws(()=>reentrant.runtime.gain('fuel',1,3),/Reentrant/);
});
test('charge costs distinguish admission from payment and clear fractional legacy overdraw',()=>{
 const r=rig(),cost={charge:'fuel',amount:'all',minimum:5,damagePerCharge:.2};
 assert.equal(chargeCostReady(4,cost),false);assert.equal(chargeCostReady(5,cost),true);assert.deepEqual(chargePayment(5,cost),{mult:2,consumed:5});
 r.state.charges.set('fuel',5);assert.deepEqual(r.runtime.pay(cost),{mult:2,consumed:5});assert.equal(r.state.charges.get('fuel'),0);
 const optional={...cost,optional:true};r.state.charges.set('fuel',-.5);assert.equal(chargeCostReady(-.5,optional),true);assert.deepEqual(r.runtime.pay(optional),{mult:1,consumed:-.5});assert.equal(r.state.charges.get('fuel'),0);
 assert.equal(chargeCostReady(4,{charge:'fuel',amount:0,minimum:5}),false);assert.equal(chargeCostReady(5,{charge:'fuel',amount:0,minimum:5}),true);
 r.runtime.gain('fuel',3,5);r.runtime.gain('fuel',-1,5);assert.equal(r.state.charges.get('fuel'),2);
});
test('standalone charge banks reproduce every original bank, partition and live-content course',()=>{
 const fixture=JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-twenty-two/charge-banks.json.gz',import.meta.url))));
 const definitions=JSON.parse(fs.readFileSync(new URL('../baseline/stat-catalogue.json',import.meta.url))),rules=new StatRules(definitions),wire=v=>JSON.parse(JSON.stringify(v));let transitions=0;
 for(const c of fixture.courses){
  const r=rig(structuredClone(fixture.definitions)),b=r.runtime;r.sheet=new StatSheet(rules);
  const snapshot=()=>wire({charges:[...r.state.charges],state:[...r.state.clocks],modCount:[...r.state.modifierCounts],events:r.events,sources:[...r.sources.keys()],stats:{attackSpeed:r.sheet.get('attackSpeed'),castSpeed:r.sheet.get('castSpeed'),moveSpeed:r.sheet.get('moveSpeed'),damage:r.sheet.get('damage',new Set(['attack']))}});
  if(c.name.startsWith('partition:')){r.regen.fury=10;b.gain('verse',10,12);}
  for(const [index,s] of c.steps.entries()){
   const charge=c.name.slice(5);
   if(s.label==='rounded-combined-cap'){r.capacity=1.5;r.namedCapacity=.75;}
   if(s.label==='same-count-does-not-refresh-changed-registry'){b.gain('rage',2,5);r.definitions.rage.perCharge=[{stat:'attackSpeed',kind:'increased',value:.9}];}
   if(s.label==='slotted-spender-four-seconds')r.skills=[{def:{id:'hush_of_the_wake'},spent:'wisp'}];
   if(s.label==='remove-spender-four-seconds')r.skills=[];
   assert.deepEqual(snapshot(),s.before,c.name+' before '+s.label);let result;
   switch(s.label){
    case 'gain-fractional':result=b.gain(charge,3.5,5);break;
    case 'hit-cap':result=b.gain(charge,99,5);break;
    case 'age-before-capped-refresh':result=b.advance(2.5);break;
    case 'capped-gain-does-not-refresh-idle':result=b.gain(charge,1,5);break;
    case 'spend-fractional':result=b.spend(charge,2.25);break;
    case 'start-drain':result=b.startDrain(charge,1.5);break;
    case 'gain-refused-while-draining':result=b.gain(charge,2,5);break;
    case 'quarter-second-drain':result=b.advance(.25);break;
    case 'three-quarter-second-drain':result=b.advance(.75);break;
    case 'drain-to-empty':result=b.advance(8);break;
    case 'gain-after-drain':result=b.gain(charge,2,5);break;
    case 'rounded-combined-cap':b.gain(charge,99,5);result=b.capFor(charge);break;
    case 'spend-beyond-bank':result=b.spend(charge,99);break;
    case 'elapsed-ten-seconds':{const n=Number(c.name.split(':')[1]);for(let i=0;i<n;i++)b.advance(10/n);break;}
    case 'gain-events-cap-at-64':for(let i=0;i<70;i++)b.gain('fury',1,100,undefined,i);break;
    case 'same-count-does-not-refresh-changed-registry':result=b.gain('rage',0,5);break;
    case 'changed-count-refreshes-registry':result=b.gain('rage',1,5);break;
    case 'no-spender-four-seconds':case 'slotted-spender-four-seconds':case 'remove-spender-four-seconds':for(let i=0;i<4;i++)b.advance(1);break;
    default:throw new Error('Unknown original bank command: '+s.label+' at '+index);
   }
   assert.deepEqual(result??null,s.result,c.name+' result '+s.label);assert.deepEqual(snapshot(),s.after,c.name+' after '+s.label);transitions++;
  }
 }
 assert.equal(transitions,321);
});
test('standalone timed meters reproduce original authored tap ordering and retained clocks',()=>{
 const load=name=>JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-twenty-two/'+name+'.json.gz',import.meta.url))));
 const fixture=load('charge-clocks'),definitions=load('charge-banks').definitions,wire=v=>JSON.parse(JSON.stringify(v));let transitions=0;
 for(const c of fixture.courses){
  const input=structuredClone(c.input),taps=input.taps,inst={def:{id:input.skill,tags:input.tags,chargeGain:taps.filter((_,i)=>input.origins[i]==='innate')},taps,sockets:[{def:{chargeGain:taps.filter((_,i)=>input.origins[i]==='support')}}]};
  const r=rig(structuredClone(definitions)),b=r.runtime;r.skills=[inst];
  const snapshot=()=>wire({charges:[...r.state.charges],state:[...r.state.clocks],modCount:[...r.state.modifierCounts],events:r.events,moveAcc:r.walked,skillState:inst.state??null,sources:[...r.sources.keys()]});
  for(const s of c.steps){assert.deepEqual(snapshot(),s.before,c.name+' before '+s.label);let result;
   switch(s.label){
    case 'idle-quarter-second':result=b.advance(.25);break;
    case 'walk-short':r.walked=29;result=b.advance(.5);break;
    case 'walk-cross-threshold':r.walked=125;result=b.advance(.75);break;
    case 'held-other-skill':r.channel='fireball';result=b.advance(2);break;
    case 'held-same-def-new-instance':r.channel=inst.def.id;result=b.advance(2);break;
    case 'released-hold':result=b.advance(1);break;
    case 'activate-aura-presence':r.toggled.add(inst.def.id);result=b.advance(1.5);break;
    case 'swap-to-summon-toggle-presence':result=b.advance(1.5);break;
    case 'deactivate-toggles':r.toggled.clear();result=b.advance(.1);break;
    case 'scoped-capacity-and-drain':r.capacity=i=>i?2:0;for(const tap of taps)b.startDrain(tap.charge,2);r.walked=300;result=b.advance(1);break;
    case 'unslot-keeps-nontree-clocks':r.skills=[];result=b.advance(.25);break;
    case 'reslot-and-resume':r.skills=[inst];r.channel=inst.def.id;r.walked=120;result=b.advance(3);break;
    case 'clear-tree-clocks':result=b.clearTreeClocks(inst.def.id);break;
    default:throw new Error('Unknown original clock command: '+s.label);
   }
   assert.deepEqual(result??null,s.result);assert.deepEqual(snapshot(),s.after,c.name+' after '+s.label);transitions++;
  }
 }
 assert.equal(transitions,299);
});
test('all authored charge costs match original admission, payment and modifier synchronization',()=>{
 const load=name=>JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-twenty-two/'+name+'.json.gz',import.meta.url))));
 const fixture=load('resource-costs'),definitions=load('charge-banks').definitions;
 for(const c of fixture.cases){const r=rig(structuredClone(definitions)),cost=c.cost??undefined;if(cost)r.state.charges.set(cost.charge,c.have);
  assert.equal(chargeCostReady(c.have,cost),c.ready,c.id+' at '+c.have);assert.deepEqual(r.runtime.pay(cost),c.payment,c.id+' payment');
  assert.deepEqual({charges:[...r.state.charges],modCount:[...r.state.modifierCounts],sources:[...r.sources.keys()]},c.after,c.id+' state');
 }
 assert.equal(fixture.cases.length,240);
});
