import {resolveCompanionBond,companionLevelOf as level,companionRecoverySeconds as recovery,DEFAULT_COMPANION_RULES} from '@hollow-wake/engine/companions/bonds';
import type {CompanionBondSpec as Spec,CompanionSaved as Saved,CompanionRules} from '@hollow-wake/engine/companions/bonds';
import type {Modifier} from './stats';import type {MonsterRarity} from './rarity';
import {treeNodeOf,type SkillInstance} from './skills';
export type CompanionBondSpec=Spec<Modifier>;
export type CompanionSaved=Saved<Modifier,MonsterRarity>;
export const COMPANION_CFG:CompanionRules={level:{...DEFAULT_COMPANION_RULES.level},recovery:{...DEFAULT_COMPANION_RULES.recovery}};
export function companionLevelOf(keeper:number,claimed:number){return level(keeper,claimed,COMPANION_CFG.level);}
export function companionRecoverySeconds(activeBodies:number){return recovery(activeBodies,COMPANION_CFG.recovery);}
export function companionBondOf(inst:SkillInstance):CompanionBondSpec{return resolveCompanionBond(inst.treeNodes,id=>treeNodeOf(inst.def,id)?.companionBond);}
