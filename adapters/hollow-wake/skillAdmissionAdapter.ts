import {SkillAdmission} from '@hollow-wake/engine/casting/admission';
import {requiresUseCharge} from '@hollow-wake/engine/resources/ammunition';
import {chargeCostReady} from '@hollow-wake/engine/resources/charges';
import type {Actor} from './actor';
import {STATUS_DEFS} from './status';
import {replenishingDelivery} from './replenishment';
import {summonContractSlots} from './summonContracts';
import {summonReservationUnit} from './companionGrants';
import {gaugeReady, gaugeNote} from './gauge';
import {instanceCastMode, instanceChargeCost, instanceDelivery, instanceGates,
  instanceMods, instanceUseCharges, skillContextTags, socketSpec, REFLEX_CFG,
  type GateSpec, type SkillInstance} from './skills';

// Fixed read ports; actor state and authored records remain borrowed and live.
export const skillAdmission = new SkillAdmission<Actor, SkillInstance, GateSpec, ReturnType<typeof instanceDelivery>>({
  replenishing: inst => !!replenishingDelivery(inst),
  stunned: actor => actor.isStunned(),
  statusForbids: id => STATUS_DEFS[id]?.forbidsTags,
  contextTags: skillContextTags,
  castMode: instanceCastMode,
  useTime: (actor, inst) => actor.skillUseTime(inst),
  reflexStat: (actor, inst) => actor.sheet.get('reflex', skillContextTags(inst.def), instanceMods(inst)),
  reflexDuring: () => REFLEX_CFG.during,
  guardCast: inst => !!socketSpec(inst, 'guardCast'),
  gather: inst => socketSpec(inst, 'gather'),
  requiresUseCharge: inst => requiresUseCharge(instanceUseCharges(inst)),
  useChargeBank: (actor, inst) => actor.skillChargeBank(inst),
  cost: (actor, inst) => actor.skillCost(inst),
  canAfford: (actor, cost) => actor.canAfford(cost),
  gates: instanceGates,
  gaugeRefusal: (actor, inst) => {
    const effective = actor.gaugeEff(inst)!;
    return gaugeReady(inst, effective, inst.def.gauge!) ? null : gaugeNote(inst, inst.def.gauge!, effective);
  },
  thirstless: (actor, inst) => actor.sheet.get('thirstless', skillContextTags(inst), instanceMods(inst)),
  primeCapacity: (actor, inst) => actor.sheet.get('pourPrime', skillContextTags(inst), instanceMods(inst)),
  chargeCost: instanceChargeCost,
  chargeCostReady,
  delivery: instanceDelivery,
  summonSlots: (actor, inst, delivery) => {
    if (delivery.type !== 'summon') throw new Error('Admission requested slots for a non-summon');
    return summonContractSlots(actor, inst, delivery);
  },
  summonReservation: (actor, inst, delivery) => {
    if (delivery.type !== 'summon') throw new Error('Admission requested a reservation for a non-summon');
    return summonReservationUnit(actor, inst, delivery);
  },
  maxLife: actor => actor.maxLife(),
  maxMana: actor => actor.maxMana(),
  availableMana: actor => actor.availableMaxMana(),
  maxShield: actor => actor.maxEs(),
});
