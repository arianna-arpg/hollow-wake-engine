import {StatSheet} from './stats.js';
import type {StatRules} from './stat-rules.js';
import type {Modifier} from './types.js';
import {PassiveGrants,type PassiveConduit} from './passive-grants.js';
import {BuildContributions,type BuildContributionPorts} from './build-contributions.js';
import {EquipmentSkills,type EquipmentSkill,type EquipmentSkillDefinition,type EquipmentSkillFrame,type EquipmentSkillPorts} from './equipment-skills.js';
import {EquipmentSkillDraft} from './equipment-skill-draft.js';
import {CompanionGrants,type CompanionGrantState,type CompanionSummon} from './companion-grants.js';
import {packSkillGemPayload,type GemDefinition,type GemSkill} from './gem-residence.js';
import type {GrantedSkillState,ItemInstance,SkillGemPayload} from './item-types.js';
import {copy,integer} from './validation.js';

declare const buildBrand:unique symbol;
declare const lineageBrand:unique symbol;
/** Owned by one CharacterBuilds instance; neither a save nor a live actor. */
export interface CharacterBuild {readonly [buildBrand]:true}
export interface CharacterSkillLineage {readonly [lineageBrand]:true}
export interface CharacterLearnedSkill {gem:SkillGemPayload;locked?:true}
export interface CharacterBuildInput<I extends ItemInstance=ItemInstance> {
  level:number;classId:string;baseAttrs:Record<string,number>;allocated:string[];
  choices:Record<string,string[]>;grafts:Record<string,string|null>;
  equipped:Record<string,I|undefined>;containers:Record<string,I[]|undefined>;
  features:string[];relicEnabled:boolean;relicEmpowerment:number;
  learned:CharacterLearnedSkill[];
}
/** Trusted observations of a current live build, not a save or permission.
 * The host supplies durable source history without temporary combat sources.
 * Adoption preserves investment; it never advances or installs live effects. */
export interface CharacterBuildAdoption {
  sourceOrder:string[];
  grants:{skillId:string;hostUid?:number;level:number;state:GrantedSkillState}[];
  companions:{skillId:string;level:number}[];
}
export interface CharacterBuildEdits {
  /** Admitted acquisition replaces an existing learned identity, including off-bar skills. */
  replaceLearned?:readonly string[];
  /** Explicit investment changes to an existing grant, before rebuilding.
   * No cold level-budget repair may be applied to this existing instance. */
  grants?:readonly {skillId:string;hostUid?:number;state:GrantedSkillState}[];
  /** An explicit complete rebind, admitted against the resulting ownership. */
  bar?:readonly (string|null)[];
}
export interface CharacterBuildSkillView {
  id:string;level:number;bonus?:number;
  sockets:({id:string;level:number;locked?:boolean;rolled?:Record<string,string>}|null)[];
  tree?:string[];grafts?:{id:string;level:number}[];host?:number;source?:string;
}
export interface CharacterBuildView<I extends ItemInstance=ItemInstance> {
  bar:(CharacterBuildSkillView|null)[];
  known:[string,CharacterBuildSkillView][];grants:[string,CharacterBuildSkillView][];
  companions:[string,CharacterBuildSkillView][];equipped:Record<string,I|undefined>;
  attrs:Record<string,number>;sources:[string,Modifier[]][];conduits?:PassiveConduit[];
}
export interface CharacterBuildService<I extends ItemInstance=ItemInstance> {
  readonly contentId:string;
  open(input:CharacterBuildInput<I>,bar:readonly(string|null)[]):CharacterBuild;
  adopt(input:CharacterBuildInput<I>,bar:readonly(string|null)[],adoption:CharacterBuildAdoption):CharacterBuild;
  rebuild(previous:CharacterBuild,input:CharacterBuildInput<I>,edits?:CharacterBuildEdits):CharacterBuild;
  read(token:CharacterBuild):CharacterBuildView<I>;
  stat(token:CharacterBuild,id:string):number;
  canSocket(token:CharacterBuild,skillId:string,supportId:string,rolled?:Readonly<Record<string,string>>):boolean;
  lineages(token:CharacterBuild):ReadonlyMap<string,CharacterSkillLineage>;
  investment(token:CharacterBuild):CharacterBuildInvestment;
}
export interface CharacterBuildInvestment {
  learned:CharacterLearnedSkill[];
  grants:{uid:number;relicKey?:string;grantState:NonNullable<ItemInstance['grantState']>}[];
}
type Skill<D extends EquipmentSkillDefinition,U extends GemDefinition> = Omit<EquipmentSkill<D,U>,'sockets'>&GemSkill<D,U>&{companionGrant?:boolean};
type Class = {id:string;innate?:Modifier[]};
type Container = {id:string;active:boolean};
export interface CharacterBuildPorts<D extends EquipmentSkillDefinition,U extends GemDefinition,S extends Skill<D,U>,I extends ItemInstance,C extends Class,T extends Container> {
  contentId:string;barSlots:number;stats:StatRules;passives:PassiveGrants;
  class(id:string):C|undefined;
  contributions:Omit<BuildContributionPorts<I,Modifier,T>,'beginPassives'|'board'>&{
    board(def:T,features:ReadonlySet<string>):ReturnType<BuildContributionPorts<I,Modifier,T>['board']>;
  };
  equipment:EquipmentSkillPorts<D,U,S,GrantedSkillState,C>;
  summon(def:D):CompanionSummon|undefined;
  /** Pure complete investment copies; immutable definitions may be shared. */
  copySkill(source:Readonly<S>):S;
  /** Cold learned-skill restoration, including the original repair policy. */
  restoreLearned(payload:SkillGemPayload):S;
  /** Apply admitted durable investment to an owned existing skill, without
   * cold repair. The definition and identity must remain unchanged. */
  updateLearned(skill:S,payload:SkillGemPayload):void;
  updateGrant(skill:S,state:GrantedSkillState):void;
  levelModifiers(level:number):Modifier[];
  socketFits?(def:U,inst:S,rolled?:Readonly<Record<string,string>>):boolean;
}

