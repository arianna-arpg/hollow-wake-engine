import {createProcCasting, heldProcSkill, type ProcHeldSkillPorts} from '@hollow-wake/engine/combat/proc-casting';
import type {Actor} from './actor';
import type {World, Seat} from './world';
import {effectiveSkillLevel, makeSkillInstance, type SkillDef, type SkillInstance} from './skills';
import {SKILLS} from '../data/skills';
import {angleTo, rand, randInt, vec, type Vec2} from '../core/math';

export function bindProcCasting(w: World) {
  const heldPorts: ProcHeldSkillPorts<Actor, SkillInstance, Seat> = {
    instances: actor => actor.skills,
    seat: actor => w.seatOf(actor),
    granted: (seat, id) => seat.grantedInsts?.get(id),
    learned: (seat, id) => seat.meta.knownSkills.get(id),
  };
  const casting = createProcCasting<SkillInstance, SkillDef, Vec2, number, Actor>({
    definition: id => SKILLS[id],
    heldInstance: (actor, id) => w['heldSkillInst'](actor, id),
    effectiveLevel: effectiveSkillLevel,
    makeInstance: (skill, level, depth) => ({...makeSkillInstance(skill, level), procChainDepth: depth}),
    copyPosition: at => vec(at.x, at.y), direction: angleTo,
    facing: actor => actor.facing, rotate: (bearing, radians) => bearing + radians,
    ringDirection: radians => radians, random: rand, randomInt: randInt,
    spawnProjectile: (actor, inst, from, direction, options) => w['spawnProjectile'](actor, inst, from, direction, options),
    lockLastProjectile: anchor => {w.projectiles[w.projectiles.length - 1].hits.set(anchor.id, Infinity);},
    executeSkill: (actor, inst, origin, options) => w['executeSkill'](actor, inst, origin, options),
  });
  return {...casting, held: (actor: Actor, id: string) => heldProcSkill(actor, id, heldPorts)};
}
