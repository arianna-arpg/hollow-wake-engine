// Original-game qualification helper, not a public host adapter. This course
// covers the complete ordinary contribution/equipment/level/resource path.
import assert from 'node:assert/strict';
import {StatSheet,StatRules} from '@hollow-wake/engine';
import {EquipmentSkillDraft} from '@hollow-wake/engine/skills/equipment-draft';
import {STAT_DEFS,STAT_TRADES,mod} from '../src/engine/stats';
import {PROGRESSION} from '../src/data/classes';
import {serializeCharacter} from '../src/meta/character';
import type {SkillInstance} from '../src/engine/skills';
import type {World} from '../src/engine/world';
export const privateBuildChecks={prepared:0,unchanged:0,equipmentMatched:0,completed:0};
const json=(x:any)=>JSON.stringify(x);
function copySkill(inst:SkillInstance):SkillInstance {
 const {def,sockets,grafts,...rest}=inst;
 for(const key of ['guardArtsHost','sequenceHost','challengeHost','followUpHost','invocationHost'])assert(!(rest as any)[key],'ordinary course encountered transient host payload');
 const socket=(row:any)=>{if(!row)return null;const{def,...fields}=row;return{def,...structuredClone(fields)};};
 return{def,...structuredClone(rest),sockets:sockets.map(socket),...(grafts?{grafts:grafts.map(socket)}:{})};
}
function equipment(frame:any){
 const ids=new WeakMap<object,number>();let serial=0;
 const skill=(s:any):any=>{if(!s)return null;if(!ids.has(s))ids.set(s,++serial);const{def,sockets,grafts,...rest}=s;
  const support=(r:any)=>r?{...r,def:r.def.id}:null;return{identity:ids.get(s),def:def.id,...rest,sockets:sockets.map(support),grafts:grafts?.map(support)};};
 return json({bar:frame.actor.skills.map(skill),known:[...frame.meta.knownSkills].map(([id,s]:any)=>[id,skill(s)]),
  grants:[...(frame.seat.grantedInsts??[])].map(([id,s]:any)=>[id,skill(s)]),
  rows:frame.seat.grantedSkills?.map((r:any)=>({...r,def:r.def.id,inst:skill(r.inst)})),
  worn:frame.seat.wornGrafts?.map((r:any)=>({...r,def:r.def.id})),equipped:frame.meta.equipped,
  pieces:[...frame.containerPieceMods].map(([item]:any)=>item),auras:[...frame.actor.activeAuras].map(([id,r]:any)=>[id,skill(r.inst)]),
  summons:[...frame.actor.summonToggles].map(([id,r]:any)=>[id,skill(r.inst)])});
}
export function observePrivateBuilds(world:World):void {
 const native=world as any,contributions=native.sdkBuildContributions,skills=native.sdkEquipmentSkills;
 assert(contributions&&skills,'composed installed adapter required');
 const rules=new StatRules(STAT_DEFS,STAT_TRADES),rebuild=contributions.rebuild.bind(contributions),derive=skills.derive.bind(skills),recalc=world.recalcSeat.bind(world);
 let pending:any;
 contributions.rebuild=(input:any,sink:any)=>{
  assert(!pending,'ordinary course must not recurse while preparing');
  const seat=world.seats.find(s=>s.meta===input);assert(seat);const hero=seat.home??seat.actor;
  const before=json(serializeCharacter(world)),cast=hero.casting,time=world.time,live=hero.sheet as any;
  // Bridge the original class only in this observer. An SDK-owned sheet uses
  // fork directly; no scalar catalogue scan or stale computed-value table.
  const captured=new StatSheet(rules);
  for(const[id,value]of live.baseOverrides)captured.setBase(id,value);
  captured.setConditions([...live.conditions]);captured.setGauges([...live.gauges]);
  for(const id of live.sourceNames())captured.setSource(id,live.getSourceMods(id));
  const sheet=captured.fork(),meta={...input,baseAttrs:structuredClone(input.baseAttrs),allocated:new Set(input.allocated),choices:structuredClone(input.choices),
   grafts:structuredClone(input.grafts),equipped:structuredClone(input.equipped),containers:structuredClone(input.containers)};
  const state:any={seat,hero,meta,sheet,life:hero.life,mana:hero.mana,cast,time};
  state.fold=rebuild(meta,{relicEffectsSuppressed:sink.relicEffectsSuppressed,conduits:(v:any)=>{state.conduits=v;},
   attributes:(attrs:any,mods:any)=>{meta.attrs=attrs;sheet.setSource('attributes',mods);},sheet});
  assert.equal(json(serializeCharacter(world)),before);assert.equal(hero.casting,cast);assert.equal(world.time,time);
  privateBuildChecks.prepared++;privateBuildChecks.unchanged++;pending=state;
  const result=rebuild(input,sink);
  assert.deepEqual(meta.attrs,input.attrs);assert.deepEqual(state.conduits,hero.wornConduits);
  const fold=(r:any)=>({passive:r.passiveMods,gear:[...r.gearSheetMods],containers:[...r.containerSheetMods],pieces:[...r.containerPieceMods].map(([i,m]:any)=>[i.uid,m])});
  assert.deepEqual(fold(state.fold),fold(result));return result;
 };
 skills.derive=(frame:any)=>{
  assert(pending,'contributions must precede equipment');const state=pending,before=equipment(frame),{fold}=state;
  const source={...frame,...fold,meta:{...frame.meta,...state.meta},passiveGrafts:()=>fold.passiveBuild.grafts};
  const draft=new EquipmentSkillDraft(source,{copySkill,copyItem:structuredClone,sheet:state.sheet,
   copyToggle:()=>{throw Error('ordinary context course unexpectedly acquired an aura/summon toggle');},
   deriveCompanions:(_candidate,defs)=>assert.equal(defs.length,0,'companion completion requires its separate full-graph qualification'),
   retire:()=>assert.fail('ordinary context course unexpectedly retired an aura/summon'),
  });
  derive(draft.frame);assert.equal(equipment(frame),before);assert.equal(state.hero.casting,state.cast);assert.equal(world.time,state.time);
  derive(frame);assert.equal(equipment(draft.frame),equipment(frame));privateBuildChecks.equipmentMatched++;state.draft=draft;
 };
 world.recalcSeat=(seat:any)=>{
  recalc(seat);const state=pending;assert(state?.draft&&state.seat===seat);const {sheet,hero}=state;
  sheet.setSource('level',[mod('life','flat',(hero.level-1)*PROGRESSION.lifePerLevel),
   mod('mana','flat',(hero.level-1)*PROGRESSION.manaPerLevel),mod('accuracy','flat',(hero.level-1)*4)]);
  assert.deepEqual(sheet.sourceNames(),hero.sheet.sourceNames());for(const id of sheet.sourceNames())assert.deepEqual(sheet.getSourceMods(id),hero.sheet.getSourceMods(id));
  for(const id of ['life','mana','damage','accuracy','skillgrant_firebolt'])assert.equal(sheet.get(id),hero.sheet.get(id));
  assert.equal(Math.min(state.life,sheet.get('life')),hero.life);assert.equal(Math.min(state.mana,sheet.get('mana')),hero.mana);
  assert.equal(hero.casting,state.cast);assert.equal(world.time,state.time);privateBuildChecks.completed++;pending=undefined;
 };
}
