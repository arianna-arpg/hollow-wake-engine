// Keep the original registration side effect explicit in this legacy adapter.
import './reception';
import {damagePipeline} from './damagePipeline';
import type {Modifier,SkillTag} from './stats';
import type {Actor} from './actor';
import type {DamagePacket as Packet,MitigateOptions} from '@hollow-wake/engine/combat/damage';
export type {HitResult,DamageBand,SkillDamagePreview} from '@hollow-wake/engine/combat/damage';
export {HOLLOW_WAKE_DAMAGE_RULES} from '@hollow-wake/engine/combat/damage';
import {HOLLOW_WAKE_DAMAGE_RULES} from '@hollow-wake/engine/combat/damage';
export const SLAYER_CFG=HOLLOW_WAKE_DAMAGE_RULES.slayer;
export type DamagePacket=Packet<Modifier,SkillTag>;
export type MitigateOpts=MitigateOptions<Actor,Modifier,SkillTag>;
export const {applyConversion,rollSkillDamage,skillDamageBands,resistValue,mitigateTyped,landLifeDamage,applyHit,applyDot}=damagePipeline;
