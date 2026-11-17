import {CastPreparation} from '../../dist/cast-preparation.js';
import {CastAftermath} from '../../dist/cast-aftermath.js';
import {AreaDeliveries} from '../../dist/area-deliveries.js';
import {DirectDeliveries} from '../../dist/direct-deliveries.js';
import {FieldDeliveries} from '../../dist/field-deliveries.js';
import {FieldAftermath} from '../../dist/field-aftermath.js';
import {DeliveryExecution} from '../../dist/delivery-execution.js';
import {CombatExecution} from '../../dist/combat-execution.js';
import {MaddenBanks} from '../../dist/combat-fields.js';
import {combatPortContracts} from './combat-port-contracts.mjs';

/** Setup of the common execution spine. link.finish() must succeed after all
 * lifetime/delivery controllers are installed and before any public command.
 * These aliases connect SDK services, never user-supplied combat algorithms. */
export function installCombatExecution(w, content, link, recovery, deliveries, caster) {
  const q = {...content.queries, ...content.hitQueries}, r = content.staticRules;
  const madden = new MaddenBanks(inst => q.socketSpec(inst, 'madden')?.after);
  w.maddenBankOf = inst => madden.of(inst);
  const common = {time: () => w.time, random: () => w.random(), actors: () => w.actors,
    enemies: 'enemiesOf', projectiles: () => w.projectiles, seats: () => w.seats,
    hasSkill: id => !!q.SKILLS[id], makeSkill: (id, level) => q.makeSkillInstance(q.SKILLS[id], level),
    flash: cue => {w.flashes.push(cue);}, cosmetic: (actor, id) => w.host.presentation?.cosmetic?.(actor.id, id) ?? {},
  };
  const ports = (contract, overrides = {}) => link.ports(contract, {
    ...Object.fromEntries(Object.entries(common).filter(([name]) => combatPortContracts[contract].includes(name))), ...overrides,
  });
  const preparation = new CastPreparation(w, {empower: q.DEFENSE_CFG.empower.weights,
    corpseAreaPerExtra: r.corpses.batch.aoePerExtra, cosmetic: r.cosmetics.cast}, ports('preparation', {
    prepareChallenge: (actor, inst, primary) => w.challenges.prepare(actor, inst, primary),
    prepareSequence: (actor, inst, primary) => w.prototypeMechanics?.castSequenceInstance(actor, inst, primary) ?? inst,
    prepareArts: (actor, inst, options) => {
      if (!w.prototypeMechanics) return inst;
      const primary = !options.noRepeat && !options.noCooldown && !options.fromFuse;
      inst = w.projectileArts.prepare(actor, inst, primary);
      inst = w.cohortArts.prepare(actor, inst, primary);
      inst = w.summonArts.prepare(actor, inst, primary);
      return w.frameArts.prepare(actor, inst, !options.noRepeat && !options.fromFuse);
    },
    prepareAttack: (actor, inst, aim, power) => w.attackSequences.prepare(actor, inst, aim, power),
    guardCast: (actor, inst) => w.guardArts.cast(actor, inst), denseCount: () => w.lite.liveCount,
    bossMonster: id => !!q.MONSTERS[id]?.boss,
    castObserved: (actor, inst, repeat) => w.observers.cast?.(actor, inst, repeat),
    invocationPayload: (host, id, last) => q.makeInvocationPayload(host, q.SKILLS[id], last),
  }));
  const aftermath = new CastAftermath(w, {unleashInterval: r.unleash.interval, elements: r.elements}, ports('aftermath', {
    associateTreeBuff: (fx, source) => recovery.buffs.associate(fx, source.caster, source.inst),
    challengeCompleted: (actor, inst) => w.challenges.completed(actor, inst),
    companionCast: (actor, inst, aim) => {
      w.cohortArts?.completed(actor, inst, aim);
      w.summonArts?.completed(actor, inst, aim);
      w.frameArts?.completed(actor, inst, aim);
      w.companionBonds.onCast(actor, inst, aim);
      w.battleDoctrines?.cast(actor, inst, aim);
    },
    mimicRefreshWatch: (actor, time) => w.mimic.refresh(actor, time),
    mimicCapture: (actor, source, def) => w.mimic.capture(actor, source, def, w.time),
  }));
  const fieldAftermath = new FieldAftermath(w, ports('fieldAftermath'));
  for (const name of ['mintAftermath', 'dropLingerField', 'layFissure', 'moveBlast', 'mintTrailPatch', 'statTrailSpec', 'clampGroundTarget']) {
    if (typeof fieldAftermath[name] !== 'function') throw Error('Missing shared field method: ' + name);
    w[name] = (...args) => fieldAftermath[name](...args);
  }
  const fields = new FieldDeliveries(w, {conjure: r.conjure, forwarding: r.forwarding}, ports('fields'));
  const area = new AreaDeliveries(ports('area', {zone: zone => {w.zones.push(zone);}, assaultLocked: (actor, inst) => w.assaults.locked(actor, inst)}));
  const direct = new DirectDeliveries(ports('direct', {
    absorbAmount: w.damage.skillAbsorbAmount, absorb: w.grantAbsorb, restore: w.applyRestore,
    critical: w.critMendMult, stream: w.startRestoreStream, heal: w.applyHealChained, cleanse: w.cleanseActor,
    effects: q.instanceEffects, rite: inst => !!q.skillRiteVoice(inst.def.id),
    statusDuration: id => q.STATUS_DEFS[id]?.duration, trailSpec: n => fieldAftermath.statTrailSpec(n),
    arrive: 'showSkillArrival', selfRelease: 'showSelfRelease', hit: 'resolveHit', noteBody: 'noteBodyHit',
    requiredStatuses: inst => w.statusReqs(q.instanceTargeting(inst)?.requiresStatus),
  }));
  const delivery = new DeliveryExecution({...deliveries, fields, area, direct}, q.instanceTargeting);
  const activeDeliveries=content.prototypeMechanics?{execute:frame=>w.prototypeMechanics.deliverPrototype(frame)}:delivery;
  const activePreparation=content.prototypeMechanics?{prepare:(...args)=>w.prototypeMechanics.preparePrototype(...args)}:preparation;
  const activeAftermath=content.prototypeMechanics?{complete:frame=>w.prototypeMechanics.completePrototype(frame)}:aftermath;
  const execution = new CombatExecution(r.corpses.batch.durationPerExtra, {preparation:activePreparation, deliveries: activeDeliveries,
    caster, aftermath:activeAftermath, effects: q.instanceEffects, linger: (...args) => w.dropLingerField(...args)});
  return Object.freeze({preparation, aftermath, fieldAftermath, fields, area, direct, delivery, execution});
}
