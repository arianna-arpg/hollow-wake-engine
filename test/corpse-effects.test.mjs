import test from 'node:test';
import assert from 'node:assert/strict';
import {CorpseEffects} from '../dist/corpse-effects.js';
function setup(){
  const bodies=[],events=[],rules={max:2,duration:6,mint:{spread:42,life:30,lifePerLevel:8},batch:{aoePerExtra:.12}};
  const caster={tier:1,sheet:{get:()=>0}},ports={monster:id=>id==='skeleton',level:()=>3,random:()=>.5,
    clamp:(p,r,m)=>{events.push(['clamp',r,m]);return p;},layerAt:()=>1,created:p=>events.push(['created',p]),gathered:p=>events.push(['gathered',p]),empty:()=>events.push(['empty'])};
  return{bodies,events,rules,caster,ports,service:new CorpseEffects(rules,bodies,ports)};
}
test('corpse creation evicts oldest per birth, consumes two draws and preserves level reads',()=>{
  const s=setup();s.bodies.push({defId:'old'});let draws=0,levels=0;s.ports.random=()=>{draws++;return .5;};s.ports.level=()=>++levels;
  s.service.spawn(s.caster,{x:20,y:30},'skeleton',3,new Set(),[],'white');
  assert.equal(s.bodies.length,2);assert.equal(draws,6);assert.deepEqual(s.bodies.map(c=>[c.level,c.maxLife]),[[3,62],[5,78]]);
  assert.deepEqual(s.bodies[0].pos,{x:20,y:30});assert.equal(s.bodies[0].tier,1);assert.equal(s.bodies[0].remaining,6);
});
test('unknown monster consumes no random and does not evict; a known zero count still presents',()=>{
  const s=setup();s.ports.random=()=>assert.fail('random');s.service.spawn(s.caster,{x:0,y:0},'missing',2,new Set(),[],'white');assert.deepEqual(s.events,[]);
  s.service.spawn(s.caster,{x:0,y:0},'skeleton',0,new Set(),[],'white');assert.deepEqual(s.events,[['created',{x:0,y:0}]]);
});
test('gathering retains roster order, inclusive reach, inherited layers and unselected identities',()=>{
  const s=setup(),a={pos:{x:10,y:0},tier:1},b={pos:{x:-10,y:0}},far={pos:{x:10.001,y:0},tier:1},other={pos:{x:0,y:0},tier:2};
  s.bodies.push(a,b,far,other);s.service.gather(s.caster,{x:0,y:0},'gather',10,1,new Set(),[],'white');
  assert.deepEqual(a.pos,{x:0,y:0});assert.equal(b.pos.x,Math.cos(2.1)*22);assert.equal(b.pos.y,Math.sin(2.1)*22);
  assert.deepEqual(far.pos,{x:10.001,y:0});assert.deepEqual(other.pos,{x:0,y:0});assert.equal(s.bodies[0],a);
});
test('corpse batch rounds nonnegative extra bodies and independently widens gathering reach',()=>{
  const s=setup();s.caster.sheet.get=()=>1.6;s.rules.max=10;s.service.spawn(s.caster,{x:0,y:0},'skeleton',1,new Set(),[],'white');assert.equal(s.bodies.length,3);
  const c={pos:{x:12,y:0},tier:1};s.bodies.splice(0,s.bodies.length,c);s.service.gather(s.caster,{x:0,y:0},'gather',10,1,new Set(),[],'white');assert.deepEqual(c.pos,{x:0,y:0});
});
test('placement failure preserves the original eviction-before-placement behavior',()=>{
  const s=setup(),a={defId:'first'},b={defId:'second'};s.bodies.push(a,b);s.ports.clamp=()=>{throw Error('placement');};
  assert.throws(()=>s.service.spawn(s.caster,{x:0,y:0},'skeleton',1,new Set(),[],'white'),/placement/);assert.deepEqual(s.bodies,[b]);
});
