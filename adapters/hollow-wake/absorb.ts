import {damagePipeline} from './damagePipeline';
import type {AbsorbLayer as Layer} from '@hollow-wake/engine/combat/damage';
import type {SkillInstance} from './skills';
export type AbsorbLayer=Layer<SkillInstance>;
export const {spendAbsorbLayers,tickAbsorbLayers,skillAbsorbAmount}=damagePipeline;
