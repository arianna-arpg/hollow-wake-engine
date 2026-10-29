import {AttackSequences as EngineAttackSequences} from '@hollow-wake/engine/combat/attack-sequences';
import type {Actor} from './actor';
import type {Projectile, World} from './world';
import {dist, type Vec2} from '../core/math';
import {instanceDelivery, instanceMods, skillContextTags, type SkillDef, type SkillInstance} from './skills';
import {attackSequenceOf, attackSequencePayload, attackSequenceSweepInstance} from './attackSequenceSpec';
import {mod, type Modifier, type SkillTag, type DamageType} from './stats';
import {baselineStatusDps, STATUS_DEFS} from './status';

/** Simulation services and presentation only. The installed SDK owns the
 * controller, its decisions, identities, scheduling and recovery state. */
export class AttackSequences extends EngineAttackSequences<
  Actor, SkillInstance, Projectile, Vec2, Modifier, SkillTag, SkillDef['delivery']
> {
  constructor(w: World) {
    super({
      time: () => w.time,
      random: () => Math.random(),
      actors: () => w.actors,
      enemiesOf: actor => w.enemiesOf(actor),
      distance: dist,
      copyPosition: position => ({...position}),
      pointAt: (origin, angle, distance) => ({x: origin.x + Math.cos(angle) * distance, y: origin.y + Math.sin(angle) * distance}),
      interpolate: (from, to, ratio) => ({x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio}),
      clampPosition: (at, radius, origin, tier) => w.clampPos(at, radius, origin, {tier}),
      lineOfFire: (from, to, tier) => w.lineOfFire(from, to, tier),
      actorScale: actor => w.timeflow.actorScale(actor),
      spec: attackSequenceOf,
      delivery: instanceDelivery,
      tags: skillContextTags,
      mods: instanceMods,
      modifier: mod,
      payload: attackSequencePayload,
      sweep: attackSequenceSweepInstance,
      execute: (actor, inst, aim, options) => {w.executeSkill(actor, inst, aim, options);},
      spawnMarker: (actor, inst, spec, at) => w.spawnConstruct(actor, inst, spec, at, undefined, at),
      spawnProjectile: (actor, inst, at, angle, options) => {w.spawnProjectile(actor, inst, at, angle, options);},
      inheritedFlight: projectile => w.inheritedFlight(projectile),
      statusDefinition: id => STATUS_DEFS[id],
      zoneLevel: () => w.zone.level,
      baselineStatusDps,
      // Definitions come from STATUS_DEFS, whose element is a DamageType.
      applyStatus: (actor, id, dps, duration, name, options) => {actor.applyStatus(id, dps, duration, name,
        {...options, ruptureType: options.ruptureType as DamageType | undefined});},
      burst: (owner, inst, target, amount) => {w.attackSequenceBurst(owner, inst, target, amount);},
      flights: () => w.projectiles,
      filterFlights: keep => {w.projectiles = w.projectiles.filter(keep);},
      work: queue => {
        switch (queue) {
          case 'salvos': return w.pendingSalvos;
          case 'repeats': return w.pendingRepeats;
          case 'steps': return w.pendingSteps;
          case 'followUps': return w.pendingFollowUps;
          case 'fuses': return w.pendingFuses;
        }
      },
      filterWork: (queue, keep) => {
        switch (queue) {
          case 'salvos': w.pendingSalvos = w.pendingSalvos.filter(keep); break;
          case 'repeats': w.pendingRepeats = w.pendingRepeats.filter(keep); break;
          case 'steps': w.pendingSteps = w.pendingSteps.filter(keep); break;
          case 'followUps': w.pendingFollowUps = w.pendingFollowUps.filter(keep); break;
          case 'fuses': w.pendingFuses = w.pendingFuses.filter(keep); break;
        }
      },
      retireZones: owned => {for (const zone of [...w.zones]) if (owned(zone.caster, zone.inst)) w.retireOwnedZone(zone);},
      kill: (actor, silent) => {w.kill(actor, silent);},
      cycleCue: (target, inst, step, maximum) => {
        w.flashes.push({pos: {...target.pos}, radius: target.radius + 3 + step * 3,
          color: maximum ? '#f0b475' : inst.def.color, life: maximum ? 0.3 : 0.13, maxLife: maximum ? 0.3 : 0.13, edgeFrac: 0.85});
      },
      impactCue: (target, radius) => {w.flashes.push({pos: {...target.pos}, radius, color: '#b73e36', life: 0.3, maxLife: 0.3, edgeFrac: 0.7});},
      flightCue: p => {w.flashes.push({pos: {...p.pos}, radius: p.radius, color: p.color, life: 0.05, maxLife: 0.05, fx: 'recoverableAxe', facing: p.age * 14});},
      lodgedCue: (at, target, inst) => {w.flashes.push({pos: {x: at.x, y: at.y - target.radius}, radius: 8,
        color: inst.def.color, life: 0.08, maxLife: 0.08, fx: 'recoverableAxe'});},
      bounceCue: (at, p, inst, radius, elapsed, ratio) => {
        w.flashes.push({pos: {x: p.pos.x, y: p.pos.y - Math.sin(ratio * Math.PI) * 90}, radius: 10,
          color: inst.def.color, life: 0.08, maxLife: 0.08, fx: 'recoverableAxe', facing: elapsed * 12});
        w.flashes.push({pos: {...at}, radius, color: inst.def.color, life: 0.08, maxLife: 0.08, edgeFrac: 0.9});
      },
    });
  }
}
