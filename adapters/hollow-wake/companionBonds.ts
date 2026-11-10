import {CompanionBonds as Runtime} from '@hollow-wake/engine/companions/bonds';
export {companionCanMimic} from '@hollow-wake/engine/companions/bonds';
import type {Actor} from './actor';import type {World} from './world';import type {MonsterRarity} from './rarity';
import type {CompanionCueSpec} from '../data/companionCues';
import {mod,type Modifier} from './stats';
import {makeSkillInstance,type SkillInstance} from './skills';
import {resolveMinionInheritance,applyMinionPlyBonus,type MinionInheritance} from './minionInheritance';
import {syncAttributeBequests} from './bequests';
import {companionBondOf,companionLevelOf,COMPANION_CFG} from './companionSpec';
// Import also registers stance command kinds and their meta face.
import {companionStanceDef,companionStanceIdOf,standingOrderFor} from './companionStances';
import {SKILLS} from '../data/skills';import {beastFamilyOf} from '../data/beastFamilies';
export class CompanionBonds extends Runtime<Actor,SkillInstance,Modifier,MinionInheritance,MonsterRarity,CompanionCueSpec|false> {
 constructor(w:World){super({
  actors:()=>w.actors,contains:a=>w.actors.includes(a),time:()=>w.time,random:()=>Math.random(),
  spec:companionBondOf,level:companionLevelOf,capacity:i=>w.companionCapOf(i),relevel:(a,l)=>w.relevelActor(a,l),
  recoveryStatus:()=>COMPANION_CFG.recovery.status,endStatus:(a,id)=>a.endStatus(id),
  stanceId:(owner,inst)=>{const seat=w.seatOf(owner)??w.seats.find(s=>s.home===owner);return companionStanceIdOf(seat?.meta.stances,inst.def.id);},
  stance:companionStanceDef,setStance:(a,id)=>{a.standingOrder=id?standingOrderFor(id):undefined;},
  inherit:resolveMinionInheritance,plyBonus:applyMinionPlyBonus,bequests:(a,i)=>syncAttributeBequests(a,1,i.tags,i.extra),
  maxLife:a=>a.maxLife(),setSource:(a,key,mods)=>a.sheet.setSource(key,mods),removeSource:(a,key)=>a.sheet.removeSource(key),
  sourceNames:a=>a.sheet.sourceNames(),sourceMods:(a,key)=>a.sheet.getSourceMods(key),
  hasSkill:id=>!!SKILLS[id],makeSkill:(id,level)=>makeSkillInstance(SKILLS[id],level),familySkill:id=>beastFamilyOf(id).skillId,
  dreadSkill:(damage,level)=>makeSkillInstance({...SKILLS.beast_dread_pulse,baseDamage:{chaos:[damage,damage]}},level),
  copyForMimic:inst=>({...inst,sockets:[...inst.sockets],grafts:inst.grafts&&[...inst.grafts],treeNodes:inst.treeNodes&&[...inst.treeNodes],state:undefined}),
  retirePayloads:(beast,owned)=>{
   const owns=(caster:Actor,inst:SkillInstance)=>caster===beast&&owned.has(inst);
   w.pendingRepeats=w.pendingRepeats.filter(p=>!owns(p.caster,p.inst));
   w.projectiles=w.projectiles.filter(p=>!owns(p.caster,p.inst));
   w.pendingFuses=w.pendingFuses.filter(p=>!owns(p.caster,p.inst));
   for(let i=w.zones.length-1;i>=0;i--){const z=w.zones[i];if(owns(z.caster,z.inst))w.retireOwnedZone(z);}
  },
  payloadActive:(beast,issued)=>w.pendingRepeats.some(p=>p.caster===beast&&p.inst===issued)
   ||w.projectiles.some(p=>p.caster===beast&&p.inst===issued)||w.pendingFuses.some(p=>p.caster===beast&&p.inst===issued)||w.zones.some(z=>z.caster===beast&&z.inst===issued),
  removeBuff:(a,id)=>a.removeBuff(id),addBuff:(a,buff)=>a.addBuff(buff),modifier:mod,
  revive:(a,power)=>w.reviveCompanion(a,power),enemies:a=>w.enemiesOf(a),flash:f=>{w.flashes.push(f);},
  pulseHit:(a,i,target,power)=>w.companionPulseHit(a,i,target,power),execute:(a,i,aim,options)=>w.executeSkill(a,i,aim,options),
  use:(a,i,aim)=>w.useSkill(a,i,aim),repeat:r=>{w.pendingRepeats.push(r);},orb:(kind,pos)=>w.shedOrb(kind,pos),charge:(a,id,n,tier)=>a.gainCharge(id,n,tier),
  command:(a,command)=>{a.aiCommand=command;},cue:(a,owner,spec)=>w.showCompanionCue(a,'answer',owner,spec),
 });}
}