const completedBuildEffect=():never=>{throw Error('Completed durable build cannot execute effects');};
/** A draft's callbacks close over its reverse-copy maps and ports. Detach
 * them so a retained completed build cannot keep prior investment alive. */
function completedFrame<D,U,S,I>(frame:EquipmentSkillFrame<D,U,S,I>):EquipmentSkillFrame<D,U,S,I>{
  const grafts=[...frame.passiveGrafts()];
  return {...frame,passiveGrafts:()=>grafts,deriveCompanions:completedBuildEffect,
    deactivateAura:completedBuildEffect,dismissSummon:completedBuildEffect};
}

/** Complete durable build composition over admitted inputs. There are no live
 * effects, bodies, clocks or combat snapshots here. The default content factory
 * supplies these ports once. A host retains save admission, authority and live
 * acknowledgement. In particular, never install this private graph as an actor.
 * Failed candidates are unreachable; successful predecessors remain unchanged. */
export class CharacterBuilds<D extends EquipmentSkillDefinition,U extends GemDefinition,S extends Skill<D,U>,I extends ItemInstance,C extends Class,T extends Container> implements CharacterBuildService<I> {
  readonly #p:CharacterBuildPorts<D,U,S,I,C,T>;
  readonly #equipment:EquipmentSkills<D,U,S,I,GrantedSkillState,C>;
  readonly #builds=new WeakMap<CharacterBuild,{
    sheet:StatSheet;frame:EquipmentSkillFrame<D,U,S,I>;attrs:Record<string,number>;
    conduits?:PassiveConduit[];companions:CompanionGrantState<S,{dead:boolean}>;
    lineages:WeakMap<S,CharacterSkillLineage>;
  }>();
  constructor(ports:CharacterBuildPorts<D,U,S,I,C,T>){
    if(!ports.contentId)throw Error('Build content identity is required');
    integer(ports.barSlots,1,'Build bar slots');if(ports.barSlots>64)throw Error('Build bar exceeds 64 slots');
    this.#p=ports;this.#equipment=new EquipmentSkills(ports.equipment);
  }
  get contentId():string{return this.#p.contentId;}
  #get(token:CharacterBuild){const held=this.#builds.get(token);if(!held)throw Error('Foreign character build');return held;}
  #bar(ids:readonly(string|null)[]):void{
    if(ids.length!==this.#p.barSlots)throw Error('Wrong character bar length');
    const seen=new Set<string>();for(const id of ids)if(id!==null){
      if(typeof id!=='string'||!id||seen.has(id))throw Error('Invalid or duplicate character binding');seen.add(id);
    }
  }
  open(input:CharacterBuildInput<I>,bar:readonly(string|null)[]):CharacterBuild{
    this.#bar(bar);return this.#derive(input,undefined,copy(bar));
  }
  adopt(input:CharacterBuildInput<I>,bar:readonly(string|null)[],adoption:CharacterBuildAdoption):CharacterBuild{
    this.#bar(bar);return this.#derive(input,undefined,copy(bar),{},copy(adoption));
  }
  rebuild(previous:CharacterBuild,input:CharacterBuildInput<I>,edits:CharacterBuildEdits={}):CharacterBuild{
    this.#get(previous);if(edits.bar)this.#bar(edits.bar);
    return this.#derive(input,previous,undefined,copy(edits));
  }
  #derive(raw:CharacterBuildInput<I>,previous?:CharacterBuild,bar?:readonly(string|null)[],edits:CharacterBuildEdits={},adoption?:CharacterBuildAdoption):CharacterBuild{
    const p=this.#p,input=copy(raw),prior=previous&&this.#get(previous),classDef=p.class(input.classId);
    if(!classDef)throw Error('Unknown build class');integer(input.level,1,'Build level');
    const sheet=prior?prior.sheet.fork():new StatSheet(p.stats);
    // Preserve the original World initialization order, including an empty
    // level-one source. Subsequent builds retain their source insertion history.
    if(adoption){
      const allowed=new Set(['attributes','class','passives','level',...[...p.equipment.equipSlots()].map(row=>'gear:'+row.id),...[...p.contributions.containers()].map(row=>'container:'+row.id)]);
      if(new Set(adoption.sourceOrder).size!==adoption.sourceOrder.length||adoption.sourceOrder.some(id=>!allowed.has(id))||['attributes','class','passives','level'].some(id=>!adoption.sourceOrder.includes(id)))throw Error('Invalid durable source order');
      for(const id of adoption.sourceOrder)sheet.setSource(id,[]);
    }else if(!prior)for(const id of ['attributes','class','passives','level'])sheet.setSource(id,[]);
    let attrs:Record<string,number>={},conduits:PassiveConduit[]|undefined;
    const features=new Set(input.features),contributions=new BuildContributions({...p.contributions,
      board:(def:T)=>p.contributions.board(def,features),
      beginPassives:(meta:{baseAttrs:Record<string,number>;allocated:ReadonlySet<string>;choices:Record<string,readonly string[]>})=>
        p.passives.begin(meta.baseAttrs,meta.allocated,meta.choices,'skip')});
    const meta={...input,classDef,allocated:new Set(input.allocated)};
    const fold=contributions.rebuild(meta,{sheet,conduits:value=>{conduits=value;},attributes:(value,mods)=>{attrs=value;sheet.setSource('attributes',mods);}});
    const origins=new WeakMap<S,S>(),cloneSkill=(source:Readonly<S>):S=>{
      const owned=p.copySkill(source);if(!owned||owned===source||owned.def!==source.def)throw Error('Build requires an owned investment copy');
      origins.set(owned,source as S);return owned;
    };
    const companions:CompanionGrantState<S,{dead:boolean}>={grants:prior?.companions.grants&&new Map([...prior.companions.grants].map(([id,row])=>[id,{inst:cloneSkill(row.inst),remaining:0}]))};
    const companionRules=new CompanionGrants<{dead:boolean;downed:boolean;sheet:StatSheet},D,S,{dead:boolean},CompanionSummon>({
      summon:p.summon,maxLevel:p.equipment.skillMaxLevel,makeSkill:p.equipment.makeSkill,
      grantedLevel:(owner,def)=>owner.sheet.get(p.equipment.companionGrantStat(def.id)),
      respawnScale:()=>{throw Error('Durable build cannot simulate companions');}});
    const empty={seat:{},actor:{skills:Array<S|null>(p.barSlots).fill(null),sheet,activeAuras:new Map<string,{inst:S}>(),summonToggles:new Map<string,{inst:S}>()},meta:{knownSkills:new Map<string,S>()},
      deriveCompanions:()=>{},deactivateAura:()=>{},dismissSummon:()=>{}};
    const old=prior?.frame??empty;
    const draft=new EquipmentSkillDraft({...old,...fold,meta:{...old.meta,...meta},passiveGrafts:()=>fold.passiveBuild.grafts},{
      copySkill:cloneSkill,copyItem:copy,sheet,
      copyToggle:()=>{throw Error('Durable build cannot contain a live toggle');},
      retire:()=>{throw Error('Durable build cannot retire live effects');},
      deriveCompanions:(_frame,defs,name,key)=>companionRules.derive(companions,{dead:false,downed:false,sheet},defs,name,
        ()=>{throw Error('Durable build cannot own a companion body');},()=>{throw Error('Durable build cannot refresh a body');},key)});
    const frame=draft.frame,known=new Map<string,S>();
    let replacements:Set<string>|undefined;
    for(const id of edits.replaceLearned??[]){
      if(typeof id!=='string'||!id||replacements?.has(id)||!frame.meta.knownSkills.has(id)||!input.learned.some(row=>row.gem.skillId===id))throw Error('Invalid learned replacement');
      (replacements??=new Set()).add(id);
    }
    for(const row of input.learned){
      const payload=row.gem;
      if(known.has(payload.skillId))throw Error('Duplicate learned build skill');
      let inst=replacements?.has(payload.skillId)?undefined:frame.meta.knownSkills.get(payload.skillId);
      if(inst){const def=inst.def;p.updateLearned(inst,payload);if(inst.def!==def)throw Error('Learned update changed definition');}
      else {inst=p.restoreLearned(payload);if(adoption)p.updateLearned(inst,payload);}
      if(row.locked)inst.locked=true;else delete inst.locked;
      if(inst.def.id!==payload.skillId)throw Error('Learned restoration changed identity');known.set(payload.skillId,inst);
    }
    for(const[id,inst]of frame.meta.knownSkills)if(known.get(id)!==inst)for(let n=0;n<frame.actor.skills.length;n++)if(frame.actor.skills[n]===inst)frame.actor.skills[n]=known.get(id)??null;
    frame.meta.knownSkills=known;
    const adoptedGrants=new Map<string,S>();
    if(adoption){
      for(const row of adoption.grants){
        const def=p.equipment.skill(row.skillId);if(!def||adoptedGrants.has(row.skillId))throw Error('Invalid adopted grant');
        integer(row.level,1,'Adopted grant level');if(row.hostUid!==undefined)integer(row.hostUid,1,'Adopted grant host');
        const inst=p.equipment.makeSkill(def,row.level,p.equipment.grantSockets());
        if(inst.sockets.length!==row.state.sockets.length)throw Error('Stale adopted grant sockets');
        p.updateGrant(inst,row.state);inst.grantedHostUid=row.hostUid;
        adoptedGrants.set(row.skillId,inst);
      }
      frame.seat.grantedInsts=adoptedGrants.size?adoptedGrants:undefined;
    }
    const touched=new Map<string,S>();for(const edit of edits.grants??[]){
      const inst=frame.seat.grantedInsts?.get(edit.skillId);
      if(!inst||inst.grantedHostUid!==edit.hostUid||touched.has(edit.skillId))throw Error('Foreign or duplicate grant investment');
      touched.set(edit.skillId,inst);const def=inst.def;p.updateGrant(inst,edit.state);if(inst.def!==def)throw Error('Grant update changed definition');
    }
    if(bar){const owner={meta:frame.meta,grantedInsts:frame.seat.grantedInsts};for(let n=0;n<bar.length;n++)if(bar[n]){
      const inst=this.#equipment.resolve(owner,bar[n]!,p.contributions.compileItem);
      if(!inst)throw Error('Unresolved cold character binding');frame.actor.skills[n]=inst;
    }frame.seat.grantedInsts=(owner as typeof owner&{grantedInsts?:Map<string,S>}).grantedInsts;}
    this.#equipment.derive(frame);
    for(const[id,inst]of touched)if(frame.seat.grantedInsts?.get(id)!==inst)throw Error('Edited grant no longer belongs to this build');
    if(edits.bar){
      frame.actor.skills=edits.bar.map(id=>{if(id===null)return null;
        const inst=known.get(id)??frame.seat.grantedInsts?.get(id);if(!inst)throw Error('Unresolved character binding');return inst;});
      // Slot grafts depend on the requested positions. Re-evaluate them on the
      // owned graph; this second pass has no live effect callbacks.
      this.#equipment.derive(frame);
      for(let n=0;n<edits.bar.length;n++)if((frame.actor.skills[n]?.def.id??null)!==edits.bar[n])throw Error('Character binding was not retained');
    }
    sheet.setSource('level',p.levelModifiers(input.level));
    if(adoption){
      if((frame.seat.grantedInsts?.size??0)!==adoptedGrants.size)throw Error('Stale adopted grant set');
      for(const row of adoption.grants)if(frame.seat.grantedInsts?.get(row.skillId)!==adoptedGrants.get(row.skillId)||frame.seat.grantedInsts?.get(row.skillId)?.level!==row.level)throw Error('Stale adopted grant');
      if(new Set(adoption.companions.map(row=>row.skillId)).size!==adoption.companions.length||(companions.grants?.size??0)!==adoption.companions.length)throw Error('Stale adopted companions');
      for(const row of adoption.companions)if(companions.grants?.get(row.skillId)?.inst.level!==row.level)throw Error('Stale adopted companion');
      const order=sheet.sourceNames();if(order.length!==adoption.sourceOrder.length||order.some((id,n)=>id!==adoption.sourceOrder[n]))throw Error('Stale adopted source order');
    }
    const lineages=new WeakMap<S,CharacterSkillLineage>();
    for(const inst of [...known.values(),...(frame.seat.grantedInsts?.values()??[]),...[...(companions.grants?.values()??[])].map(row=>row.inst)]){
      const source=origins.get(inst),lineage=source&&prior?.lineages.get(source);
      lineages.set(inst,lineage??Object.freeze({}) as CharacterSkillLineage);
    }
    // Retain only the completed frame. The draft's reverse copy maps and
    // operation-local origins must not retain preceding investment objects.
    const token=Object.freeze({}) as CharacterBuild;this.#builds.set(token,{sheet,frame:completedFrame(frame),attrs,conduits,companions,lineages});return token;
  }
  /** Detached display data. No definition, item, sheet or private skill escapes. */
  read(token:CharacterBuild):CharacterBuildView<I>{
    const held=this.#get(token),f=held.frame;
    const skill=(s:S):CharacterBuildSkillView=>({id:s.def.id,level:s.level,bonus:s.bonusLevels,
      sockets:s.sockets.map(row=>row?{id:row.def.id,level:row.level,...(row.locked?{locked:true}:{}),...(row.rolled?{rolled:row.rolled}:{})}:null),
      tree:s.treeNodes,grafts:s.grafts?.map(row=>({id:row.def.id,level:row.level})),host:s.grantedHostUid,source:s.grantedBy});
    return copy({bar:f.actor.skills.map(s=>s&&skill(s)),known:[...f.meta.knownSkills].map(([id,s])=>[id,skill(s)]),
      grants:[...(f.seat.grantedInsts??[])].map(([id,s])=>[id,skill(s)]),companions:[...(held.companions.grants??[])].map(([id,row])=>[id,skill(row.inst)]),
      equipped:f.meta.equipped,attrs:held.attrs,sources:held.sheet.sourceNames().map(id=>[id,held.sheet.getSourceMods(id)!]),conduits:held.conduits});
  }
  stat(token:CharacterBuild,id:string):number{return this.#get(token).sheet.get(id);}
  /** Compatibility only; custody and payment remain command-owner responsibilities. */
  canSocket(token:CharacterBuild,skillId:string,supportId:string,rolled?:Readonly<Record<string,string>>):boolean{
    const frame=this.#get(token).frame,inst=frame.meta.knownSkills.get(skillId)??frame.seat.grantedInsts?.get(skillId);
    const def=this.#p.equipment.support(supportId);if(!inst||!def)return false;
    const fits=this.#p.socketFits;if(!fits)throw Error('Build support admission is unavailable');return fits(def,inst,rolled);
  }
  /** Detached normalized investment, including active container hosts. The
   * caller must route canonical relic writes through the account authority. */
  investment(token:CharacterBuild):CharacterBuildInvestment{
    const frame=this.#get(token).frame,items=new Set<I>(frame.containerPieceMods.keys());
    for(const item of Object.values(frame.meta.equipped))if(item)items.add(item);
    return copy({learned:[...frame.meta.knownSkills.values()].map(inst=>({gem:packSkillGemPayload(inst),...(inst.locked?{locked:true as const}:{})})),
      grants:[...items].filter(item=>item.grantState!==undefined).map(item=>({uid:item.uid,...(item.relicKey?{relicKey:item.relicKey}:{}),grantState:item.grantState!}))});
  }
  /** Stable opaque identities across private forks, including a remove/re-add
   * with the same item UID. The tokens carry no live references or history. */
  lineages(token:CharacterBuild):ReadonlyMap<string,CharacterSkillLineage>{
    const held=this.#get(token),f=held.frame,out=new Map<string,CharacterSkillLineage>();
    for(const[id,s]of f.meta.knownSkills)out.set('learned/'+id,held.lineages.get(s)!);
    for(const[id,s]of f.seat.grantedInsts??[])out.set('grant/'+id,held.lineages.get(s)!);
    for(const[id,row]of held.companions.grants??[])out.set('companion/'+id,held.lineages.get(row.inst)!);
    return out;
  }
}
