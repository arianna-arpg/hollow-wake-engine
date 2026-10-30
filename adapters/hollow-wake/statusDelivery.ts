import {createStatusDelivery} from '@hollow-wake/engine/statuses/delivery';
import type {Actor} from './actor';
import type {World} from './world';
import {effectiveSkillLevel, instanceTreeOver, makeSkillInstance, type SkillDef, type SkillInstance} from './skills';
import {STATUS_DEFS, type ActiveStatus} from './status';
import type {Modifier, SkillTag} from './stats';
import {mitigateTyped} from './damage';
import {SKILLS} from '../data/skills';
import {angleTo, dist, vec, type Vec2} from '../core/math';

export function bindStatusDelivery(w: World) {
  return createStatusDelivery<Actor, SkillInstance, SkillDef, Vec2, number, Modifier, SkillTag, ActiveStatus>({
    actors: () => w.actors, enemies: caster => w.enemiesOf(caster),
    distance: dist, copyPosition: at => vec(at.x, at.y), direction: angleTo,
    definition: id => STATUS_DEFS[id],
    transplant: (target, status, name, options) => w['transplantStatus'](target, status, name, options),
    mitigateTyped, kill: (target, silent, caster) => w.kill(target, silent, caster),
    spearDefinition: () => SKILLS.impale_spear,
    hasTreeRecall: inst => !!instanceTreeOver(inst)?.recallImpales,
    effectiveLevel: effectiveSkillLevel, makeInstance: makeSkillInstance,
    spawnProjectile: (caster, inst, origin, direction, options) => w['spawnProjectile'](caster, inst, origin, direction, options),
    text: (at, text, color, size, height) => w.text(height === undefined ? at : vec(at.x, at.y - height), text, color, size),
    flash: (at, radius, color, life) => w.flashes.push({pos: vec(at.x, at.y), radius, color, life, maxLife: life}),
    failNote: (caster, key, text) => w['failNote'](caster, key, text),
  });
}
