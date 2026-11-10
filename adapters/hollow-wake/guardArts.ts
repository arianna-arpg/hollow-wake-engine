import {GuardArts as Runtime,type GuardArtsPorts} from '@hollow-wake/engine/guard/arts';
export type {GuardArtVisual} from '@hollow-wake/engine/guard/arts';
import type {Actor} from './actor';import type {World} from './world';
import {mod,type Modifier,type SkillTag} from './stats';
import {guardBashSpec,grantedTags,instanceMods,skillContextTags,type SkillInstance,type ProjectileDelivery,type GuardBashSpec} from './skills';
import {guardArtsOf,guardCapacity,guardArtAbsorb,GUARD_ARTS_LIMITS} from './guardArtsSpec';
import {spendAbsorbLayers} from './absorb';import {SATELLITES} from './satelliteSpec';
/** Bind every effect to this world, including private build worlds. The caller
 * owns the complete detached graph; constructing ports does not copy it. */
export function guardArtsPorts(w:World):GuardArtsPorts<Actor,SkillInstance,ProjectileDelivery,GuardBashSpec,SkillTag,Modifier> {
 return {
  actors:()=>w.actors,contains:a=>w.actors.includes(a),client:()=>!!w.clientActionHook,time:()=>w.time,scale:a=>w.timeflow.actorScale(a),
  spec:guardArtsOf,bashSpec:guardBashSpec,capacity:guardCapacity,absorb:guardArtAbsorb,
  tags:skillContextTags,grantedTags,modifiers:instanceMods,stat:(a,id,tags,mods)=>a.sheet.get(id,tags,mods),modifier:mod,
  setSource:(a,key,mods)=>a.sheet.setSource(key,mods),removeSource:(a,key)=>a.sheet.removeSource(key),addBuff:(a,buff)=>a.addBuff(buff),removeBuff:(a,key)=>a.removeBuff(key),
  spendAbsorb:spendAbsorbLayers,cooldown:(a,i)=>w.guardArtCooldown(a,i),bash:(a,i,s,power)=>w.guardBash(a,i,s,power),
  payload:(inst,delivery,flat)=>({...inst,guardArtsHost:inst,guardArtsPayload:true,procChainDepth:Math.max(1,inst.procChainDepth??0),
   def:{...inst.def,guard:undefined,guardArts:undefined,castMode:'cast',delivery,
    tags:[...new Set<SkillTag>([...skillContextTags(inst),...(delivery.type==='projectile'?['projectile','aoe'] as SkillTag[]:['aoe'] as SkillTag[])])],
    baseDamage:flat?Object.fromEntries(Object.entries(flat).map(([t,v])=>[t,[v,v]])):undefined,effects:[{type:'damage'}]}}),
  appendTags:(inst,tags)=>{inst.def={...inst.def,tags:[...inst.def.tags,...tags as SkillTag[]]};},
  enemies:a=>w.enemiesOf(a),lineOfSight:(a,b)=>w.lineOfSight(a.pos,b.pos,a.tier,b.tier),hit:(a,i,e,flat,push)=>w.guardArtHit(a,i,e,flat,push),
  execute:(a,i,aim,options)=>w.executeSkill(a,i,aim,options),retireProjectiles:(a,host)=>{w.projectiles=w.projectiles.filter(p=>p.caster!==a||p.inst.guardArtsHost!==host);},
  flash:value=>{w.flashes.push(value);},hasLite:()=>!!w.lite.liveCount,promote:(a,within,max)=>{w.litePromoteNearest(a.pos,{within,max,opposing:a.team,story:a.tier});},
  weight:a=>a.effectiveWeight(),maxLife:a=>a.maxLife(),heal:(a,amount)=>{a.healBy(amount);},satellite:family=>SATELLITES[family],random:()=>Math.random(),
 };
}
export class GuardArts extends Runtime<Actor,SkillInstance,ProjectileDelivery,GuardBashSpec,SkillTag,Modifier> {
 constructor(w:World){super(guardArtsPorts(w),undefined,GUARD_ARTS_LIMITS);}
}
