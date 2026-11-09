// Original-only bar ownership, rebuild handoff and account preference course.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {CLASSES} from '../src/data/classes';
import {NullInput} from '../src/net/intent';
import {BAR_SLOTS,makeSkillInstance,type SkillInstance} from '../src/engine/skills';
import {rollItem} from '../src/engine/itemgen';
import {serializeCharacter,applySavedCharacter} from '../src/meta/character';
import {restoreSkillSlotMemory,planSkillSlots,rememberSkillSlot,SKILL_SLOT_MEMORY_CFG} from '../src/meta/skillSlotMemory';
import type {Seat} from '../src/engine/world';

bootSimEngine();seedGlobalRandom(0x7ba4);
const w=makeSimWorld('warrior',0x7ba4),local=w.localSeat;
const guest=w.addSeat('bar-guest',CLASSES[0],new NullInput(),{startingCompanions:false,startingFlasks:false});
const world=w as any,rows:unknown[]=[],ids=new WeakMap<object,number>();let nextId=0;
const id=(object:object|null|undefined)=>{if(!object)return null;if(!ids.has(object))ids.set(object,++nextId);return ids.get(object);};
const json=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const packed=(s:SkillInstance|null|undefined)=>s?{identity:id(s),id:s.def.id,level:s.level,bonus:s.bonusLevels,
 sockets:s.sockets.map(g=>g?{id:g.def.id,level:g.level,locked:g.locked,rolled:g.rolled}:null),
 grafts:s.grafts?.map(g=>({id:g.def.id,level:g.level})),host:s.grantedHostUid,treeNodes:s.treeNodes}:null;
const seatView=(s:Seat)=>({id:s.id,hero:w.seatHero(s).skills.map(packed),actor:s.actor.skills.map(packed),
 known:[...s.meta.knownSkills].map(([key,v])=>[key,packed(v)]),granted:[...(s.grantedInsts??[])].map(([key,v])=>[key,packed(v)]),
 equipment:s.meta.equipped,items:s.meta.items,life:s.actor.life,mana:s.actor.mana,casting:id(s.actor.casting)});
