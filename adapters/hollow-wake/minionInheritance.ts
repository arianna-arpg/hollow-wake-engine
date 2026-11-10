import {MinionInheritanceResolver} from '@hollow-wake/engine/minions/inheritance';
import type {MinionInheritance as Inheritance} from '@hollow-wake/engine/minions/inheritance';
export {applyMinionPlyBonus} from '@hollow-wake/engine/minions/inheritance';
import type {Actor} from './actor';
import {RELIQUARY_CFG} from '../data/reliquary';
import {STAT_DEFS,mod,type Modifier,type SkillTag} from './stats';
import {instanceMods,skillContextTags,type SkillInstance} from './skills';
import {minionBodyContext} from './skillScopes';
import {minionCombatOf,MINION_COMBAT} from './minionCombat';
import {THRONG_EVOLUTION,throngEvolution} from './throngEvolution';
import {STATUS_DEFS} from './status';
export type MinionInheritance=Inheritance<Modifier,Set<SkillTag>>;
const resolver=new MinionInheritanceResolver<Actor,SkillInstance,Modifier,Set<SkillTag>>({
 tags:skillContextTags,modifiers:instanceMods,bodyContext:minionBodyContext,combat:i=>minionCombatOf(i.def),
 stat:(a,id,tags,mods)=>a.sheet.get(id,tags,mods),base:id=>STAT_DEFS[id]?.base,
 ordinaryStats:()=>RELIQUARY_CFG.minion.ordinaryStats,maxAreaAvoidance:()=>MINION_COMBAT.maxAreaAvoidance,minThreat:()=>MINION_COMBAT.minThreat,
 armorFloor:()=>THRONG_EVOLUTION.armorFloor,lifeScale:i=>throngEvolution(i).lifeScale,modifier:mod,
 statusIds:Object.keys(STATUS_DEFS),armed:(a,prefix,ids,extra)=>a.sheet.armedFamily(prefix,ids,extra),
});
export function minionAreaAvoidanceOf(caster:Actor,inst:SkillInstance,tags=skillContextTags(inst),extra=instanceMods(inst)){
 return resolver.areaAvoidanceOf(caster,inst,tags,extra);
}
export function resolveMinionInheritance(caster:Actor,inst:SkillInstance,bodyId?:string,scale=1):MinionInheritance{
 return resolver.resolve(caster,inst,bodyId,scale);
}
