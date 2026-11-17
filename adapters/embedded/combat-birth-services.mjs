import {CombatBirth} from '../../dist/combat-birth.js';
import {BirthPool} from '../../dist/birth-pool.js';
import {DeathBursts} from '../../dist/death-bursts.js';
import {Displacements} from '../../dist/displacements.js';
import {CompanionClaims} from '../../dist/companion-claims.js';

/** Births, allegiance changes and detached death payloads use the same actors,
 * damage services and random stream. Optional observers see completed events. */
export function installCombatBirths(w, content) {
  const q = {...content.queries, ...content.hitQueries};
  const flash = (pos, radius, color, life, extra) => {w.flashes.push({pos: {...pos}, radius, color, life, maxLife: life, ...extra});};
  w.emergeGroundAt = (at, layer) => w.host.space.emergenceGround(at, layer);
  const pool = new BirthPool(q.PRESENCE_BANDS, id => q.MONSTERS[id]?.presence, () => w.random());
  const births = new CombatBirth({...q.CLUTCH_CFG, frenzy: q.ORPHAN_FRENZY}, {
    actors: () => w.actors, time: () => w.time, random: () => w.random(), monsterExists: id => !!q.MONSTERS[id], pool,
    spawnMinion: (...args) => w.spawnMinion(...args), createMonster: (...args) => w.createMonster(...args),
    lifeline: actor => w.conjurationLifeline(actor), freeSpot: (...args) => w.host.space.freeSpot(...args),
    emerge: (...args) => w.emergeBody(...args), flash, kill: (...args) => w.kill(...args),
    corpseSpawn: inst => q.socketSpec(inst, 'corpseSpawn'), clamp: (...args) => w.clampPos(...args),
    skillExists: id => !!q.SKILLS[id], makeSkill: (id, level) => q.makeSkillInstance(q.SKILLS[id], level),
    effectiveLevel: q.effectiveSkillLevel, execute: (...args) => w.executeSkill(...args),
    ...(content.prototypeMechanics?{hatchLayer:pod=>pod.tier}:{}),
    hatched: pod => w.text(pod.pos, 'hatched!', pod.color, 12),
  });
  w.birthAt = (...args) => births.birth(...args);
  w.clutchOnDeath = actor => births.onDeath(actor);
  w.corpseSpawn = (...args) => births.corpse(...args);
  w.hatchPod = actor => births.hatch(actor);
  const bursts = new DeathBursts(w.deathBursts, {baseMoveSpeed: content.stats.moveSpeed.base, colors: q.DAMAGE_COLOR}, {
    actors: () => w.actors, seats: () => w.seats.map(seat => seat.actor), hostile: (...args) => w.hostileTo(...args),
    clamp: (...args) => w.clampPos(...args), convert: (...args) => w.damage.applyConversion(...args),
    hit: (...args) => w.damage.applyHit(...args), mitigate: (...args) => w.damage.mitigateTyped(...args), kill: (...args) => w.kill(...args),
    text: (...args) => w.text(...args), flash, outcome: (...args) => w.showCombatOutcome(...args),
    indirectDamage: (...args) => w.observers.indirectDamage?.(...args),
    surfaces: (at, radius, amounts, ...tier) => w.host.space.burstSurfaces?.(at, radius, amounts, ...tier),
    ...(w.prototypeProfile?{preserveLayers:true,damageText:(...args)=>w.damageText(...args)}:{}),
  });
  w.burstDamage = (...args) => bursts.damage(...args);
  w.explodeMinion = (...args) => bursts.explode(...args);
  w.explodeActor = w.explodeMinion;
  w.spawnDeathBurst = (...args) => bursts.spawn(...args);
  const displacement = new Displacements({movementVoice: q.skillMovementVoice, selfVoice: q.skillSelfVoice,
    flash: cue => {w.flashes.push(cue);}, clamp: (at, radius, options) => w.clampPos(at, radius, undefined, options)});
  w.teleportActor = (...args) => displacement.teleport(...args);
  const claims = new CompanionClaims(q.TAME_CFG.claimParts, {
    actors: () => w.actors, monster: id => q.MONSTERS[id], adjustments: q.instanceTameMod, bond: q.companionBondOf,
    random: () => w.random(), sameLayer: q.sameStory, cue: (...args) => w.showCompanionCue(...args),
    defeated: (target, caster) => w.observers.claimed?.(target, caster), clearEncounter: q.clearEncounterGroup,
    adopt: actor => w.companionBonds.adopt(actor),
    ...(w.prototypeProfile?{clearEnemyRules:actor=>{
      actor.sheet.removeSource('threat');actor.sheet.removeSource('manaPool');actor.aiIntent=undefined;actor.aiStance=undefined;
    }}:{}),
  });
  w.tame = (...args) => claims.attempt(...args);
  w.tryTame = w.tame;
  w.tameCompanion = (...args) => claims.claim(...args);
  return Object.freeze({pool, births, bursts, displacement, claims});
}
