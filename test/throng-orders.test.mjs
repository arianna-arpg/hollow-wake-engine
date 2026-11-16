import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ThrongOrders,promoteNearest,combatOwnedBy} from '../dist/throng-orders.js';
function setup(){
  const trace=[],skill={def:{id:'swarm',throng:{tier:'lite',monsterId:'rat'}}};
  const actor=(id,over={})=>({id,dead:false,pos:{x:0,y:0},radius:10,tier:0,skills:[],sheet:{get:()=>0},throngCarried:true,casting:{},ownedBy(a){return combatOwnedBy(this,a);},...over});
  const caster=actor(1,{skills:[skill]}),bodies=[actor(2,{owner:caster}),actor(3,{owner:caster})],actors=[caster,...bodies],enemies=[];
  const ports={actors:()=>actors,enemies:()=>enemies,time:()=>10,evolution:()=>({}),bodies:()=>bodies,rosterCount:()=>2,capacity:()=>2,
    kind:()=>0,used:()=>8,countOwned:()=>4,promote:(...args)=>trace.push(['promote',...args]),unclasp:a=>trace.push(['unclasp',a.id]),clamp:p=>p,
    pooledOrder:(...args)=>trace.push(['pooled',...args]),issue:(a,o)=>{a.order=o;trace.push(['issue',a.id]);},empty:()=>trace.push('empty')};
  return{trace,skill,actor,caster,bodies,actors,enemies,ports,runtime:new ThrongOrders({linger:2,radius:30,pin:20},ports)};
}
test('swarm commands reach both pool and full bodies with stable quarry ties and detached marks',()=>{
  const h=setup();h.enemies.push(h.actor(4,{pos:{x:5,y:0}}),h.actor(5,{pos:{x:-5,y:0}}));const aim={x:0,y:0};
  h.runtime.direct(h.caster,h.skill,aim,{});assert.equal(h.bodies[0].order.targetId,4);assert.equal(h.bodies[0].order.until,12);
  assert.notEqual(h.bodies[0].order.pos,h.bodies[1].order.pos);assert.notEqual(h.bodies[0].order.pos,aim);
  assert.deepEqual(h.trace[0],['pooled',1,0,{x:0,y:0,until:12,targetId:4}]);assert(h.bodies.every(b=>!b.throngCarried));
});
test('full-dive evolution promotes first, detaches riders and commits bodies in roster order',()=>{
  const h=setup();h.ports.evolution=()=>({fullDive:true});h.bodies[0].clingTo={};h.runtime.direct(h.caster,h.skill,{x:40,y:50},{});
  assert.equal(h.trace[0][0],'promote');assert.deepEqual(h.trace[1],['unclasp',2]);assert(h.bodies.every(b=>b.casting===null&&!b.throngCarried));
  assert.deepEqual(h.bodies[0].throngDive,{x:40,y:50});assert.notEqual(h.bodies[0].throngDive,h.bodies[1].throngDive);assert.equal(h.trace.length,2);
});
test('whirlwind preserves carried state and an existing dive excludes only that body from commands',()=>{
  const h=setup();h.ports.evolution=()=>({whirlwind:true});h.runtime.direct(h.caster,h.skill,{x:0,y:0},{});assert(h.bodies[0].throngCarried);assert(!h.bodies[0].order);
  h.ports.evolution=()=>({});h.bodies[0].throngDive={x:1,y:2};h.runtime.direct(h.caster,h.skill,{x:0,y:0},{});
  assert(!h.bodies[0].order);assert(h.bodies[1].order);assert(h.bodies[0].throngCarried);
});
test('a pool-only swarm can be ordered while an empty swarm emits explicit refusal',()=>{
  const h=setup();h.bodies.length=0;h.runtime.direct(h.caster,h.skill,{x:0,y:0},{});assert.equal(h.trace[0][0],'pooled');
  h.ports.countOwned=()=>0;h.runtime.direct(h.caster,h.skill,{x:0,y:0},{});assert.equal(h.trace.at(-1),'empty');
});
test('court promotion snapshots keepers, respects host anchor and skips squad-only commands',()=>{
  const h=setup();h.bodies[0].skills=[h.skill];h.skill.hostSkillId='swarm';
  h.runtime.promoteCommand(h.caster,h.skill,'squad');assert.equal(h.trace.length,0);
  h.ports.promote=(...args)=>{h.trace.push(args);h.actors.push(h.actor(9,{owner:h.caster,skills:[h.skill]}));};
  h.runtime.promoteCommand(h.caster,h.skill,'both',50);assert.equal(h.trace.length,2);assert.equal(h.trace[0][1].owner,1);assert.equal(h.trace[1][1].owner,2);
});
test('pool promotion filters before stable ranking and failed rows do not consume capacity',()=>{
  const pool={used:6,alive:new Uint8Array([1,1,1,1,0,1]),owner:[1,1,1,2,1,1],kind:[0,0,0,0,0,0],team:[0,0,0,0,0,0],story:[2,2,2,2,2,3],x:[10,-10,20,1,1,1],y:[0,0,0,0,0,0]},visited=[];
  const out=promoteNearest(pool,{x:0,y:0},{within:20,max:2,owner:1,kindIdx:0,opposing:'player',story:2},row=>{visited.push(row);return row===0?null:{row};});
  assert.deepEqual(visited,[0,1,2]);assert.deepEqual(out,[{row:1},{row:2}]);
});
test('pool snapshot does not promote new arrivals and ranking may use a different point',()=>{
  const pool={used:2,alive:[1,1],owner:[1,1],kind:[0,0],team:[0,0],story:[0,0],x:[-10,10],y:[0,0]},visited=[];
  promoteNearest(pool,{x:0,y:0},{within:10,max:5,rank:{x:10,y:0}},row=>{visited.push(row);pool.used=3;pool.alive.push(1);pool.x.push(0);pool.y.push(0);return{row};});
  assert.deepEqual(visited,[1,0]);
});
test('court ownership accepts eight hops and terminates even on a cycle',()=>{
  const lord={},chain=[lord];for(let i=0;i<9;i++)chain.push({owner:chain.at(-1)});
  assert(combatOwnedBy(chain[8],lord));assert(!combatOwnedBy(chain[9],lord));const cycle={};cycle.owner=cycle;assert(!combatOwnedBy(cycle,lord));
});
