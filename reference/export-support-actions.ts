import fs from 'node:fs';import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS} from '../src/data/skills';import {SUPPORTS} from '../src/data/supports';
import {makeSkillGem,instanceMods,effectiveSkillLevel,hostSockets} from '../src/engine/skills';
import {packSkillGemPayload,freeCellCount} from '../src/engine/gemitems';
import {CLASSES} from '../src/data/classes';import {NullInput} from '../src/net/intent';
import {rollItem} from '../src/engine/itemgen';import {ITEM_BASES} from '../src/data/itembases';
import {serializeCharacter,rebuildSkill,applySavedCharacter} from '../src/meta/character';
import {serializeSeatMeta,applySeatMeta} from '../src/net/snapshot';import {canonicalVein} from '../src/engine/supportbase';

bootSimEngine();const wire=(v:any)=>JSON.parse(JSON.stringify(v)),courses:any[]=[];
type World=ReturnType<typeof makeSimWorld>;
function course(name:string,body:(w:World,step:(name:string,action:()=>unknown,expected?:boolean)=>void)=>void){
 const restore=seedGlobalRandom(210000+courses.length);
 try{
  const w=makeSimWorld('swashbuckler',210000+courses.length),aw:any=w,s=w.localSeat;
  w.time=100;aw.lastCombatAt=-100;s.meta.items=[];
  const inst=makeSkillGem(SKILLS.fireball,5,'rare');s.meta.knownSkills=new Map([[inst.def.id,inst]]);s.actor.skills=[inst];w.recalcSeat(s);
  const skill=(i:ReturnType<typeof makeSkillGem>)=>({payload:packSkillGemPayload(i),level:effectiveSkillLevel(i),host:hostSockets(i).map(s=>s.def.id),mods:instanceMods(i),forwarded:i.sockets.map(s=>!!s?.forwarded)});
  const snapshot=()=>wire({seats:w.seats.map(s=>({id:s.id,skills:[...s.meta.knownSkills].map(([id,i])=>({id,...skill(i)})),granted:[...(s.grantedInsts??[])].map(([id,i])=>({id,...skill(i)})),items:s.meta.items.map(i=>({gem:i.gem??null,locked:i.locked??false,x:i.x,y:i.y})),free:freeCellCount(s.meta.items),life:s.actor.life,mana:s.actor.mana,maxLife:s.actor.maxLife(),maxMana:s.actor.maxMana()})),crew:w.actors.filter(a=>a.summonInst).map(a=>({kind:a.defId,dead:a.dead,construct:!!a.construct,owner:w.seats.find(s=>s.actor===a.owner)?.id??null,sourceSeat:w.seats.find(s=>[...s.meta.knownSkills.values()].includes(a.summonInst!))?.id??null,source:a.summonInst!.def.id,skills:a.skills.map(i=>i?skill(i):null)})),dirty:[...w.metaDirty],charDirty:w.charDirty});
  let recording=false,events:any[]=[];const steps:any[]=[];
  for(const name of ['recalcSeat','resyncMinionSupports','markMetaDirty','grantSupportGemItem','failNote']){
   const original=aw[name];aw[name]=function(...args:any[]){
    const detail=name==='failNote'?{key:args[1],reason:args[2]}:name==='resyncMinionSupports'?{skill:args[0].def.id}:name==='grantSupportGemItem'?{support:args[1].def.id}:{};
    if(recording)events.push({name,phase:'before',...detail,state:snapshot()});const result=original.apply(this,args);if(recording)events.push({name,phase:'after',state:snapshot()});return result;
   };
  }
  body(w,(label,action,expected)=>{events=[];w.metaDirty.clear();w.charDirty=false;const before=snapshot();recording=true;let result;try{result=action();}finally{recording=false;}if(expected!==undefined)assert.equal(result,expected,label);steps.push(wire({label,result:result??null,before,after:snapshot(),events}));});
  courses.push({name,steps});
 }finally{restore();}
}
course('basic-transfer-and-refusals',(w,step)=>{
 const s=w.localSeat,inst=s.meta.knownSkills.get('fireball')!;
 const item=w.grantSupportGemItem(s,{def:SUPPORTS.splitting,level:3,locked:true})!;
 step('unknown-wrapper',()=>w.socketSupport(-1,'fireball'),false);
 step('unknown-skill',()=>w.socketSupport(item.uid,'missing'),false);
 step('socket-locked-levelled-gem',()=>w.socketSupport(item.uid,'fireball'),true);
 step('used-wrapper-refuses',()=>w.socketSupport(item.uid,'fireball'),false);
 step('empty-socket-refuses',()=>w.unsocketSupport('fireball',3),false);
 step('unsocket-roundtrip',()=>w.unsocketSupport('fireball',0),true);
 const returned=s.meta.items.find(i=>i.gem?.kind==='support')!;
 inst.sockets.fill({def:SUPPORTS.alacrity,level:1});step('all-sockets-occupied',()=>w.socketSupport(returned.uid,'fireball'),false);
 inst.sockets.fill(null);const melee=w.grantSupportGemItem(s,{def:SUPPORTS.faultfinder,level:1})!;
 step('incompatible-gem',()=>w.socketSupport(melee.uid,'fireball'),false);
});
course('native-combat-gate',(w,step)=>{
 const s=w.localSeat,aw:any=w,item=w.grantSupportGemItem(s,{def:SUPPORTS.splitting,level:1})!;
 aw.lastCombatAt=w.time;step('sanctuary-waives-hot-blood',()=>w.socketSupport(item.uid,'fireball'),true);
 step('sanctuary-waives-unsocket',()=>w.unsocketSupport('fireball',0),true);
 const returned=s.meta.items.find(i=>i.gem?.kind==='support')!;
 // Own a zone observation instead of mutating the shared authored registry.
 w.zone={...w.zone,objective:{kind:'clear'}};
 step('hot-blood-socket',()=>w.socketSupport(returned.uid,'fireball'),false);
 aw.lastCombatAt=-100;step('cooled-socket',()=>w.socketSupport(returned.uid,'fireball'),true);
 aw.lastCombatAt=w.time;step('hot-blood-unsocket',()=>w.unsocketSupport('fireball',0),false);
 aw.lastCombatAt=-100;step('cooled-unsocket',()=>w.unsocketSupport('fireball',0),true);
});
course('bag-capacity-before-clearing',(w,step)=>{
 const s=w.localSeat,inst=s.meta.knownSkills.get('fireball')!;inst.sockets[0]={def:SUPPORTS.splitting,level:2};w.recalcSeat(s);
 for(let n=0;freeCellCount(s.meta.items)>0;n++){assert(n<1000);assert(w.grantSupportGemItem(s,{def:SUPPORTS.splitting,level:1}));}
 step('full-bag-unsocket',()=>w.unsocketSupport('fireball',0),false);
 s.meta.items.pop();step('one-space-unsocket',()=>w.unsocketSupport('fireball',0),true);
});
course('stored-skill-cargo',(w,step)=>{
 const s=w.localSeat,stored=makeSkillGem(SKILLS.fireball,5,'rare');stored.sockets[1]={def:SUPPORTS.splitting,level:4,locked:true};
 const item=w.grantSkillGemItem(s,stored)!;
 step('stored-missing-slot',()=>w.unsocketBagSkill(item.uid,0),false);
 step('stored-cargo-return',()=>w.unsocketBagSkill(item.uid,1),true);
 step('stored-cargo-return-once',()=>w.unsocketBagSkill(item.uid,1),false);
 step('stored-missing-wrapper',()=>w.unsocketBagSkill(-1,1),false);
});
course('remote-custody-and-wire',(w,step)=>{
 const local=w.localSeat,remote=w.addSeat('remote',CLASSES[0],new NullInput(),{startingCompanions:false,startingFlasks:false});remote.meta.items=[];
 const inst=makeSkillGem(SKILLS.fireball,5,'rare');remote.meta.knownSkills=new Map([[inst.def.id,inst]]);remote.actor.skills=[inst];w.recalcSeat(remote);
 const gem=w.grantSupportGemItem(remote,{def:SUPPORTS.splitting,level:4,locked:true})!;
 step('local-cannot-take-remote-wrapper',()=>w.socketSupport(gem.uid,'fireball',local),false);
 step('remote-socket',()=>w.socketSupport(gem.uid,'fireball',remote),true);
 assert.equal(local.meta.knownSkills.get('fireball')!.sockets[0],null);
 const snap=serializeSeatMeta(remote);step('wire-roundtrip',()=>applySeatMeta(w,remote,snap));
 step('remote-unsocket',()=>w.unsocketSupport('fireball',0,remote),true);
 assert.equal(remote.meta.items.filter(i=>i.gem?.kind==='support').length,1);
});
course('granted-item-residence-and-save',(w,step)=>{
 const seat=w.localSeat,item=rollItem({ilvl:20,uniqueId:'rimewake'})!;
 Object.assign(seat.meta.equipped,{[ITEM_BASES[item.baseId].category]:item});w.recalcSeat(seat);
 assert(seat.grantedInsts?.has('frost_nova'));assert(!seat.meta.knownSkills.has('frost_nova'));
 const gem=w.grantSupportGemItem(seat,{def:SUPPORTS.widening,level:3,locked:true})!;
 step('socket-item-granted-nova',()=>w.socketSupport(gem.uid,'frost_nova'),true);
 step('repeated-rebuild-retains-residence',()=>w.recalcSeat(seat));
 const saved=wire(serializeCharacter(w)),restored=makeSimWorld('swashbuckler',218888);assert(applySavedCharacter(restored,saved));
 assert.deepEqual(packSkillGemPayload(restored.localSeat.grantedInsts!.get('frost_nova')!),packSkillGemPayload(seat.grantedInsts!.get('frost_nova')!));
 step('save-restores-granted-support',()=>packSkillGemPayload(restored.localSeat.grantedInsts!.get('frost_nova')!));
 step('unsocket-item-granted-nova',()=>w.unsocketSupport('frost_nova',0),true);
});
course('saved-cut-and-full-stored-cargo',(w,step)=>{
 const s=w.localSeat,inst=s.meta.knownSkills.get('fireball')!,def=Object.values(SUPPORTS).find(s=>s.rollBase)!;
 inst.sockets[0]={def,level:4,locked:true,rolled:canonicalVein(def.rollBase!)};
 const row=serializeCharacter(w).knownSkills.find(s=>s.skillId==='fireball')!,restored=rebuildSkill(wire(row))!;
 assert.deepEqual(packSkillGemPayload(restored),packSkillGemPayload(inst));
 step('save-cut-roundtrip',()=>({saved:row,restored:packSkillGemPayload(restored)}));
 const stored=w.grantSkillGemItem(s,restored)!;for(let n=0;freeCellCount(s.meta.items)>0;n++){assert(n<1000);assert(w.grantSupportGemItem(s,{def:SUPPORTS.splitting,level:1}));}
 step('full-bag-keeps-stored-cut',()=>w.unsocketBagSkill(stored.uid,0),false);
 s.meta.items.pop();step('one-cell-returns-stored-cut',()=>w.unsocketBagSkill(stored.uid,0),true);
});
course('live-crew-instance-isolation',(w,step)=>{
 const seat=w.localSeat,inst=makeSkillGem(SKILLS.summon_skeleton_archer,5,'rare');inst.sockets[0]={def:SUPPORTS.resonance,level:1};
 seat.meta.knownSkills=new Map([[inst.def.id,inst]]);seat.actor.skills=[inst];w.recalcSeat(seat);
 w.executeSkill(seat.actor,inst,{...seat.actor.pos});
 const body=w.actors.find(a=>a.summonInst===inst&&!a.dead&&!a.construct)!;assert(body,'real summon must create a crew');
 // Real actors with controlled exclusion state exercise the resync boundary;
 // their combat execution is outside this socket course.
 const dead=w.createMonster('skeleton_archer',5,'player');dead.owner=seat.actor;dead.summonInst=inst;dead.dead=true;w.actors.push(dead);
 const constructInst=makeSkillGem(SKILLS.ballista_sentry,5,'rare');w.executeSkill(seat.actor,constructInst,{x:seat.actor.pos.x+80,y:seat.actor.pos.y});
 const construct=w.actors.find(a=>a.construct&&a.summonInst===constructInst)!;assert(construct);construct.summonInst=inst;
 const remote=w.addSeat('remote',CLASSES[0],new NullInput(),{startingCompanions:false,startingFlasks:false}),other=makeSkillGem(inst.def,5,'rare');other.sockets[0]={def:SUPPORTS.resonance,level:1};remote.meta.knownSkills=new Map([[other.def.id,other]]);remote.actor.skills=[other];w.recalcSeat(remote);w.executeSkill(remote.actor,other,{...remote.actor.pos});
 const otherBody=w.actors.find(a=>a.summonInst===other)!;assert(otherBody);
 const untouched=[dead,construct,otherBody].map(a=>wire(a.skills.map(i=>i?packSkillGemPayload(i):null)));
 const gem=w.grantSupportGemItem(seat,{def:SUPPORTS.splitting,level:4,locked:true})!;
 step('crew-only-support-reaches-existing-minion',()=>w.socketSupport(gem.uid,inst.def.id),true);
 assert(body.skills.some(i=>i?.sockets.some(s=>s?.forwarded&&s.def.id==='splitting'&&s.level===4)));
 assert.deepEqual([dead,construct,otherBody].map(a=>wire(a.skills.map(i=>i?packSkillGemPayload(i):null))),untouched);
 step('remove-key-unboards-live-crew',()=>w.unsocketSupport(inst.def.id,0),true);
 assert(!body.skills.some(i=>i?.sockets.some(s=>s?.forwarded)));
 const key=seat.meta.items.find(i=>i.gem?.kind==='support'&&i.gem.supportId==='resonance')!;assert(key);
 step('restore-key-reboards-live-crew',()=>w.socketSupport(key.uid,inst.def.id),true);
 assert(body.skills.some(i=>i?.sockets.some(s=>s?.forwarded&&s.def.id==='splitting')));
 step('remove-rider-updates-live-crew',()=>w.unsocketSupport(inst.def.id,1),true);
 assert(!body.skills.some(i=>i?.sockets.some(s=>s?.def.id==='splitting')));
});
fs.writeFileSync(process.argv[2],JSON.stringify({scope:'real World socket custody, refusals, remote seats, item grants, save/wire, cut cargo and live crew resync',courses})+'\n',{flag:'wx'});
console.log(JSON.stringify({courses:courses.length,transitions:courses.reduce((n,c)=>n+c.steps.length,0)}));
