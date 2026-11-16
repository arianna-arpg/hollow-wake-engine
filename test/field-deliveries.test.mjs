import {test} from 'node:test';import assert from 'node:assert/strict';
import {FieldDeliveries} from '../dist/field-deliveries.js';import {MaddenBanks,flattenPulseQueue} from '../dist/combat-fields.js';
function setup(){
  const skill={def:{id:'field',tags:['spell']}},stats={effectDuration:1,cascadeStep:1},actor={id:1,pos:{x:0,y:0},facing:0,tier:0,sheet:{get:(k,_t,_m,b)=>stats[k]??b??0}};
  const state={zones:[],domainSeq:0,sparkSeq:0},trace=[],plan={native:undefined,appended:[]};
  const ports={time:()=>10,random:()=>{trace.push('random');return .5;},clampGroundTarget:(_a,p)=>({...p}),clampPos:p=>p,skillOcclusion:()=> 'free',enemiesOf:()=>[],
    instanceEffects:()=>[],instanceBirth:()=>undefined,instanceTurret:()=>undefined,expireZone:z=>trace.push(['retire',state.zones.includes(z)]),socketSpec:()=>undefined,
    instancePulsePlan:()=>plan,instanceSizeOver:()=>undefined,maddenBankOf:()=>undefined,hostSockets:()=>[],instanceCascadePlan:()=>({recasts:[]}),skillPresenceVoice:()=>undefined,flash(){}};
  const frame={caster:actor,inst:skill,d:{type:'ground',radius:30,castRange:200},aim:{x:100,y:0},tags:new Set(['spell']),extra:[],aoeScale:1,arcScale:1,useMult:2,flatBonus:{fire:3},cosmeticColor:'red',ventRounds:0,gPow:1};
  const runtime=new FieldDeliveries(state,{conjure:{lineStep:1,lineMaxHops:4},forwarding:{scale:{},scaleDefault:1}},ports);
  return{skill,stats,actor,state,trace,plan,ports,frame,runtime};
}
test('converging surfaces share payload identity but own hit, pulse and exposure state',()=>{
  const h=setup();h.plan.native={delay:1,count:2};h.plan.appended=[{delay:.3,count:2}];
  Object.assign(h.frame.d,{sweep:{arcDeg:180,converge:true},hitOnce:true,exposure:1,exposureDomain:true,domain:{allyMods:[]},emit:{skillId:'bolt',interval:1},marker:{cap:2}});
  h.runtime.ground(h.frame);const [a,b]=h.state.zones;
  for(const z of [a,b]){assert.equal(z.caster,h.actor);assert.equal(z.inst,h.skill);assert.equal(z.flatBonus,h.frame.flatBonus);}
  assert.notEqual(a.struck,b.struck);assert.notEqual(a.exposure.dwell,b.exposure.dwell);assert.notEqual(a.pulse.queue,b.pulse.queue);assert.notEqual(a.pos,b.pos);
  assert.equal(b.domain,undefined);assert.equal(b.emit,undefined);assert.equal(b.marker,undefined);assert.equal(b.exposureDomain,undefined);
  a.pulse.queue.shift();a.struck.add(3);assert.equal(b.pulse.queue.length,2);assert.equal(b.struck.size,0);
});
test('exclusive replacement retires old same-owner same-skill rows before removal',()=>{
  const h=setup();h.runtime.ground(h.frame);const original=h.state.zones[0],foreign={...original,caster:{}};h.state.zones.push(foreign);
  h.frame.d.exclusive=true;h.runtime.ground(h.frame);assert.deepEqual(h.trace,[['retire',true]]);assert.equal(h.state.zones[0],foreign);assert(!h.state.zones.includes(original));
});
test('pure pulse fields disable tick damage and stay alive through appended rhythms',()=>{
  const h=setup();h.plan.native={delay:.5,count:3,interval:.2,intervalStep:.5};h.plan.appended=[{delay:1,count:2,interval:.3}];h.runtime.ground(h.frame);
  const z=h.state.zones[0];assert.equal(z.tickInterval,Infinity);assert.equal(z.tickTimer,Infinity);assert(Math.abs(z.linger-2.2)<1e-12);assert.equal(z.pulse.next,10.5);
});
test('madden banks belong to exact skills, survive equal specs and reset when the dwell threshold changes',()=>{
  let threshold=2;const banks=new MaddenBanks(()=>threshold),i={},other={},first=banks.of(i);first.dwell.set(1,.5);assert.equal(banks.of(i),first);assert.notEqual(banks.of(other),first);
  threshold=3;assert.notEqual(banks.of(i),first);assert.equal(banks.of(i).dwell.size,0);threshold=undefined;assert.equal(banks.of(i),undefined);threshold=3;assert.equal(banks.of(i).after,3);
});
test('appended pulse cadence preserves damage progression and opening delay',()=>{
  const spec={delay:.3,count:3,interval:.2,intervalStep:2,dmgMult:2,dmgStep:.5,radiusMult:3,radiusStep:2},before=structuredClone(spec);
  assert.deepEqual(flattenPulseQueue([spec],.5),[{delay:.3,dmgMult:2,radiusMult:3},{delay:.2,dmgMult:1,radiusMult:6},{delay:.1,dmgMult:.5,radiusMult:12}]);assert.deepEqual(spec,before);
});
test('storm enemy placements retain scatter and radial random draws, and armed order belongs to the session',()=>{
  const h=setup();h.actor.casting={mode:'channel',inst:h.skill};h.ports.enemiesOf=()=>[{pos:{x:100,y:0}}];h.frame.d={type:'storm',count:2,interval:.2,areaRadius:30,hitRadius:10,castRange:200,atEnemies:true,scatter:0,awaitRelease:{}};
  h.runtime.storm(h.frame);assert.equal(h.trace.length,6);assert.deepEqual(h.state.zones.map(z=>z.armSeq),[0,1]);assert(h.state.zones.every(z=>z.delay===9999&&z.armed));
  assert.notEqual(h.state.zones[0].pos,h.frame.aim);assert.equal(setup().state.sparkSeq,0);
});
test('fissures delegate to their SDK lane before ordinary field construction',()=>{
  const h=setup();h.frame.d.fissure={length:100,speed:50,branches:2};h.stats.fissureCount=1;const laid=[];h.ports.layFissure=(...args)=>laid.push(args);
  assert.deepEqual(h.runtime.ground(h.frame),h.frame.aim);assert.equal(laid.length,2);assert.equal(h.state.zones.length,0);assert.equal(laid[0][0],h.actor);assert.equal(laid[0][6],h.frame.flatBonus);
});
