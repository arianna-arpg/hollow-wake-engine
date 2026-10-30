import {createHitAftermath} from '@hollow-wake/engine/combat/hit-aftermath';
import type {HitStatusFrame} from '@hollow-wake/engine/statuses/hits';
import type {Actor} from './actor';
import type {World} from './world';
import type {ActiveStatus} from './status';
import type {DamagePacket} from './damage';
import {resistValue} from './damage';
import {mod, type Modifier, type SkillTag, type DamageType} from './stats';
import {
  makeSkillInstance, effectiveSkillLevel, instanceContagion, socketSpec,
  hostSockets, instanceChargeGain, skillContextTags, instanceTrigger, CONTAGION_CFG,
  type SkillDef, type SkillInstance, type SkillEffect, type SupportInstance,
} from './skills';
import {MASS_CFG} from './mass';
import {spawnVeinOf, SUPPORTBASE_CFG} from './supportbase';
import {throngEvolution} from './throngEvolution';
import {sameStory} from './tiers';
import {orbHitChance} from './orbGeneration';
import {WorldProcHitEvent} from './procAdapter';
import {SKILLS} from '../data/skills';
import {MONSTERS} from '../data/monsters';
import {ORB_CAP, ORB_DEFS, orbOnHitStat} from '../data/orbs';
import {angleTo, chance, dist, pick, rand, vec, type Vec2} from '../core/math';

