import {test} from 'node:test';import assert from 'node:assert/strict';
import {ProjectileDelivery,rollDeliveryCount} from '../dist/projectile-delivery.js';
function setup(){
  const shots=[],salvos=[],ambushes=[],trace=[],stats={projectileCount:0,projNova:0,spreadAngle:1,volleySpacing:1};let time=10;
  const skill={def:{id:'bolt'}},caster={pos:{x:0,y:0},facing:0,sheet:{get:key=>stats[key]??0},speedFactor:()=>1};
  const ports={time:()=>time,random:()=>{trace.push('random');return .5;},projectilesPerCharge:()=>0,caromCapacity:()=>2,
    clamp:p=>p,spawn:(a,i,pos,angle,options)=>shots.push({a,i,pos,angle,options}),anchor:()=>trace.push('anchor'),minions:()=>[],embed(){},triggerAmbush:()=>trace.push('trigger')};
  const frame={caster,skill,aim:{x:100,y:0},delivery:{type:'projectile',radius:3,count:3},multiplier:2,flat:{fire:1},tags:new Set(),modifiers:[],gaugePower:1,chargesSpent:0,corpseFeast:0,bonusProjectiles:0,ventRounds:0,color:'red'};
  const runtime=new ProjectileDelivery(salvos,ambushes,1,ports);return{shots,salvos,ambushes,trace,stats,skill,caster,ports,frame,runtime,setTime:n=>time=n};
}
test('count draws only for ranges, even when the two endpoints coincide',()=>{
  let draws=0;const random=()=>{draws++;return .5;};assert.equal(rollDeliveryCount(undefined,2,random),3);assert.equal(rollDeliveryCount(3,-1,random),2);assert.equal(draws,0);
  assert.equal(rollDeliveryCount([3,3],-5,random),0);assert.equal(draws,1);
});
test('fan retains exact caster/skill and flat identity, and copies each destination',()=>{
  const h=setup();h.runtime.execute(h.frame);assert.equal(h.shots.length,3);assert.equal(h.shots[1].angle,0);assert.equal(h.shots[0].angle,-h.shots[2].angle);
  for(const shot of h.shots){assert.equal(shot.a,h.caster);assert.equal(shot.i,h.skill);assert.equal(shot.options.flat,h.frame.flat);assert.notEqual(shot.options.dest,h.frame.aim);}
  assert.notEqual(h.shots[0].options.dest,h.shots[1].options.dest);assert.deepEqual(h.trace,[]);
});
test('salvo precedence beats volley and ring; moving origins remain live while cursor origins are detached',()=>{
  const h=setup();h.stats.fireSalvo=1;h.stats.fireVolley=1;h.frame.delivery.ring={};h.runtime.execute(h.frame);
  assert.equal(h.shots.length,1);assert.equal(h.salvos[0].origin,null);assert.equal(h.salvos[0].shots,2);assert.deepEqual(h.trace,[]);
  h.frame.delivery.origin='cursor';h.runtime.execute(h.frame);assert.deepEqual(h.salvos[1].origin,{x:100,y:0});assert.notEqual(h.salvos[1].origin,h.shots[1].pos);
});
test('volleys alternate centered ranks and nova overrides salvo without ring draws',()=>{
  const h=setup();h.frame.delivery.fire='volley';h.frame.delivery.volleySpacing=20;h.runtime.execute(h.frame);
  assert.deepEqual(h.shots.map(s=>s.pos.y),[0,20,-20]);h.shots.length=0;h.stats.projNova=2;h.stats.fireSalvo=1;h.runtime.execute(h.frame);assert.equal(h.shots.length,5);assert.equal(h.salvos.length,0);
});
test('anchor window is strict, duplicate id instances keep separate anchors, and release clears before spawn',()=>{
  const h=setup();h.frame.delivery.caroms={window:3,anchors:2};assert.equal(h.runtime.execute(h.frame),null);h.setTime(13);
  h.ports.spawn=(a,i,pos,angle,options)=>{assert.equal(i.state.anchors.length,0);h.shots.push(options);};
  assert.deepEqual(h.runtime.execute({...h.frame,aim:{x:200,y:0}}),{x:100,y:0});assert.equal(h.shots.length,3);assert.equal(h.shots[0].patrol,h.shots[1].patrol);
  const other={def:{id:'bolt'}};assert.equal(h.runtime.execute({...h.frame,skill:other}),null);h.setTime(17);assert.equal(h.runtime.execute({...h.frame,skill:other}),null);assert.equal(other.state.anchors.length,1);
});
test('hang re-press matches owner and skill id and triggers before placing another body',()=>{
  const h=setup();h.frame.delivery.caroms={window:3,anchors:2,hang:{}};h.ambushes.push({caster:{},inst:h.skill},{caster:h.caster,inst:{def:{id:'bolt'}}});
  h.ports.triggerAmbush=(index,mult,flat)=>h.trace.push([index,mult,flat]);h.ports.embed=()=>assert.fail('must trigger first');
  assert.equal(h.runtime.execute(h.frame),null);assert.deepEqual(h.trace,[[1,2,h.frame.flat]]);
});
test('count investment and chance precede geometry, ring consumes phase draw only when enabled',()=>{
  const h=setup();h.frame.delivery={type:'projectile',radius:3,count:[1,2],ring:{}};h.frame.gaugePower=2;h.frame.ventRounds=1;h.stats.projectileCountChance=1;
  h.runtime.execute(h.frame);assert.equal(h.shots.length,7);assert.deepEqual(h.trace,['random','random','random']);
});
