import {resolveGuardArts,guardArtCapacity,guardArtAbsorb as absorb,GUARD_ARTS_LIMITS as limits} from '@hollow-wake/engine/guard/arts';
import type {GuardArtsSpec as Spec,GuardArtValuePorts} from '@hollow-wake/engine/guard/arts';
import type {Actor} from './actor';import type {Modifier,SkillTag} from './stats';
import {instanceMods,skillContextTags,treeNodeOf,type ProjectileDelivery,type SkillInstance} from './skills';
export {guardArtsErrors} from '@hollow-wake/engine/guard/arts';
export type GuardArtsSpec=Spec<ProjectileDelivery>;
export const GUARD_ARTS_LIMITS={...limits};
export function guardArtsOf(inst:SkillInstance):GuardArtsSpec|undefined{return resolveGuardArts(inst,id=>treeNodeOf(inst.def,id)?.guardArts);}
const values:GuardArtValuePorts<Actor,SkillInstance,ProjectileDelivery,SkillTag,Modifier>={
 spec:guardArtsOf,tags:skillContextTags,modifiers:instanceMods,stat:(a,id,tags,mods)=>a.sheet.get(id,tags,mods),
};
export function guardCapacity(a:Actor,inst:SkillInstance):number{return guardArtCapacity(a,inst,values);}
export function guardArtAbsorb(a:Actor,inst:SkillInstance,power=1){return absorb(a,inst,values,power);}