type Frame = HitStatusFrame<Actor, SkillInstance, SkillDef, Modifier, SkillTag>;
export function bindHitAftermath(w: World) {
  return createHitAftermath<Actor, SkillInstance, SkillDef, Vec2, number, Modifier, SkillTag,
    ActiveStatus, SupportInstance, Frame, DamagePacket, DamageType, SkillEffect>({
    time: () => w.time, actors: () => w.actors,
    appendActor: actor => { w.actors.push(actor); },
    skill: id => SKILLS[id], monster: id => MONSTERS[id],
    makeInstance: makeSkillInstance, effectiveLevel: effectiveSkillLevel, chance, pick,
    copyPosition: actor => vec(actor.pos.x, actor.pos.y),
    scatterPosition: (actor, extent) => vec(actor.pos.x + rand(-extent, extent), actor.pos.y + rand(-extent, extent)),
    clampPoint: (point, radius) => w.clampPos(point, radius),
    distance: dist, direction: angleTo,
    randomDirection: () => rand(0, Math.PI * 2), randomPhase: () => rand(0, Math.PI * 2),
    sameStory, enemies: caster => w.enemiesOf(caster),
    executeSkill: (caster, inst, at, options) => w.executeSkill(caster, inst, at, options),
    volatileCue: (target, origin, color) => w['showCombatOutcome'](target, 'volatile_release', origin, color),
    knockFixtures: (caster, target, tone, wounding, inst) => w['knockFixtures'](caster, target, tone, wounding, inst),
    contagion: instanceContagion, contagionConfig: CONTAGION_CFG,
    queueContagion: release => { w['pendingContagions'].push(release); },
    flash: (pos, radius, color, life, edgeFrac) => {
      if (edgeFrac === undefined) w.flashes.push({pos, radius, color, life, maxLife: life});
      else w.flashes.push({pos, radius, color, life, maxLife: life, edgeFrac});
    },
    spreadOnHit: inst => socketSpec(inst, 'spreadOnHit'),
    transplant: (target, status, sourceName, spec) => w['transplantStatus'](target, status, sourceName, spec),
    curseOnHit: inst => socketSpec(inst, 'curseOnHit'),
    resolveHit: (caster, inst, target, multiplier, depth, forceDamage) => {
      if (forceDamage === undefined) w['resolveHit'](caster, inst, target, multiplier, depth);
      else w['resolveHit'](caster, inst, target, multiplier, depth, undefined, forceDamage);
    },
    dischargeStatuses: (caster, target, packet, dealt, depth) => w['engineHitStatuses'].dischargeOnHit(caster, target, packet, dealt, depth),
    plantAssault: (caster, target, packet, depth, dealt) => w.assaults.plant(caster, target, packet, depth, dealt),
    plantImpale: (caster, target, def, packet, extra, dealt, depth) => w['engineHitStatuses'].plantImpale(caster, target, def, packet, extra, dealt, depth),
    flatPhysicalModifier: amount => mod('addedPhysical', 'flat', amount),
    dominate: inst => socketSpec(inst, 'dominate'),
    createMonster: (id, level, team, owner) => w.createMonster(id, level, team, owner),
    companionBindCue: (actor, owner, definition) => w['showCompanionCue'](actor, 'bind', owner, definition.companionCue),
    companionArrivalCue: (actor, inst) => w['showRecoveryCue'](actor, 'arrive', inst),
    thorns: (target, caster, dealt) => w['applyThorns'](target, caster, dealt),
    kill: (target, silent, caster) => {
      if (silent === undefined) w.kill(target); else w.kill(target, silent, caster);
    },
    minionsOfSkill: (owner, id) => w.minionsOfSkill(owner, id),
    get deliveryKnock() { return MASS_CFG.deliveryKnock; },
    get deliveryKnockDefault() { return MASS_CFG.deliveryKnockDefault; },
    push: (target, direction, strength, caster, inst) => w['pushActor'](target, direction, strength, caster, inst),
    resistance: resistValue,
    currentLifeDamageCue: (target, amount) => w.text(vec(target.pos.x, target.pos.y - 12), Math.round(amount).toString(), '#ffe14a', 13),
    prepareStatuses: (caster, inst, target, def, extra, packet, dealt, depth, afflictionCarry) => w['engineHitStatuses'].prepare(caster, inst, target, def, extra, packet, dealt, depth, afflictionCarry),
    applyRiders: frame => w['engineHitStatuses'].applyRiders(frame),
    beforeEffects: (caster, inst, target, dealt, depth) => w.challenges.beforeEffects(caster, inst, target, dealt, depth),
    dispatchEffects: (frame, multiplier, effects) => w['engineHitEffects'].dispatch(frame, multiplier, effects),
    applyGrantedStatuses: frame => w['engineHitStatuses'].applyGranted(frame),
    strikeSurfaces: (caster, at, radius, tier) => w['strikeSurfaces'](caster, at, radius, undefined, undefined, tier),
    orbCount: () => w.orbs.length, get orbCap() { return ORB_CAP; },
    orbKeys: () => Object.keys(ORB_DEFS), orbOnHitStat, orbHitChance,
    shedOrb: (id, at, options) => w.shedOrb(id, at, options),
    remnantCount: () => w.remnants.length,
    appendRemnant: remnant => { w.remnants.push(remnant); },
    ringBell: target => w['ringBell'](target),
    throngOnHit: (caster, target, crit, lethal) => w['throngOnHit'](caster, target, crit, lethal),
    throngSplash: inst => throngEvolution(inst).splashScale,
    throngBurst: (caster, at, radius, scale, exclude) => w['throngEvolutionBurst'](caster, at, radius, scale, exclude),
    sockets: hostSockets,
    spawnSpec: socket => { const base = socket.def.rollBase; return base ? spawnVeinOf(base, socket.rolled) : undefined; },
    get spawnDuration() { return SUPPORTBASE_CFG.spawn.duration; },
    birth: (caster, effect, at, options) => w['birthAt'](caster, null, effect, at, options),
    hitProcs: (caster, inst, target, packet, dealt, depth, crit, lethal, elite, tags, extra) => w['sdkProcs'].hit(caster, inst, target, new WorldProcHitEvent(packet, dealt, depth, crit, lethal, elite, tags, extra)),
    carryProcs: (owner, inst, target, packet, dealt, depth, crit, lethal, elite, tags, extra) => w['sdkProcs'].carry(owner, inst, target, new WorldProcHitEvent(packet, dealt, depth, crit, lethal, elite, tags, extra)),
    chargeGains: instanceChargeGain,
    rollKillOrbs: (caster, inst, target) => w['rollKillOrbs'](caster, inst, target),
    rollKillRemnants: (caster, inst, at) => w['rollKillRemnants'](caster, inst, at),
    assaultAfterHit: (caster, target, dealt, depth, hasDamage) => w.assaults.afterHit(caster, target, dealt, depth, hasDamage),
    assaultDoomCull: target => w.assaultDoomCull(target),
    challengeAfterHit: (caster, inst, target, dealt, depth, multiplier) => w.challenges.afterHit(caster, inst, target, dealt, depth, multiplier),
    sequenceLanded: (caster, inst, target, dealt, physical, depth) => w.attackSequences.landed(caster, inst, target, dealt, physical, depth),
    companionOnHit: (caster, inst, target) => w.companionBonds.onHit(caster, inst, target),
    contextTags: skillContextTags,
    strideCue: caster => w.text(vec(caster.pos.x, caster.pos.y - caster.radius - 10), 'STRIDE!', '#9ad0ff', 12, 'combat'),
    killCharges: (caster, target) => w['tapCharges'](caster, 'kill', undefined, undefined, target),
    rollTriggers: (caster, event, context) => w['rollTriggers'](caster, event, context),
    instanceTrigger,
  });
}
