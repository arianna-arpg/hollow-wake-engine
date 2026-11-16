import {ActorVitals} from '@hollow-wake/engine/combat/actor-vitals';
import {ActorTimers} from '@hollow-wake/engine/combat/actor-timers';
import {ActorConditions} from '@hollow-wake/engine/stats/conditions';
import {BuffRuntime} from '@hollow-wake/engine/combat/buffs';
import {createStatusLifecycle} from '@hollow-wake/engine/statuses';
import {ChargeRuntime, chargeCostReady} from '@hollow-wake/engine/resources/charges';
import {Ammunition, requiresUseCharge} from '@hollow-wake/engine/resources/ammunition';
import {advanceConduits} from '@hollow-wake/engine/resources/conduits';
import {ResourcePayment} from '@hollow-wake/engine/resources/payment';
import {SkillAdmission} from '@hollow-wake/engine/casting/admission';
import {SkillPricing} from '@hollow-wake/engine/character/skill-pricing';
import {gaugeEffOf, gaugeReady, gaugeNote} from '@hollow-wake/engine/resources/gauges';
import {createCombatActorType} from './combat-actor.mjs';

/** Internal construction of actor services. `damage` and `summons` are the
 * simulation's shared SDK controllers. Notifications are presentation/taps;
 * neither campaign nor persistence participates in construction or payment. */
