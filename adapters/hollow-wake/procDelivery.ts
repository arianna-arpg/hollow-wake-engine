import {countProcSummons, createProcDelivery} from '@hollow-wake/engine/combat/proc-delivery';
import {applyWardEffect} from '@hollow-wake/engine/combat/effects';
import {applyProcHeal} from '@hollow-wake/engine/combat/recovery';
import {applyProcRestoration} from '@hollow-wake/engine/combat/restoration';
import {applyProcCooldown} from '@hollow-wake/engine/combat/cooldowns';
import {angleTo, dist, rand, vec, type Vec2} from '../core/math';
import type {ProcCastSpec, ProcDef} from '../data/procs';
import type {Actor} from './actor';
import type {BirthEffect} from './clutch';
import {mitigateTyped} from './damage';
import {lifeRecoveryPorts} from './lifeRecoveryAdapter';
import {wardEffectPorts} from './procEffectAdapter';
import {buffProcCue, noteProcCue} from './procCues';
import {resourceRestorationPorts} from './resourceRestorationAdapter';
import {instanceMods, skillContextTags, type BuffEffect, type SkillInstance} from './skills';
import type {DamageType} from './stats';
import {STATUS_DEFS} from './status';
import {sameStory} from './tiers';
import type {World} from './world';

export function bindProcDelivery(w: World) {
  return createProcDelivery<SkillInstance, Vec2, number, BuffEffect, BirthEffect, DamageType, number, Actor, ProcDef>({
    stat: (actor, name, inst) => inst === undefined ? actor.sheet.get(name)
      : actor.sheet.get(name, inst ? skillContextTags(inst) : undefined, inst ? instanceMods(inst) : undefined),
    buffCue: buffProcCue, withStoredCue: (buff, storedCue) => ({...buff, storedCue}), cue: noteProcCue,
    status: (fx, name, actor, inst, target) => w['engineStatusEffects'].applyProcStatus(fx, name, actor, inst, target),
    heal: (actor, fx) => applyProcHeal(actor, fx, lifeRecoveryPorts, actor.healBy),
    restore: (actor, fx) => applyProcRestoration(actor, fx, resourceRestorationPorts),
    cooldown: applyProcCooldown, ward: (actor, fx) => applyWardEffect(actor, fx, wardEffectPorts),
    delayed: (actor, fx, color, depth, target) => w['delayedBurstEngine'].schedule(w, actor, fx, color, depth, target),
    statusDefinition: id => STATUS_DEFS[id],
    enemies: actor => w.enemiesOf(actor), sameStory, distance: dist, direction: angleTo, copyPosition: at => vec(at.x, at.y),
    flash: (pos, radius, color, life) => {w.flashes.push({pos, radius, color, life, maxLife: life});},
    arcTrail: (from, to, proc) => {
      for (let step = 1; step <= 3; step++) {
        const f = step / 3;
        const pos = vec(from.pos.x + (to.pos.x - from.pos.x) * f, from.pos.y + (to.pos.y - from.pos.y) * f);
        w.flashes.push({pos, radius: 14, color: proc.color, life: 0.18, maxLife: 0.18});
      }
    },
    strikeSurfaces: (actor, at, radius) => w['strikeSurfaces'](actor, at, radius),
    hit: (actor, inst, target, scale, depth) => w['resolveHit'](actor, inst, target, scale, depth),
    mitigate: (target, type, amount) => mitigateTyped(target, {[type]: amount}),
    text: (at, value, color, size) => w.text(at, value, color, size),
    shieldBreak: (target, depth) => w['rollOwnProcs'](target, 'esBreak', {depth}),
    sweepDefenses: (target, depth) => w['sweepDefenseEvents'](target, depth), kill: target => w.kill(target),
    push: (target, direction, force) => w['pushActor'](target, direction, force),
    summonCount: (owner, key) => countProcSummons(w.actors, owner, key),
    createMonster: (id, owner) => w['createMonster'](id, owner.level, owner.team, owner),
    lifeline: owner => w['conjurationLifeline'](owner),
    forwardSockets: (inst, summon) => w['forwardSummonSockets'](inst, summon.skills),
    placeSummon: (summon, target, scatter) => {
      summon.pos = w['clampPos'](vec(target.pos.x + rand(-scatter, scatter), target.pos.y + rand(-scatter, scatter)), summon.radius);
    },
    publishSummon: summon => {w.actors.push(summon);},
    birth: (owner, fx, at, host, capKey) => w['birthAt'](owner, null, fx, at, {host, capKey}),
    lightwell: (kind, at) => w['spawnLightwell'](kind, at),
    vent: (fx, at, scale, duration, tier) => w['plantVent'](fx, at, scale, duration, tier),
    // This pinned World forwarder reads the tuple. The original mutable tuple
    // type is wider than its implementation's needs; retain its exact identity.
    cast: (actor, inst, target, depth, spec, aim) => w['castProcPayload'](actor, inst, target, depth, spec as ProcCastSpec, aim),
    riders: (def, actor, inst, target, depth) => w['fireProcRiders'](def, actor, inst, target, depth),
  });
}
