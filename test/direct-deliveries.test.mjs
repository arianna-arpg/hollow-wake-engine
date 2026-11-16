import {test} from 'node:test';import assert from 'node:assert/strict';import {DirectDeliveries} from '../dist/direct-deliveries.js';
function setup(){
  const events=[],effects=[],enemies=[],actors=[],stats={effectDuration:2,multiTarget:1};
  const make=(id,x=0,over={})=>({id,pos:{x,y:0},radius:5,tier:0,dead:false,untargetable:false,team:'enemy',statuses:[],sheet:{get:key=>stats[key]??0},casting:null,gainWard:n=>events.push(['ward',id,n]),...over});
  const caster=make(1,0,{team:'player'}),skill={def:{id:'direct',tags:['spell'],effects:[]}},ports={time:()=>10,actors:()=>actors,enemies:()=>enemies,effects:()=>effects,rite:()=>false,
    arrive:(_a,_i,at)=>events.push(['arrive',{...at}]),selfRelease:()=>events.push('release'),statusDuration:()=>3,trailSpec:n=>({amount:n}),
    kill:a=>{a.dead=true;events.push(['kill',a.id]);},feeding:a=>events.push(['meal',a.id]),critical:(_a,_i,at)=>{events.push(['critical',at]);return 2;},stream:(b,_a,_i,fx,_spent,c)=>events.push(['stream',b.id,fx.resource,c]),
    heal:(_a,_i,b)=>events.push(['heal',b.id]),cleanse:b=>events.push(['cleanse',b.id]),tame:(_a,_i,b)=>b.owner=caster,hit:(_a,_i,b,m,_depth,flat)=>events.push(['hit',b.id,m,flat]),
    requiredStatuses:()=>undefined,nearestBody:a=>({pos:a.pos,r:a.radius,seg:-1}),noteBody:a=>events.push(['body',a.id]),frontSplash(){},strikeSurfaces(){}};
  const frame={caster,skill,origin:caster.pos,tags:new Set(),modifiers:[],multiplier:2,flat:{fire:1},areaScale:1,chargesSpent:3};
  return{events,effects,enemies,actors,stats,make,caster,skill,ports,frame,runtime:new DirectDeliveries(ports)};
}
test('friendly target recovery shares a critical roll at the recipient position and does not run enemy delivery',()=>{
  const h=setup(),friend=h.make(2,40,{team:'player'});h.effects.push({type:'restoreOverTime',resource:'life'},{type:'ward',amount:2,perCharge:true},{type:'restoreOverTime',resource:'mana'});
  assert.equal(h.runtime.target({...h.frame,target:{actor:friend,pos:friend.pos}},{splash:50}),null);
  assert.deepEqual(h.events,[['critical',friend.pos],['stream',2,'life',2],['ward',2,6],['stream',2,'mana',2],['arrive',friend.pos]]);
});
test('native tame owns hostile target resolution and arrival requires actual allegiance change',()=>{
  const h=setup(),beast=h.make(2);h.skill.def.effects=[{type:'tame',tags:['beast']}];h.runtime.target({...h.frame,target:{actor:beast,pos:beast.pos}},{splash:50});assert.deepEqual(h.events,[['arrive',beast.pos]]);
  h.events.length=0;delete beast.owner;h.ports.tame=()=>{};h.runtime.target({...h.frame,target:{actor:beast,pos:beast.pos}},{});assert.deepEqual(h.events,[]);
});
test('target expansion is stable, status-filtered and splash may strike an expanded target again without paid flat damage',()=>{
  const h=setup(),main=h.make(2),first=h.make(3,10,{statuses:[{id:'burn'}]}),tie=h.make(4,-10,{statuses:[{id:'burn'}]});h.enemies.push(main,first,tie);h.ports.requiredStatuses=()=>['burn'];
  h.runtime.target({...h.frame,target:{actor:main,pos:main.pos}},{splash:20});
  assert.deepEqual(h.events.filter(e=>e[0]==='hit'),[['hit',2,2,h.frame.flat],['hit',3,2,h.frame.flat],['hit',3,1,undefined],['hit',4,1,undefined]]);
});
test('self movement trails use longest buff/status duration, copy the origin and keep exact skill identity',()=>{
  const h=setup();h.stats.moveTrail=2;h.effects.push({type:'buff',duration:4},{type:'status',status:'slow'});h.runtime.self(h.frame);
  assert.equal(h.caster.walkTrail.until,18);assert.equal(h.caster.walkTrail.inst,h.skill);assert.notEqual(h.caster.walkTrailPrev,h.caster.pos);assert.equal(h.caster.walkTrailOdo,0);
});
test('amalgam counts its meal before death callbacks and does not eat targets at the exact radius',()=>{
  const h=setup();h.skill.def.amalgam={cap:1,radius:20};h.caster.casting={mode:'channel'};const edge=h.make(2,20,{owner:h.caster}),near=h.make(3,10,{owner:h.caster});h.actors.push(edge,near);
  const kill=h.ports.kill;h.ports.kill=a=>{assert.equal(h.caster.casting.amalgamFed,1);kill(a);};h.runtime.self(h.frame);h.runtime.self(h.frame);
  assert.equal(near.dead,true);assert.equal(edge.dead,false);assert.equal(h.events.filter(e=>e[0]==='kill').length,1);
});