export function createCombatActors({initialize, queries: q, definitions, rules, random, damage, summons, notify}) {
  // Compiled catalogues are frozen. Retain their ordered enumeration once per
  // owner, rather than allocate every charge row for every actor clock tick.
  // Custom mutable catalogues keep their original live enumeration semantics.
  const chargeDefinitions=Object.isFrozen(q)&&Object.isFrozen(q.chargeDefinitions)
    ? Object.entries(q.chargeDefinitions) : null;
  for (const method of ['healed', 'lifeSpent', 'buffRelease', 'statusPop', 'restore', 'timers']) {
    if (typeof notify?.[method] !== 'function') throw Error('Missing actor notification: ' + method);
  }
  if (typeof damage?.tickAbsorbLayers !== 'function' || typeof summons?.slots !== 'function' || typeof summons?.reservation !== 'function') {
    throw Error('Actor assembly requires shared damage and summon services');
  }
  const statusDefinition = id => definitions.statuses[id];
  const vitals = new ActorVitals(rules.vitals, {tags: q.skillContextTags, modifiers: q.instanceMods,
    statusExists: id => !!statusDefinition(id), healed: notify.healed});
  const conditions = new ActorConditions({maxLife: a => a.maxLife(), maxMana: a => a.availableMaxMana(),
    maxEs: a => a.maxEs(), lowLifeFraction: a => a.lowLifeLine(), strideReach: a => a.sheet.get('strideReach')}, rules.conditions);
  const statuses = createStatusLifecycle({definition: statusDefinition, random,
    skillContextTags: q.skillContextTags, relayIds: rules.relayIds, popCue: notify.statusPop});
  const buffs = new BuffRuntime({publish: (a, id, mods) => {a.sheet.setSource(id, mods);},
    removeSource: (a, id) => {a.sheet.removeSource(id);}, release: notify.buffRelease,
    consume: (a, id, count) => {a.consumeBuffStacks(id, count);}});
  const pricing = new SkillPricing({tags: q.skillContextTags, mods: q.instanceMods,
    guarded: i => !!q.socketSpec(i, 'guardCast'), replenishing: i => !!q.replenishingDelivery(i), cooldown: q.skillCooldownSeconds});
  const payment = new ResourcePayment({maxMana: a => a.maxMana(), maxLife: a => a.maxLife(), esToMana: a => a.sheet.get('esToMana'),
    spec: loan => loan.inst.def.delivery.type === 'aura' ? loan.inst.def.delivery.overdrive : undefined,
    context: loan => loan.inst, stat: (a, i, stat, base) => a.sheet.get(stat, q.skillContextTags(i), q.instanceMods(i), base),
    attackSpeed: a => a.sheet.get('attackSpeed'), lifeSpent: notify.lifeSpent});
  const gaugeTerms = (a, i) => i.def.gauge ? gaugeEffOf(i.def.gauge,
    a.sheet.get('gaugeNeed', q.skillContextTags(i), q.instanceMods(i)),
    a.sheet.get('gaugeGain', q.skillContextTags(i), q.instanceMods(i)),
    a.sheet.get('gaugeLockout', q.skillContextTags(i), q.instanceMods(i)), rules.gauge) : null;
  const admission = new SkillAdmission({replenishing: i => !!q.replenishingDelivery(i), stunned: a => a.isStunned(),
    statusForbids: id => statusDefinition(id)?.forbidsTags, contextTags: q.skillContextTags, castMode: q.instanceCastMode,
    useTime: (a, i) => a.skillUseTime(i), reflexStat: (a, i) => a.sheet.get('reflex', q.skillContextTags(i.def), q.instanceMods(i)),
    reflexDuring: () => rules.reflexDuring, guardCast: i => !!q.socketSpec(i, 'guardCast'), gather: i => q.socketSpec(i, 'gather'),
    requiresUseCharge: i => requiresUseCharge(q.instanceUseCharges(i)), useChargeBank: (a, i) => a.skillChargeBank(i),
    cost: (a, i) => a.skillCost(i), canAfford: (a, cost) => a.canAfford(cost), gates: q.instanceGates,
    gaugeRefusal: (a, i) => {const terms = a.gaugeEff(i); return gaugeReady(i, terms, i.def.gauge) ? null : gaugeNote(i, i.def.gauge, terms, rules.gauge);},
    thirstless: (a, i) => a.sheet.get('thirstless', q.skillContextTags(i), q.instanceMods(i)),
    primeCapacity: (a, i) => a.sheet.get('pourPrime', q.skillContextTags(i), q.instanceMods(i)),
    chargeCost: q.instanceChargeCost, chargeCostReady, delivery: q.instanceDelivery,
    summonSlots: (a, i, delivery) => {if (delivery.type !== 'summon') throw Error('Non-summon slot request'); return summons.slots(a, i, delivery);},
    summonReservation: (a, i, delivery) => {if (delivery.type !== 'summon') throw Error('Non-summon reservation request'); return summons.reservation(a, i, delivery);},
    maxLife: a => a.maxLife(), maxMana: a => a.maxMana(), availableMana: a => a.availableMaxMana(), maxShield: a => a.maxEs()});
  const core = {vitals, conditions, statuses, buffs, pricing, payment, admission, gaugeTerms, statusDefinition,
    attributeModifiers: q.attributeModifiers, sockets: q.hostSockets};
  const bind = a => {
    const charges = new ChargeRuntime({charges: a.charges, clocks: a.chargeState, modifierCounts: a.chargeModCount}, {
      definition: id => q.chargeDefinitions[id], definitions: () => chargeDefinitions??Object.entries(q.chargeDefinitions),
      capacityBonus: i => a.sheet.get('chargeCap', i ? q.skillContextTags(i) : undefined, i ? q.instanceMods(i) : undefined),
      chargeCapacityBonus: id => a.sheet.get('chargeCap_' + id), regenerationBonus: id => a.sheet.get('chargeRegen_' + id),
      skills: () => a.skills, taps: q.instanceChargeGain, socketTaps: q.hostSockets, spentCharge: i => q.instanceChargeCost(i)?.charge,
      toggled: i => a.activeAuras.has(i.def.id) || a.summonToggles.has(i.def.id),
      channelSkillId: () => a.isChanneling() ? a.casting.inst.def.id : undefined, gaugeTerms: i => a.gaugeEff(i),
      walked: () => a.moveAcc, clearWalked: () => {a.moveAcc = 0;}, gainEventCount: () => a.gainEvents.length,
      emitGainEvent: (id, n, inst, depth) => a.gainEvents.push({kind: 'charge', id, depth, n, tags: inst?.def.tags}),
      setSource: (id, mods) => a.sheet.setSource(id, mods), removeSource: id => a.sheet.removeSource(id),
    });
    const ammunition = new Ammunition(a.skillChargeState, {spec: q.instanceUseCharges, skills: () => a.skills,
      capacityBonus: i => a.sheet.get('skillCharges', q.skillContextTags(i), q.instanceMods(i)),
      chargeRate: i => a.sheet.get('skillChargeRate', q.skillContextTags(i.def), q.instanceMods(i)),
      cooldownRecovery: i => a.sheet.get('cooldownRecovery', q.skillContextTags(i.def), q.instanceMods(i)),
      still: () => a.skillBankStill(), cooling: i => a.cooldowns.has(i.def.id)});
    const timers = new ActorTimers(a, {conditions, charges, ammunition, buffs, statuses,
      conduits: dt => advanceConduits(a, dt, {specs: q.instanceConduits, tags: q.skillContextTags, modifiers: q.instanceMods}),
      damage, restoration: {gain: notify.restore}, cues: notify.timers,
      tags: q.skillContextTags, modifiers: q.instanceMods, definitionTags: i => q.skillContextTags(i.def),
      selfStack: q.instanceSelfStack, sockets: q.hostSockets, socketIdentity: s => ({id: s.def.id, level: s.level}), globalMods: q.supportGlobalMods}, rules);
    return {charges, ammunition, timers};
  };
  const Actor = createCombatActorType(initialize, core, bind, rules);
  return Object.freeze({Actor, ...core});
}
