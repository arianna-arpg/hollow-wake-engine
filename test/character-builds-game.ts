// Paired full-build course: original World observations against the packaged factory.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createCharacterBuilds} from 'authored/factory';
import pack from 'authored/pack';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom,mulberry32} from '../src/sim/rng';
import {forgeItem} from '../src/engine/itemgen';
import {slotsForCategory} from '../src/engine/items';
import {ITEM_BASES} from '../src/data/itembases';
import {RELIQUARY} from '../src/data/containers';
import {bankRelic} from '../src/engine/accountReliquary';
import {reliquaryPower} from '../src/meta/reliquary';
import {BAR_SLOTS,treeNodeRefusal} from '../src/engine/skills';
import {packSkillGemPayload} from '../src/engine/gemitems';
import {CLASSES} from '../src/data/classes';
bootSimEngine();
const builds=createCharacterBuilds(pack);
const json=(x:any)=>JSON.stringify(x),snapshot=(x:any)=>JSON.parse(json(x));
function derive(input:any,previous?:any){
 const raw={...input,classId:input.classDef.id,learned:input.known.map((inst:any)=>({gem:packSkillGemPayload(inst),...(inst.locked?{locked:true}:{})}))};
 delete raw.classDef;delete raw.known;delete raw.bar;
 const before=previous&&json(builds.read(previous.token));
 const token=previous?builds.rebuild(previous.token,raw):builds.open(raw,input.bar);
 if(previous)assert.equal(json(builds.read(previous.token)),before,'Previous private candidate changed');
 return {token,view:builds.read(token)};
}
function observe(build:any){if(build.token)return json(builds.read(build.token));const f=build.frame,s=(x:any)=>x?{id:x.def.id,level:x.level,bonus:x.bonusLevels,sockets:x.sockets.map((r:any)=>r?{id:r.def.id,level:r.level}:null),tree:x.treeNodes,grafts:x.grafts?.map((r:any)=>({id:r.def.id,level:r.level})),host:x.grantedHostUid,source:x.grantedBy}:null;
 return json({bar:f.actor.skills.map(s),known:[...f.meta.knownSkills].map(([id,i]:any)=>[id,s(i)]),grants:[...(f.seat.grantedInsts??[])].map(([id,i]:any)=>[id,s(i)]),
 companions:[...(build.companionState.grants??[])].map(([id,r]:any)=>[id,s(r.inst)]),equipped:f.meta.equipped,attrs:build.attrs,
 sources:build.sheet.sourceNames().map((id:string)=>[id,build.sheet.getSourceMods(id)])});}
