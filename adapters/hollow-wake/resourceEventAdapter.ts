import {ResourceEvents} from '@hollow-wake/engine/resources/events';
import {dist, type Vec2} from '../core/math';
import {instanceChargeGain, type SkillInstance} from './skills';
import type {Actor} from './actor';

/** Shared resource events borrow the game's real geometry, victim identity,
 * random stream and award paths. The SDK does not decide that a hit/kill occurred. */
export function createResourceEvents(elite: (victim: Actor) => boolean): ResourceEvents<Actor, SkillInstance, Vec2, Actor> {
  return new ResourceEvents<Actor, SkillInstance, Vec2, Actor>({
    skills: actor => actor.skills,
    taps: instanceChargeGain,
    toggled: (actor, inst) => actor.activeAuras.has(inst.def.id) || actor.summonToggles.has(inst.def.id),
    distance: (actor, at) => dist(actor.pos, at),
    elite,
    random: () => Math.random(),
    gain: (actor, inst, tap) => actor.gainCharge(tap.charge, tap.amount, tap.max, inst),
    gaugeTerms: (actor, inst) => actor.gaugeEff(inst)!,
    cooldown: (actor, inst) => actor.cooldowns.get(inst.def.id) ?? 0,
    setCooldown: (actor, inst, seconds) => { actor.cooldowns.set(inst.def.id, seconds); },
  }, {deathRadius: 360});
}
