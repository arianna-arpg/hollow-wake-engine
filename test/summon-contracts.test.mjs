import {test} from 'node:test';import assert from 'node:assert/strict';
import {SummonContracts} from '../dist/summon-contracts.js';import {SummonDelivery} from '../dist/summon-delivery.js';
function setup(){
  const events=[],actors=[],bodies=[],corpses=[],queues={respawns:[],summons:[]},stats={manaCost:1,minionRespawnTime:1};let nextId=10;
  const make=(over={})=>({id:nextId++,dead:false,pos:{x:0,y:0},facing:0,reservedMana:0,manaReserved:0,mana:100,summonToggles:new Map(),
    maxMana:()=>100,availableMaxMana(){return 100-this.reservedMana;},canAfford:()=>true,skillCost:()=>({mana:10,life:2}),sheet:{get:(key,_tags,_extra,base)=>stats[key]??base??0},...over});
  const owner=make(),delivery={type:'summon',count:3,maxActive:3,persistent:{toggle:true,slots:3,reserve:10,respawnTime:5}},skill={def:{id:'wolves',delivery}};actors.push(owner);
  const ports={delivery:i=>i.resolved??i.def.delivery,native:i=>i.def.delivery,tags:()=>new Set(),modifiers:()=>[],actors:()=>actors,homes:()=>[],minions:a=>bodies.filter(b=>b.owner===a&&!b.dead),
    minionsOfSkill:(a,id)=>bodies.filter(b=>b.owner===a&&!b.dead&&b.sourceSkillId===id),clearReleaseFields:()=>events.push('clear'),kill:b=>{b.dead=true;events.push(['kill',b.id]);},
    spawn:(a,i,opts)=>{events.push(['spawn',opts]);const b=make({owner:a,summonInst:i,sourceSkillId:i.def.id});bodies.push(b);return b;},recovered:b=>events.push(['recovered',b.id]),
    pay:(a,_i,cost)=>{a.mana-=cost.mana;events.push('paid');},dry:()=>events.push('dry'),random:()=>{events.push('random');return .5;},clamp:p=>p};
  const runtime=new SummonContracts(queues,ports),releasePorts={form:()=>undefined,monster:()=>true,corpses:()=>corpses,minionsOfGroup:ports.minions,minionsOfSkill:ports.minionsOfSkill,
    removeCorpse:c=>{corpses.splice(corpses.indexOf(c),1);events.push('corpse');},corpseSpawn:(_a,_i,_p,n)=>events.push(['raised',n]),spawn:ports.spawn,contracts:runtime,
    delivery:ports.delivery,cannotSustain:()=>events.push('cannot'),clamp:p=>p,random:ports.random};
  const release=new SummonDelivery(queues,releasePorts),frame={caster:owner,skill,aim:{x:100,y:0},tags:new Set(),modifiers:[],multiplier:2,gaugePower:1};
  return{events,actors,bodies,corpses,queues,stats,make,owner,delivery,skill,ports,runtime,releasePorts,release,frame};
}
test('shared pool slots count existing claims while exclusive replacements may reuse their capacity',()=>{
  const h=setup();h.delivery.poolGroup='pets';const other={def:{id:'birds',delivery:{...h.delivery}}};h.owner.summonToggles.set('birds',{inst:other,reserved:20,slots:2});
  assert.equal(h.runtime.slots(h.owner,h.skill,h.delivery),1);h.delivery.exclusiveGroup='stance';other.def.delivery.exclusiveGroup='stance';assert.equal(h.runtime.slots(h.owner,h.skill,h.delivery),3);
});
test('toggle release prices and publishes its reservation before birth, refusing an unsustainable replacement without dismissal',()=>{
  const h=setup();const spawn=h.releasePorts.spawn;h.releasePorts.spawn=(a,i,opts)=>{assert.equal(a.reservedMana,30);assert.equal(a.summonToggles.get('wolves').inst,i);return spawn(a,i,opts);};
  h.release.execute(h.frame,h.delivery);assert.equal(h.owner.mana,70);assert.equal(h.bodies.length,3);
  const r=setup();r.delivery.persistent.reserve=40;r.release.execute(r.frame,r.delivery);assert.deepEqual(r.events,['cannot']);assert.equal(r.owner.reservedMana,0);assert.equal(r.owner.summonToggles.size,0);
});
test('sequential toggle birth keeps launch multiplier; ordinary sequential births retain the original omitted multiplier',()=>{
  const h=setup();h.stats.summonSequence=1;h.release.execute(h.frame,h.delivery);assert.equal(h.queues.summons[0].mult,2);assert.equal(h.bodies.length,1);
  const r=setup();delete r.delivery.persistent;r.stats.summonSequence=1;r.release.execute(r.frame,r.delivery);assert.equal(r.queues.summons[0].mult,undefined);
});
test('reconciliation reduces live reservation, trims newest bodies and counts an existing fill before scheduling respawns',()=>{
  const h=setup();h.stats.summonSequence=1;h.release.execute(h.frame,h.delivery);h.runtime.reconcile();assert.equal(h.queues.respawns.length,0);assert.equal(h.queues.summons[0].remaining,2);
  h.stats.minionMaxCount=2;h.runtime.reconcile();assert.equal(h.owner.reservedMana,20);assert.equal(h.queues.summons[0].remaining,1);assert.equal(h.queues.respawns.length,0);
  h.runtime.advanceSummons(.35);assert.equal(h.bodies.length,2);h.stats.minionMaxCount=1;h.runtime.reconcile();assert.equal(h.bodies[1].dead,true);assert.equal(h.owner.reservedMana,10);
});
test('dismissal removes toggle before callbacks and purges both birth queues before releasing its reservation',()=>{
  const h=setup();h.release.execute(h.frame,h.delivery);h.queues.respawns.push({caster:h.owner,inst:h.skill,timer:5});h.queues.summons.push({caster:h.owner,inst:h.skill,remaining:2});
  h.ports.clearReleaseFields=()=>assert.equal(h.owner.summonToggles.size,0);h.runtime.dismiss(h.owner,'wolves');assert.equal(h.queues.respawns.length,0);assert.equal(h.queues.summons.length,0);assert.equal(h.owner.reservedMana,0);assert(h.bodies.every(b=>b.dead));
});
test('death releases body reservation once, uses native respawn terms and excludes inherited/item followers',()=>{
  const h=setup();h.owner.reservedMana=30;const b=h.make({owner:h.owner,manaReserved:10,summonInst:h.skill});h.skill.resolved={...h.delivery,persistent:{respawnTime:99}};
  h.runtime.release(b,true);assert.equal(b.manaReserved,0);assert.equal(h.owner.reservedMana,20);assert.equal(h.queues.respawns[0].timer,5);
  b.summonOffspring=true;h.runtime.release(b,true);assert.equal(h.queues.respawns.length,1);
});
test('failed respawn retains debt for a two-second retry and successful birth consumes it before recovery',()=>{
  const h=setup();delete h.delivery.persistent.toggle;h.queues.respawns.push({caster:h.owner,inst:h.skill,timer:0});h.ports.spawn=()=>null;h.runtime.advanceRespawns(0);assert.equal(h.queues.respawns[0].timer,2);
  h.ports.spawn=()=>h.make();h.ports.recovered=()=>assert.equal(h.queues.respawns.length,0);h.runtime.advanceRespawns(2);assert.equal(h.queues.respawns.length,0);
});
test('waves rebill before sampling placement and fizzle without RNG when the owner cannot afford them',()=>{
  const h=setup();h.owner.canAfford=()=>false;h.queues.summons.push({caster:h.owner,inst:h.skill,remaining:2,timer:0,interval:1,at:{x:0,y:0},costPer:{mana:5,life:0}});
  h.runtime.advanceSummons(0);assert.deepEqual(h.events,['dry']);assert.equal(h.queues.summons.length,0);
});
test('a full toggle still spends placement draws before its body gate and consumes the scheduled batch count',()=>{
  const h=setup();h.release.execute(h.frame,h.delivery);h.events.length=0;h.queues.summons.push({caster:h.owner,inst:h.skill,remaining:2,batch:2,timer:0,interval:1,at:{x:0,y:0}});
  h.runtime.advanceSummons(0);assert.deepEqual(h.events,['random','random']);assert.equal(h.queues.summons.length,0);assert.equal(h.bodies.length,3);
});
test('corpse delivery only consumes still-present bodies and replaces one even when the roster is full',()=>{
  const h=setup();delete h.delivery.persistent;h.delivery.fromCorpse=true;const present={defId:'wolf',pos:{x:1,y:2}},gone={defId:'wolf',pos:{x:3,y:4}};h.corpses.push(present);
  h.releasePorts.minionsOfSkill=()=>[{}, {}, {}];h.release.execute({...h.frame,target:{corpse:gone,corpses:[gone,present]}},h.delivery);
  assert.equal(h.corpses.length,0);assert.deepEqual(h.events.slice(0,2),['corpse',['spawn',{monsterId:'wolf',pos:present.pos}]]);assert.deepEqual(h.events.at(-1),['raised',1]);
});
test('reservation reconciliation includes a temporarily vacated controller body without requiring an account',()=>{
  const h=setup();h.actors.length=0;h.ports.homes=()=>[h.owner];h.owner.summonToggles.set('wolves',{inst:h.skill,reserved:0,slots:3});h.runtime.reconcile();assert.equal(h.owner.reservedMana,30);assert.equal(h.queues.respawns.length,3);
});