const restore=seedGlobalRandom(0x4113),rng=mulberry32(0x4113),rows:any[]=[];
try{
 const w=makeSimWorld('magician',0x4113),p=w.player,m=w.meta,seat=w.localSeat;
 m.modeId='immortal';m.charId='durable-prototype';m.relicScope='durable-prototype';
 w.walk=null;w.actors=[p];m.knownSkills.clear();m.equipped={};m.items=[];m.containers={};p.skills=Array(BAR_SLOTS).fill(null);w.recalcSeat(seat);
 const input=()=>({level:p.level,classDef:m.classDef,baseAttrs:m.baseAttrs,allocated:[...m.allocated],choices:m.choices,grafts:m.grafts,
  equipped:m.equipped,containers:m.containers,relicEnabled:w.account.reliquary.enabled,relicEmpowerment:reliquaryPower(w.account.reliquary),features:[...w.account.features],known:[...m.knownSkills.values()],bar:p.skills.map(s=>s?.def.id??null)});
 const live=()=>({frame:{actor:p,seat,meta:m},sheet:p.sheet,attrs:m.attrs,companionState:{grants:(w as any).companionGrants.owners.get(p)}});
 function check(label:string,previous?:any){const before=observe(live()),time=w.time,cast=p.casting;const candidate=derive(input(),previous);
  assert.equal(observe(live()),before,'Preparation changed original state');assert.equal(w.time,time);assert.equal(p.casting,cast);
  w.recalcSeat(seat);assert.equal(observe(candidate),observe(live()),label);
  rows.push({label,observation:JSON.parse(observe(live())),grants:candidate.view.grants.map((r:any)=>r[0]),companions:candidate.view.companions.map((r:any)=>r[0]),sources:candidate.view.sources.length});return candidate;}
 for(const id of ['cindervigil','emberbrand','rimewake','mourning_bell','bell_of_the_breach','cinder_conductor','unquarried_idol']){
  m.equipped={};p.skills=Array(BAR_SLOTS).fill(null);w.recalcSeat(seat);
  const item=forgeItem({uniqueId:id,ilvl:40,quality:1,rng});assert(item);const slot=slotsForCategory(ITEM_BASES[item.baseId].category)[0];
  if(slot)m.equipped[slot.id]=item;
  else{assert.equal(id,'unquarried_idol');for(const rung of RELIQUARY.ladder)w.account.features.add(rung.feature);
   assert.equal(bankRelic(w.account,item,'durable-prototype'),item);item.x=0;item.y=0;w.account.reliquary.seated=[item.relicKey!];w.restoreAccountRelics(seat);}
  const cold=check('cold-'+id);
  if(id==='unquarried_idol'){
   w.account.reliquary.rank=7;const empowered=check('private-canonical-companion-empowerment',cold);
   const prior=observe(cold),owned=empowered.view.companions.find((r:any)=>r[0]==='summon_stone_golem')[1],level=owned.level;
   owned.level++;assert.equal(observe(cold),prior,'Candidate companion aliases the preceding investment graph');owned.level=level;
   w.account.reliquary.enabled=false;const disabled=check('private-disabled-companion-declaration',empowered);assert.equal(disabled.view.companions.length,0);
   w.account.reliquary.enabled=true;check('private-reenabled-companion-declaration',disabled);
  }
 }
 // Concrete same-host investment retention, followed by a cold replacement.
 w.account.reliquary.seated=[];w.restoreAccountRelics(seat);m.equipped={};p.skills=Array(BAR_SLOTS).fill(null);w.recalcSeat(seat);
 const helmet=forgeItem({uniqueId:'cindervigil',ilvl:40,quality:1,rng})!,ring=forgeItem({uniqueId:'emberbrand',ilvl:40,quality:1,rng})!;
 m.equipped={helmet,ring1:ring};w.recalcSeat(seat);const inst=seat.grantedInsts!.get('firebolt')!;
 inst.treeNodes=[];for(let n=0;n<2;n++){assert.equal(treeNodeRefusal(inst,'flame_studies'),null);inst.treeNodes.push('flame_studies');}assert(w.bindSkill(2,'firebolt'));w.recalcSeat(seat);
 const high=check('cold-actual-invested-pair');delete m.equipped.ring1;const low=check('private-same-host-lower-level',high);
 assert.equal(low.view.grants.find((r:any)=>r[0]==='firebolt')[1].tree.length,2);assert.equal(high.view.grants.find((r:any)=>r[0]==='firebolt')[1].level,10);
 const replacement=forgeItem({uniqueId:'cindervigil',ilvl:40,quality:1,rng})!;replacement.grantState=snapshot(helmet.grantState);m.equipped.helmet=replacement;
 const replaced=check('private-new-host-cold-restore',low);assert.equal(replaced.view.grants.find((r:any)=>r[0]==='firebolt')[1].tree.length,1);
 const oldLive=seat.grantedInsts!.get('firebolt'),oldPrivate=builds.lineages(replaced.token).get('grant/firebolt');
 delete m.equipped.helmet;const removed=check('private-remove-grant-host',replaced);assert.equal(removed.view.grants.length,0);
 m.equipped.helmet=replacement;const renewed=check('private-reequip-same-item-creates-new-grant',removed);
 assert.notEqual(seat.grantedInsts!.get('firebolt'),oldLive);assert.notEqual(builds.lineages(renewed.token).get('grant/firebolt'),oldPrivate);
 const classes:any[]=[];
 for(const def of CLASSES){
  const world=makeSimWorld(def.id,0x5113),actor=world.player,meta=world.meta;
  meta.equipped={};meta.items=[];meta.containers={};world.walk=null;world.actors=[actor];world.recalcSeat(world.localSeat);
  const source=()=>({level:actor.level,classDef:meta.classDef,baseAttrs:meta.baseAttrs,allocated:[...meta.allocated],choices:meta.choices,grafts:meta.grafts,
   equipped:meta.equipped,containers:meta.containers,relicEnabled:world.account.reliquary.enabled,relicEmpowerment:reliquaryPower(world.account.reliquary),
   features:[...world.account.features],known:[...meta.knownSkills.values()],bar:actor.skills.map(s=>s?.def.id??null)});
  const live=()=>({frame:{actor,seat:world.localSeat,meta},sheet:actor.sheet,attrs:meta.attrs,companionState:{grants:(world as any).companionGrants.owners.get(actor)}});
  let previous:any;
  for(const level of [1,18]){
   actor.level=level;const untouched=observe(live()),candidate=derive(source(),previous);assert.equal(observe(live()),untouched);
   world.recalcSeat(world.localSeat);assert.equal(observe(candidate),observe(live()),def.id+' level '+level);
   classes.push({label:def.id+'-'+level,observation:JSON.parse(observe(live()))});previous=candidate;
  }
 }
 writeFileSync(process.argv[2],json({rows,classes,scope:'Packaged durable build composition compared with the original World. No persistence, live acknowledgement or native adapter claim.'}),{flag:'wx'});
}finally{restore();}
