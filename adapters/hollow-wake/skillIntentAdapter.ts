import {SkillIntent} from '@hollow-wake/engine/casting/intent';
import {SkillInstances} from '@hollow-wake/engine/casting/instances';
import type {Actor} from './actor';
import type {Seat, World} from './world';
import {castSealShuts, type CastSealSpec} from './castseal';
import {SKILLS} from '../data/skills';
import {makeSkillInstance, effectiveSkillLevel, instanceTreeMods, instanceTrigger,
  instanceChargeCost, instanceTargeting, instanceConvert, convertRuleHolds,
  type SkillInstance} from './skills';
import {mimicSelected, mimicPowerMods} from './mimic';

// Called once per World. Only closures capture the host; no constructor-time
// query observes its partially initialized actors, zone or seats.
export function createSkillIntent(world: World): SkillIntent<Actor, SkillInstance, Seat, CastSealSpec> {
  const instances = new SkillInstances<Actor, SkillInstance>({
    skill: id => SKILLS[id],
    create: makeSkillInstance,
    effectiveLevel: effectiveSkillLevel,
    treeMods: instanceTreeMods,
  });
  return new SkillIntent(instances, {
    time: () => world.time,
    castSeal: () => world.zone.castSeal,
    sealShuts: (spec, caster, inst) => castSealShuts(spec, {world, caster, inst, seated: world.seatOf(caster) !== undefined}),
    seat: actor => world.seatOf(actor),
    knownSkill: (seat, id) => seat.meta.knownSkills.has(id),
    requirementShortfall: (id, seat) => world.reqShortfall(id, seat),
    trigger: inst => !!instanceTrigger(inst),
    gatesMet: (actor, inst) => actor.gatesMet(inst),
    chargeCost: instanceChargeCost,
    targeting: instanceTargeting,
    qualifiedTargetAvailable: (actor, inst) => world.resolveTargeting(actor, inst, actor.aimPos ?? actor.pos) !== null,
    canUse: (actor, inst) => actor.canUse(inst),
    mimicSelected,
    mimicPowerMods: inst => mimicPowerMods(inst.def.mimic!),
    conversion: instanceConvert,
    conversionHolds: (when, actor, inst) => convertRuleHolds(when, actor, inst, world),
  });
}
