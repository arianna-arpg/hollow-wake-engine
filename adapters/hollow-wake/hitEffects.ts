import {createHitEffects, type HitEffectSet} from '@hollow-wake/engine/combat/hit-effects';
import type {HitStatusFrame} from '@hollow-wake/engine/statuses/hits';
import type {Actor} from './actor';
import type {World} from './world';
import type {ActiveStatus} from './status';
import {instanceEffects, type SkillDef, type SkillInstance, type SkillEffect} from './skills';
import type {Modifier, SkillTag} from './stats';
import {skillAbsorbAmount} from './absorb';
import {isDormant} from './ai';
import {sameStory} from './tiers';
import {angleTo, dist, rand, vec, type Vec2} from '../core/math';

type Effects = {[K in keyof HitEffectSet]: Extract<SkillEffect, {type: K}>};
type Frame = HitStatusFrame<Actor, SkillInstance, SkillDef, Modifier, SkillTag>;
export function bindHitEffects(w: World) {
  return createHitEffects<Actor, SkillInstance, SkillDef, Vec2, number, Modifier, SkillTag, ActiveStatus, Effects, SkillEffect['type'], Frame>({
    effects: instanceEffects,
    heal: (...args) => w['applyHealChained'](...args), cleanse: (...args) => w['cleanseActor'](...args),
    buff: (...args) => w['grantTreeBuff'](...args), rupture: (...args) => w['ruptureBank'](...args),
    status: (frame, fx) => w['engineHitStatuses'].applyAuthored(frame, fx),
    direction: angleTo, randomDirection: () => rand(0, Math.PI * 2), distance: dist,
    push: (...args) => w['pushActor'](...args),
    grab: (caster, inst, target, fx) => w['grabSeize'](caster, inst, target, fx.grab),
    possess: (caster, inst, target, fx) => w['possessSeize'](caster, inst, target, fx.spec),
    dormant: isDormant, absorbAmount: skillAbsorbAmount,
    absorb: (...args) => w['grantAbsorb'](...args), restore: (...args) => w['applyRestore'](...args),
    orb: (...args) => w['shedOrb'](...args), copyPosition: at => vec(at.x, at.y),
    birth: (...args) => w['birthAt'](...args), enemies: caster => w.enemiesOf(caster), sameStory,
    transplant: (...args) => w['transplantStatus'](...args),
    flash: (pos, radius, color, life) => { w.flashes.push({pos, radius, color, life, maxLife: life}); },
    fail: (...args) => w['failNote'](...args),
  });
}
