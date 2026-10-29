import {AttackSequenceContent, attackSequenceErrors as engineAttackSequenceErrors} from '@hollow-wake/engine/combat/attack-sequence-content';
import type {AttackSequenceSpec as EngineAttackSequenceSpec} from '@hollow-wake/engine/combat/attack-sequences';
import {treeNodeOf, instanceInnateMods, makeSkillInstance, skillContextTags,
  type BuffEffect, type MeleeDelivery, type ProjectileDelivery, type SkillDef, type SkillInstance} from './skills';
import type {Modifier, SkillTag} from './stats';

export interface AttackSequenceSpec extends EngineAttackSequenceSpec<Modifier, SkillDef['delivery']> {cycleBuff?: BuffEffect}
// A stateless compiler binding; the SDK keeps no selected instances here.
const content = new AttackSequenceContent<SkillInstance, Modifier, SkillTag, SkillDef['delivery']>({
  patch: (definition, nodeId) => treeNodeOf(definition, nodeId)?.attackSequence,
  innateMods: instanceInnateMods,
  tags: skillContextTags,
  make: makeSkillInstance,
}, ['attack', 'melee', 'aoe', 'physical']);

export function attackSequenceOf(inst: SkillInstance): AttackSequenceSpec | undefined {return content.spec(inst);}
export function attackSequenceDelivery(inst: SkillInstance): ProjectileDelivery | undefined {return content.delivery(inst);}
export function attackSequencePayload(host: SkillInstance, delivery: SkillDef['delivery'], tags?: SkillTag[]): SkillInstance {return content.payload(host, delivery, tags);}
export function attackSequenceSweepInstances(host: SkillInstance): SkillInstance[] {return content.sweeps(host);}
export function attackSequenceSweepInstance(host: SkillInstance, delivery: MeleeDelivery): SkillInstance {return content.sweep(host, delivery);}
export function attackSequenceStatuses(inst: SkillInstance): string[] {return content.statuses(inst);}
export function attackSequenceErrors(spec: AttackSequenceSpec): string[] {return engineAttackSequenceErrors(spec);}
