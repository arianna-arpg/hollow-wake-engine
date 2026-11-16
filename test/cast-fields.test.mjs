import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CastFields} from '../dist/cast-fields.js';
import {MinionPour} from '../dist/minion-pour.js';
function setup(){
  const trace=[],zones=[],caster={id:1,tier:2,facing:.5,sheet:{get:s=>s==='aoeShape'?3:s==='active'?1:0}},skill={def:{id:'field'}};
  const ports={random:()=>.5,terrain:(...args)=>trace.push(['terrain',...args]),conjure:(...args)=>trace.push(['conjure',...args]),
    kindle:(...args)=>{trace.push(['kindle',...args]);return true;},kindled:p=>trace.push(['kindled',p]),
    vent:(...args)=>{trace.push(['vent',...args]);return{reach:80};},vented:(...args)=>trace.push(['vented',...args]),
    lure:(...args)=>trace.push(['lure',...args]),portal:a=>trace.push(['portal',a])};
  return {trace,zones,caster,skill,ports,runtime:new CastFields(zones,[{stat:'active',grant:{id:'extra'}},{stat:'inactive',grant:{id:'absent'}}],ports),
    frame:{caster,skill,origin:{x:10,y:20},delivery:'self',areaScale:4,durationScale:.5,multiplier:2,color:'#fff',tags:new Set(),modifiers:[]}};
}
test('terrain and conjured platforms use area/duration scaling and preserve borrowed grants',()=>{
  const h=setup(),grant={id:'base'},grants=[grant];h.runtime.apply(h.frame,{type:'terrain',kind:'mud',radius:3,duration:6});
  h.runtime.apply(h.frame,{type:'conjure',radius:3,duration:6,grants,look:'cloud',follow:true});
  assert.deepEqual(h.trace[0],['terrain',{x:10,y:20},'mud',12,3]);
  const options=h.trace[1].at(-1);assert.equal(options.caster,h.caster);assert.equal(options.grants[0],grant);assert.notEqual(options.grants,grants);
  assert.deepEqual(options.grants.map(g=>g.id),['base','extra']);assert.equal(grants.length,1);assert.equal(options.follow,true);
});
test('delivered ground fields and projectile fields are not also emitted at the caster',()=>{
  const h=setup();h.frame.delivery='ground';for(const effect of[{type:'conjure',radius:1,duration:1},{type:'kindle',kind:'x'},{type:'vent',bank:'x',radius:1,duration:1}])h.runtime.apply(h.frame,effect);
  h.frame.delivery='projectile';h.runtime.apply(h.frame,{type:'lure',radius:1,sec:2});h.runtime.apply(h.frame,{type:'spawnZone',radius:1,duration:1});
  assert.deepEqual(h.trace,[]);assert.deepEqual(h.zones,[]);
});
test('kindles consume one draw and fog uses square-root reach plus minimum duration',()=>{
  const h=setup();let draws=0;h.ports.random=()=>{draws++;return .5;};h.runtime.apply(h.frame,{type:'kindle',kind:'lamp'});
  assert.deepEqual(h.trace[0].at(-1),{radius:25,poolMul:.5});assert.equal(draws,1);
  h.frame.areaScale=0;h.frame.durationScale=0;h.runtime.apply(h.frame,{type:'vent',bank:'steam',radius:20,duration:10});
  assert.deepEqual(h.trace[2],['vent','steam',{x:10,y:20},2,1,2]);assert.deepEqual(h.trace[3],['vented',{x:10,y:20},48,'#eef6f8']);
});
test('refused field placement does not emit successful placement cues',()=>{
  const h=setup();h.ports.kindle=()=>false;h.ports.vent=()=>null;
  h.runtime.apply(h.frame,{type:'kindle',kind:'lamp'});h.runtime.apply(h.frame,{type:'vent',bank:'steam',radius:1,duration:1});assert.equal(h.trace.length,0);
});
test('lures preserve unscaled authored radius and zone position is detached while actor/skill identity stays live',()=>{
  const h=setup();h.runtime.apply(h.frame,{type:'lure',radius:30,sec:5});assert.deepEqual(h.trace[0],['lure','skill#1#field',{x:10,y:20},30,.5,90,5,2]);
  h.runtime.apply(h.frame,{type:'spawnZone',radius:30,duration:5});const zone=h.zones[0];assert.equal(zone.caster,h.caster);assert.equal(zone.inst,h.skill);
  h.frame.origin.x=99;assert.equal(zone.pos.x,10);assert.equal(zone.radius,120);assert.equal(zone.linger,2.5);assert.equal(zone.dmgMult,1);assert.equal(zone.shape,3);
});
test('portal invocation carries only the actor to the host policy',()=>{
  const h=setup();h.runtime.apply(h.frame,{type:'townPortal'});assert.deepEqual(h.trace,[['portal',h.caster]]);
});
test('caster fields publish into the current owner array after field retirement replaces it',()=>{
  const h=setup(),owner={zones:h.zones},runtime=new CastFields(owner,[],h.ports);
  const retired=owner.zones;owner.zones=[];
  runtime.apply(h.frame,{type:'spawnZone',radius:30,duration:5});
  assert.equal(retired.length,0);assert.equal(owner.zones.length,1);
  assert.equal(owner.zones[0].caster,h.caster);assert.equal(owner.zones[0].inst,h.skill);
});
test('dense pours select first eligible pocket, account only successful births and fall back on blocked geometry',()=>{
  const pockets=[{anchorId:1,kindIdx:2,extinct:true,poured:false,live:0},{anchorId:1,kindIdx:2,extinct:false,poured:false,live:3}],calls=[],def={plies0:4};
  let draws=0,births=0;const runtime=new MinionPour(pockets,12,{kind:()=>2,definition:()=>def,random:()=>{draws++;return .5;},open:()=>false,
    spawn:(...args)=>{calls.push(args);def.plies0++;return births++===0?-1:7;}});
  assert.equal(runtime.pour({id:1,team:'player'},{monsterId:'rat',count:[2,2]},{x:10,y:20}),1);
  assert.equal(draws,5);assert.deepEqual(calls,[[2,10,20,1,0,4,1],[2,10,20,1,0,5,1]]);assert.equal(pockets[1].live,4);assert(pockets[1].poured);assert(!pockets[0].poured);
});
test('owned pours do not borrow ambient pockets and retain draws after capacity exhaustion',()=>{
  const calls=[];let draws=0;const runtime=new MinionPour([],10,{kind:()=>0,definition:()=>({plies0:2}),random:()=>{draws++;return 0;},open:()=>true,spawn:(...args)=>{calls.push(args);return-1;}});
  assert.equal(runtime.pour({id:9,team:'ally'},{monsterId:'rat',count:[2,4],owned:true},{x:0,y:0}),0);assert.equal(draws,5);
  assert.deepEqual(calls[0],[0,4,0,0,9,2,-1]);
});
test('missing dense kind does not allocate, consume randomness or touch pockets',()=>{
  const runtime=new MinionPour([],10,{kind:()=>-1,definition:()=>assert.fail(),random:()=>assert.fail(),spawn:()=>assert.fail()});
  assert.equal(runtime.pour({id:9,team:'player'},{monsterId:'missing',count:[2,4]},{x:0,y:0}),0);
});
