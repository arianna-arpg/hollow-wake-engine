// Installed-game qualification only. The frozen observer remains unchanged.
import assert from 'node:assert/strict';
import {EquipmentSkillDraft} from '@hollow-wake/engine/skills/equipment-draft';
import {STAT_DEFS} from '../src/engine/stats';
import type {SkillInstance} from '../src/engine/skills';
import type {World} from '../src/engine/world';

export const draftChecks={prepared:0,unchanged:0,matched:0};
function copySkill(inst:SkillInstance):SkillInstance {
 const {def,sockets,grafts,...rest}=inst;
 // These ordinary/held courses do not exercise transient payload graphs.
 for(const key of ['guardArtsHost','sequenceHost','challengeHost','followUpHost','invocationHost'])
  assert(!(rest as any)[key],'qualification requires a payload-aware copier');
 const socket=(row:any)=>{if(!row)return null;const {def,...fields}=row;return {def,...structuredClone(fields)};};
 return {def,...structuredClone(rest),sockets:sockets.map(socket),...(grafts?{grafts:grafts.map(socket)}:{})};
}
function projection(frame:any){
 const identities=new WeakMap<object,number>();let next=1;
 const skill=(inst:any):any=>{
  if(!inst)return null;if(!identities.has(inst))identities.set(inst,next++);
  const {def,sockets,grafts,...fields}=inst;
  const support=(row:any)=>row?{...row,def:row.def.id}:null;
  return {identity:identities.get(inst),def:def.id,...fields,sockets:sockets.map(support),grafts:grafts?.map(support)};
 };
 return JSON.stringify({bar:frame.actor.skills.map(skill),known:[...frame.meta.knownSkills].map(([id,inst])=>[id,skill(inst)]),
  grants:[...(frame.seat.grantedInsts??[])].map(([id,inst])=>[id,skill(inst)]),
  rows:frame.seat.grantedSkills?.map((row:any)=>({...row,def:row.def.id,inst:skill(row.inst)})),
  worn:frame.seat.wornGrafts?.map((row:any)=>({...row,def:row.def.id})),equipped:frame.meta.equipped,
  containers:[...frame.containerPieceMods].map(([item]:any)=>item),
  auras:[...frame.actor.activeAuras].map(([id,row]:any)=>[id,skill(row.inst)]),
  summons:[...frame.actor.summonToggles].map(([id,row]:any)=>[id,skill(row.inst)])});
}
export function observeDrafts(world:World){
 const runtime=(world as any).sdkEquipmentSkills;assert(runtime,'installed equipment runtime required');
 const derive=runtime.derive.bind(runtime);
 runtime.derive=(frame:any)=>{
  const before=projection(frame),cast=world.player.casting,clock=world.time;
  // Snapshot all registered scalar reads; the candidate never reads a live sheet.
  const values=new Map(Object.keys(STAT_DEFS).map(id=>[id,frame.actor.sheet.get(id)]));
  const draft=new EquipmentSkillDraft(frame,{copySkill,copyItem:structuredClone,
   copyToggle:()=>{throw Error('this original course has no active aura/summon toggles');},
   sheet:{get:id=>{assert(values.has(id),'unregistered candidate stat: '+id);return values.get(id)!;}},
   deriveCompanions:(_candidate,definitions)=>assert.equal(definitions.length,0,'this original course has no companion grants'),
   retire:()=>assert.fail('this original course has no aura/summon retirements'),
  });
  draftChecks.prepared++;derive(draft.frame);
  assert.equal(projection(frame),before,'private preparation changed live equipment or skill ownership');
  assert.equal(world.player.casting,cast);assert.equal(world.time,clock);draftChecks.unchanged++;
  derive(frame);
  assert.equal(projection(draft.frame),projection(frame),'private derivation differs from installed game derivation');draftChecks.matched++;
 };
}