for(const s of [local,guest]){s.actor.skills=Array(BAR_SLOTS).fill(null);s.meta.knownSkills.clear();s.meta.equipped={};s.meta.items=[];w.recalcSeat(s);}
w.account.skillSlotMemory={};world.accountDirty=false;w.time=100;
const make=(skillId:string,seat=local)=>{const inst=makeSkillInstance(SKILLS[skillId],3,2);seat.meta.knownSkills.set(skillId,inst);return inst;};
const bolt=make('firebolt'),ball=make('fireball'),flask=make('life_flask'),guestFlask=make('life_flask',guest);
bolt.sockets[0]={def:SUPPORTS.splitting,level:2,locked:true};
let observing=false,throwAt='',events:unknown[]=[];
const methods=['rememberSkillSlots','rebindWornGrafts','recalcSeat','clearTreeFields','resyncMinionSupports'] as const;
for(const name of methods){
 const original=world[name];assert.equal(typeof original,'function');
 world[name]=function(...args:any[]){
  if(observing){
   const seat=args[0]===local?local:args[0]===guest?guest:undefined;
   events.push({name,seat:seat?.id,touched:(name==='rememberSkillSlots'||name==='rebindWornGrafts')?args[1]?.map(packed):undefined,
    overwrite:name==='rememberSkillSlots'?args[2]:undefined,
    skill:name==='resyncMinionSupports'?packed(args[0]):name==='clearTreeFields'?packed(args[1]):undefined,
    controlled:name==='clearTreeFields'?(args[0]===local.actor?'local':args[0]===guest.actor?'guest':'other'):undefined,
    localBar:w.seatHero(local).skills.map(id),guestBar:w.seatHero(guest).skills.map(id),memory:{...w.account.skillSlotMemory}});
   if(name===throwAt)throw Error('bar-probe:'+name);
  }
  return original.apply(this,args);
 };
}
function step(name:string,run:()=>unknown,expected:unknown,check:()=>void=()=>{}){
 const before=json({local:seatView(local),guest:seatView(guest),memory:w.account.skillSlotMemory,dirty:world.accountDirty});
 events=[];observing=true;let result:unknown;
 try{result=run();}catch(error){result=String(error);}finally{observing=false;}
 assert.deepEqual(result,expected,name);check();
 rows.push(json({name,before,result,events,after:{local:seatView(local),guest:seatView(guest),memory:w.account.skillSlotMemory,dirty:world.accountDirty}}));
}
step('binding rejects a negative slot',()=>w.bindSkill(-1,'firebolt'),false,()=>assert.equal(events.length,0));
step('binding rejects a slot beyond the hero bar',()=>w.bindSkill(BAR_SLOTS,'firebolt'),false);
step('unowned definitions cannot bind',()=>w.bindSkill(0,'frost_nova'),false);
step('off-bar learned ownership binds without consuming investment',()=>w.bindSkill(0,'firebolt'),true,()=>assert.equal(local.actor.skills[0],bolt));
step('another learned skill keeps an independent seat',()=>w.bindSkill(1,'fireball'),true);
step('rebinding moves the same instance',()=>w.bindSkill(2,'firebolt'),true,()=>{assert.equal(local.actor.skills[0],null);assert.equal(local.actor.skills[2],bolt);});
step('binding the same id toggles off without forgetting it',()=>w.bindSkill(2,'firebolt'),true,()=>{assert.equal(local.actor.skills[2],null);assert.equal(local.meta.knownSkills.get('firebolt'),bolt);});
step('clearing an empty slot still completes the rebuild handoff',()=>w.bindSkill(2,null),true,()=>assert(events.length>0));
local.actor.skills[0]=bolt;local.actor.skills[2]=makeSkillInstance(SKILLS.firebolt,1,1);
step('binding repairs duplicate ids using the learned instance',()=>w.bindSkill(3,'firebolt'),true,()=>{assert.equal(local.actor.skills.filter(i=>i?.def.id==='firebolt').length,1);assert.equal(local.actor.skills[3],bolt);});
step('swapping two occupants preserves exact instances',()=>w.swapSkillSlots(1,3),true,()=>{assert.equal(local.actor.skills[1],bolt);assert.equal(local.actor.skills[3],ball);});
step('swapping into an empty slot moves the instance',()=>w.swapSkillSlots(3,4),true,()=>{assert.equal(local.actor.skills[3],null);assert.equal(local.actor.skills[4],ball);});
step('swapping two empty slots skips all callbacks',()=>w.swapSkillSlots(6,7),true,()=>assert.equal(events.length,0));
step('swapping a slot with itself refuses',()=>w.swapSkillSlots(1,1),false);
step('swapping outside the hero bar refuses',()=>w.swapSkillSlots(-1,1),false);
step('binding a flask records the new account preference',()=>w.bindSkill(5,'life_flask'),true,()=>assert.equal(w.account.skillSlotMemory.life_flask,5));
step('clearing a flask keeps its preference and clears departed fields',()=>w.bindSkill(5,null),true,()=>{assert.equal(w.account.skillSlotMemory.life_flask,5);assert.equal(events.filter((e:any)=>e.name==='clearTreeFields').length,1);});
world.accountDirty=false;
step('guest flask edits cannot change owner preferences',()=>w.bindSkill(6,'life_flask',guest),true,()=>{assert.equal(guest.actor.skills[6],guestFlask);assert.equal(w.account.skillSlotMemory.life_flask,5);assert.equal(world.accountDirty,false);});
world.provisioningFlaskSlots.add(local);
try{step('automatic provisioning cannot overwrite preferences',()=>w.bindSkill(6,'life_flask'),true,()=>{assert.equal(w.account.skillSlotMemory.life_flask,5);assert.equal(world.accountDirty,false);});}
finally{world.provisioningFlaskSlots.delete(local);}
step('missing-only capture leaves an existing preference',()=>w.rememberSkillSlots(local,[flask],false),undefined,()=>assert.equal(w.account.skillSlotMemory.life_flask,5));
step('default touched selection captures the current hero bar',()=>w.rememberSkillSlots(),undefined,()=>assert.equal(w.account.skillSlotMemory.life_flask,6));
step('rebuild handoff deduplicates exact touched identities',()=>world.rebindWornGrafts(local,[bolt,bolt,null,undefined,flask]),undefined,
 ()=>assert.equal(events.filter((e:any)=>e.name==='resyncMinionSupports').length,2));
const hero=local.actor,body=w.createMonster('gnoll_impaler',1,hero.team,hero);local.home=hero;local.actor=body;body.skills=[ball];w.actors.push(body);
step('possession binding changes the hero and leaves the borrowed bar intact',()=>w.bindSkill(0,'firebolt'),true,()=>{assert.equal(hero.skills[0],bolt);assert.deepEqual(body.skills,[ball]);});
step('possession swapping also targets the hero bar',()=>w.swapSkillSlots(0,2),true,()=>{assert.equal(hero.skills[2],bolt);assert.deepEqual(body.skills,[ball]);});
step('flask field retirement observes the controlled body',()=>w.bindSkill(5,'life_flask'),true,
 ()=>assert(events.some((e:any)=>e.name==='clearTreeFields'&&e.controlled==='local')));
