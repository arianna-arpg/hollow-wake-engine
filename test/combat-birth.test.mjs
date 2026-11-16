import test from 'node:test';import assert from 'node:assert/strict';import {CombatBirth} from '../dist/combat-birth.js';import {BirthPool} from '../dist/birth-pool.js';
function host(){
  const actors=[],events=[];let next=0,draws=0,now=0;
  const make=(id='rat',level=3,team='enemy',owner)=>({id:++next,defId:id,level,team,owner,pos:{x:0,y:0},radius:5,tier:2,dead:false,color:'red',noBounty:false,lifespan:0,sheet:{get:()=>2},addBuff:(...args)=>events.push(['buff',...args]),applyStatus:(...args)=>events.push(['status',...args])});
  const caster=make();caster.pos={x:20,y:30};actors.push(caster);const skill={def:{id:'birth',color:'blue'}};
  const random=()=>{draws++;return .5;},rules={count:[1,1],cap:8,minionCap:2,scatter:26,flash:{radius:34,life:.3},incubate:{vessel:'egg'},orphan:{witherSec:6,rout:{status:'bolted',durMul:2}},frenzy:{id:'orphan_frenzy'}};
  const ports={actors:()=>actors,time:()=>now,random,monsterExists:id=>['rat','egg'].includes(id),pool:new BirthPool({},()=>undefined,random),
    spawnMinion:(owner,i,opts)=>{events.push(['summon',owner,i,opts]);return null;},createMonster:make,lifeline:owner=>owner.id,freeSpot:at=>({...at}),emerge:(...args)=>events.push(['emerge',...args]),flash:(...args)=>events.push(['flash',...args]),kill:a=>{a.dead=true;events.push(['kill',a.id]);runtime.onDeath(a);},
    corpseSpawn:()=>undefined,clamp:at=>({...at}),skillExists:id=>id==='payload',makeSkill:(id,level)=>({def:{id,color:'blue'},level}),effectiveLevel:i=>i.level,execute:(...args)=>{events.push(['execute',...args]);return true;},hatched:a=>events.push(['hatched',a])};
  const runtime=new CombatBirth(rules,ports);return{actors,events,caster,skill,ports,rules,make,runtime,get draws(){return draws;},set time(v){now=v;}};
}
test('enemy births count before scatter and preserve source faction, tags, orphan fate and no-bounty policy',()=>{
  const h=host();h.caster.faction='hive';const spec={type:'birth',monsterId:'rat',count:[2,2],duration:3,orphan:'wither',tag:'kin'};
  const children=h.runtime.birth(h.caster,h.skill,spec,{x:50,y:40},{host:true});assert.equal(children.length,2);assert.equal(h.draws,5);
  for(const c of children){assert.equal(c.bornOf,h.caster.id);assert.equal(c.faction,'hive');assert.equal(c.tag,'kin');assert.equal(c.orphanFate,'wither');assert.equal(c.noBounty,true);assert.equal(c.lifespan,0);assert.equal(c.owner,undefined);assert.deepEqual(c.pos,{x:50,y:40});}
  assert.equal(h.caster.clutchLive,2);assert.equal(h.events.filter(e=>e[0]==='flash').length,1);assert.equal(spec.incubate,undefined);
});
test('cap refusal consumes the original scatter draws and never evicts existing brood',()=>{
  const h=host(),spec={type:'birth',monsterId:'rat',count:[3,3],cap:1};const first=h.runtime.birth(h.caster,null,spec,h.caster.pos);assert.equal(first.length,1);assert.equal(h.draws,5);assert.equal(first[0].dead,false);
  assert.equal(h.runtime.birth(h.caster,null,spec,h.caster.pos).length,0);assert.equal(h.draws,8);
});
test('invalid definitions consume count and pool selection, but do not consume scatter or publish',()=>{
  const h=host();assert.deepEqual(h.runtime.birth(h.caster,null,{type:'birth',monsterId:'unknown',count:[2,2]},h.caster.pos),[]);assert.equal(h.draws,1);
  h.runtime.birth(h.caster,null,{type:'birth',pool:[{id:'unknown',weight:1}]},h.caster.pos);assert.equal(h.draws,3);assert.equal(h.actors.length,1);
});
test('instance-less player births resolve keeper, share synthetic cap and inherit duration before publication',()=>{
  const h=host(),owner=h.make('rat',8,'player');owner.sheet.get=()=>3;h.caster.team='player';h.caster.owner=owner;
  const spec={type:'birth',monsterId:'rat',count:[2,2],cap:1,duration:2};const children=h.runtime.birth(h.caster,null,spec,h.caster.pos,{capKey:'proc'});
  assert.equal(children.length,1);assert.equal(children[0].owner,owner);assert.equal(children[0].level,8);assert.equal(children[0].sourceSkillId,'proc');assert.equal(children[0].lifespan,6);assert.equal(children[0].lifelineId,owner.id);assert.equal(children[0].bornOf,undefined);assert.equal(h.draws,5);
});
test('player skills delegate to the shared summon service with exact actor and skill identities',()=>{
  const h=host();h.caster.team='player';const spec={type:'birth',monsterId:'rat',cap:4,duration:0};assert.deepEqual(h.runtime.birth(h.caster,h.skill,spec,{x:5,y:6}),[]);
  const call=h.events[0];assert.equal(call[1],h.caster);assert.equal(call[2],h.skill);assert.deepEqual(call[3],{monsterId:'rat',pos:{x:5,y:6},delivery:{type:'summon',monsterId:'rat',count:1,maxActive:4,duration:0}});assert.equal(h.events.length,1);
});
test('eggs clear their payload before hatching, snapshot the roster, and leave persistent children of the egg',()=>{
  const h=host(),spec={type:'birth',monsterId:'rat',incubate:{sec:1},count:[2,2]};const eggs=h.runtime.birth(h.caster,null,spec,h.caster.pos);assert.equal(eggs.length,2);assert.equal(eggs[0].eggHatch.fx.incubate,undefined);assert(spec.incubate);
  h.time=.9;h.runtime.advance(.1);assert.equal(h.actors.length,3);h.time=1;h.runtime.advance(.1);assert.equal(h.actors.length,3);h.runtime.advance(.15);
  assert.equal(h.actors.length,7);assert(eggs.every(e=>e.dead&&!e.eggHatch));assert.equal(h.caster.clutchLive,0);assert.equal(h.actors.filter(a=>a.bornOf===eggs[0].id&&!a.dead).length,2);
});
test('orphan cleanup snapshots dependants and applies every authored fate without affecting persistent children',()=>{
  const h=host();for(const fate of ['die','wither','frenzy','rout',undefined]){const a=h.make();a.bornOf=h.caster.id;a.orphanFate=fate;h.actors.push(a);}h.ports.kill(h.caster,true);
  assert.equal(h.actors[1].dead,true);assert.equal(h.actors[2].lifespan,6);assert.equal(h.actors[5].dead,false);assert(h.events.some(e=>e[0]==='buff'&&e[1]===h.rules.frenzy));assert(h.events.some(e=>e[0]==='status'&&e[1]==='bolted'));
});
test('corpse births cap per exact caster/skill and pod hatch is consumed before payload execution',()=>{
  const h=host();h.ports.corpseSpawn=()=>({perCorpse:true,max:2,monsterId:'rat',duration:4});h.runtime.corpse(h.caster,h.skill,h.caster.pos,3);assert.equal(h.actors.length,3);assert.equal(h.draws,4);
  const pod=h.actors[1];pod.construct={hatch:{skillId:'payload'}};pod.summonInst={level:7};let payload;h.ports.execute=(a,i,at,opts)=>{assert.equal(pod.construct.hatch,undefined);assert.equal(a,h.caster);assert.notEqual(at,pod.pos);payload=i;return true;};h.runtime.hatch(pod);h.runtime.hatch(pod);assert.equal(payload.level,7);assert.equal(payload.hostSkillId,'__hive:birth');assert.equal(h.events.filter(e=>e[0]==='hatched').length,1);
});
test('birth pool preserves ungated fast path, zero-weight fallback, source fold and injected draw order',()=>{
  let draws=0;const pool=new BirthPool({mid:{from:8,fadeIn:4}},id=>id==='late'?{from:20}:undefined,()=>{draws++;return .5;});const plain=[{id:'rat',weight:2}];assert.equal(pool.shaped(plain,1),plain);
  const gated=[{id:'late',weight:5},{id:'rat',weight:2,presence:'mid'}];assert.equal(pool.shaped(gated,1),gated);assert.deepEqual(pool.shaped(gated,6),[{id:'rat',weight:1,presence:'mid'}]);assert.equal(pool.pick(gated,6),'rat');assert.equal(draws,1);
  assert.equal(pool.multiplier({stops:[[1,2],[5,4]],mul:2},3),6);assert.equal(pool.multiplier({from:10,to:20,fadeIn:2,fadeOut:4},22),.5);
});
