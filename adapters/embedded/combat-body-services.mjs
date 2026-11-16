import {BodyFactory} from '@hollow-wake/engine/bodies/factory';
import {BodyLevels, bodySkillLevel} from '@hollow-wake/engine/bodies/levels';
import {SummonBirth} from '@hollow-wake/engine/summons/birth';
import {SummonOffspring} from '@hollow-wake/engine/summons/offspring';
import {MinionInheritanceResolver, applyMinionPlyBonus} from '@hollow-wake/engine/minions/inheritance';
import {AttributeBequests} from '@hollow-wake/engine/minions/bequests';
import {itemOperations} from '../../dist/item-core.js';
import {SummonContracts} from '../../dist/summon-contracts.js';

/** Body and summon ownership stays inside the combat session. Registry data is
 * shared read-only; IDs, item caches, reservations and pending births are local.
 * No account, persistence or campaign service is required for inheritance. */
export function installCombatBodies(w, content, shared) {
  const q = {...content.queries, ...content.hitQueries}, p = shared.ports;
  const levels = new BodyLevels(p.levels);
  w.stampMonsterLevel = (actor, definition, level) => levels.stamp(actor, definition, level);
  w.relevelActor = (actor, level) => levels.relevel(actor, level);
  w.partyScaleCount = () => {
    const ease = Math.min(1, Math.max(0, w.localSeat?.actor.sheet.get('mercEase') ?? 0));
    const weight = content.staticRules.mercenaryPartyWeight * (1 - ease);
    return Math.max(1, w.seats.reduce((count, seat) => count + (seat.actor.dead ? 0 : seat.merc ? weight : 1), 0));
  };
  w.relicPower = actor => w.seatOf(actor)?.meta.relicEmpowerment ?? 0;
  w.minionInheritance = new MinionInheritanceResolver(p.inheritance);
  w.minionAreaAvoidanceOf = (...args) => w.minionInheritance.areaAvoidanceOf(...args);
  w.applyMinionPlyBonus = applyMinionPlyBonus;
  // Registration was compiled into the immutable content. Runtime cannot add
  // unknown statistics by mutating shared registries.
  w.bequests = new AttributeBequests({...p.bequests, registerStat() {throw Error('Combat bequests are compiled content');}},
    {definitions: q.ATTRIBUTE_BEQUESTS, ids: q.ATTRIBUTE_BEQUEST_IDS});
  const items = itemOperations(content.items, () => {
    if (!Number.isSafeInteger(w.nextItemId) || w.nextItemId < 1 || w.nextItemId >= Number.MAX_SAFE_INTEGER) throw Error('Combat item identity space exhausted');
    return w.nextItemId++;
  });
  const bodies = new BodyFactory({...p.bodies,
    allocate: (name, team, pos) => w.allocateActor(name, team, pos),
    appearance: id => w.host.presentation?.appearance?.(id),
    rollItem: options => items.rollItem({...options, rng: () => w.random()}),
    skillLevel: bodySkillLevel, xpScale: content.staticRules.xpScale,
  });
  w.createMonster = (...args) => bodies.create(...args);
  const contracts = new SummonContracts(w.summonQueues, {
    delivery: inst => {const d = q.instanceDelivery(inst); return d.type === 'summon' ? d : undefined;},
    native: inst => inst.def.delivery.type === 'summon' ? inst.def.delivery : undefined,
    tags: (inst, native) => q.skillContextTags(native ? inst.def : inst), modifiers: q.instanceMods,
    actors: () => w.actors, homes: () => w.seats.filter(seat => seat.home !== seat.actor).map(seat => seat.home).filter(Boolean),
    minions: actor => w.actors.filter(body => !body.dead && body.owner === actor),
    minionsOfSkill: (actor, id) => w.minionsOfSkill(actor, id),
    clearReleaseFields: (actor, inst) => w.clearSummonReleaseFields(actor, inst),
    kill: (actor, silent) => w.kill(actor, silent), spawn: (...args) => w.spawnMinion(...args),
    recovered: (body, inst) => w.showRecoveryCue(body, 'arrive', inst),
    pay: (...args) => w.paySkillCost(...args), dry: (actor, id) => w.failNote(actor, id + ':dry', 'the rift sputters out'),
    random: () => w.random(), clamp: (at, radius) => w.clampPos(at, radius),
  });
  w.summonContracts = contracts;
  w.releaseContract = (body, schedule) => contracts.release(body, schedule);
  w.dismissSummon = (actor, id) => contracts.dismiss(actor, id);
  w.dismissSummonToggle = w.dismissSummon;
  w.dismissExclusiveSummons = (...args) => contracts.dismissExclusive(...args);
  const births = new SummonBirth({...p.summons,
    reservation: (...args) => contracts.reservation(...args),
    accrueSummon: actor => w.observers.summoned?.(actor),
  });
  const offspring = new SummonOffspring(p.offspring);
  w.spawnMinion = (...args) => births.spawn(...args);
  w.spawnSummonOffspring = (...args) => offspring.spawn(...args);
  return Object.freeze({bodies, levels, births, offspring, contracts, items});
}