local.actor=hero;local.home=undefined;
const helm=rollItem({ilvl:20,uniqueId:'cindervigil'})!;assert(helm);helm.grantState={firebolt:{sockets:[{supportId:'splitting',level:2,locked:true}]}};
local.meta.knownSkills.delete('firebolt');hero.skills=hero.skills.map(s=>s?.def.id==='firebolt'?null:s);local.meta.equipped={helmet:helm};
step('binding lazily restores the worn grant before the rebuild',()=>w.bindSkill(3,'firebolt'),true,()=>{assert.equal(hero.skills[3],local.grantedInsts?.get('firebolt'));assert.equal(hero.skills[3]?.sockets[0]?.level,2);});
const save=serializeCharacter(w),resumed=makeSimWorld('warrior',0x7ba5);assert(applySavedCharacter(resumed,json(save)));
step('real save and resume retain grant residence and bar ownership',()=>({bar:resumed.player.skills.map(s=>s?.def.id??null),grant:resumed.localSeat.grantedInsts?.get('firebolt')?.sockets[0]?.level}),
 {bar:hero.skills.map(s=>s?.def.id??null),grant:2});
throwAt='rememberSkillSlots';const held=hero.skills[4];
step('remember failure precedes a known-skill bar mutation',()=>w.bindSkill(4,null),'Error: bar-probe:rememberSkillSlots',()=>assert.equal(hero.skills[4],held));
throwAt='recalcSeat';
step('rebuild failure preserves the completed swap',()=>w.swapSkillSlots(3,4),'Error: bar-probe:recalcSeat',()=>assert.equal(hero.skills[3],held));
throwAt='resyncMinionSupports';
step('resync failure follows the completed rebuild',()=>w.bindSkill(0,'fireball'),'Error: bar-probe:resyncMinionSupports',()=>assert.equal(hero.skills[0],ball));
throwAt='clearTreeFields';const flaskSlot=hero.skills.indexOf(flask);assert(flaskSlot>=0);
step('field retirement failure leaves the flask unbound',()=>w.bindSkill(flaskSlot,null),'Error: bar-probe:clearTreeFields',()=>assert.equal(hero.skills[flaskSlot],null));
throwAt='';
step('restored callbacks retain learned and granted ownership',()=>w.bindSkill(2,'firebolt'),true,()=>{assert.equal(hero.skills[2],local.grantedInsts?.get('firebolt'));assert.equal(local.meta.knownSkills.get('fireball'),ball);assert.equal(guest.actor.skills[6],guestFlask);});
const memory:any[]=[];
for(const raw of [null,[],{life_flask:2,mana_flask:0,retired:9,negative:-1,fractional:1.5,bad:'2','':2}])memory.push({kind:'restore',raw,result:restoreSkillSlotMemory(raw)});
for(const [ids,bar,prefs] of [
 [['a','b','a','c'],[null,'b',null],{a:2,c:2}],
 [['a','b','c'],['occupied',null,null],{a:0,b:2,c:1}],
 [['a','b'],['occupied'],{a:0,b:9}],
] as [string[],(string|null)[],Record<string,number>][])memory.push({kind:'plan',ids,bar,prefs,result:[...planSkillSlots(ids,bar,prefs)]});
const remembered:Record<string,number>={},oldTags=SKILL_SLOT_MEMORY_CFG.tags;
try{
 memory.push({kind:'remember',invalid:rememberSkillSlot(remembered,flask,-1),first:rememberSkillSlot(remembered,flask,2),same:rememberSkillSlot(remembered,flask,2),missingOnly:rememberSkillSlot(remembered,flask,3,false),ordinary:rememberSkillSlot(remembered,ball,4),result:{...remembered}});
 SKILL_SLOT_MEMORY_CFG.tags=['spell'];memory.push({kind:'live-tags',changed:rememberSkillSlot(remembered,ball,4),result:{...remembered}});
}finally{SKILL_SLOT_MEMORY_CFG.tags=oldTags;}
assert.equal(new Set(rows.map((r:any)=>r.name)).size,rows.length);
writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,scope:'Original bar ownership, rebuild callbacks, preferences and real character resume',rows,memory})+'\n',{flag:'wx'});
