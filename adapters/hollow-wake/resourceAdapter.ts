import {ChargeRuntime,chargePayment,type ChargeState,type ChargePayment} from '@hollow-wake/engine/resources/charges';
import {CHARGE_DEFS} from './charges';
import {hostSockets,instanceChargeGain,instanceChargeCost,instanceMods,skillContextTags,type SkillInstance} from './skills';
import type {Modifier} from './stats';
import type {Actor} from './actor';

/** One binding per actor, retaining original maps and live content observations. */
export function createResourceRuntime(actor:Actor,state:ChargeState):ChargeRuntime<SkillInstance,Modifier>{
 return new ChargeRuntime<SkillInstance,Modifier>(state,{
  definition:id=>CHARGE_DEFS[id],definitions:()=>Object.entries(CHARGE_DEFS),
  capacityBonus:inst=>actor.sheet.get('chargeCap',inst?skillContextTags(inst):undefined,inst?instanceMods(inst):undefined),
  chargeCapacityBonus:id=>actor.sheet.get('chargeCap_'+id),regenerationBonus:id=>actor.sheet.get('chargeRegen_'+id),
  skills:()=>actor.skills,taps:instanceChargeGain,socketTaps:hostSockets,spentCharge:inst=>instanceChargeCost(inst)?.charge,
  toggled:inst=>actor.activeAuras.has(inst.def.id)||actor.summonToggles.has(inst.def.id),
  channelSkillId:()=>actor.isChanneling()?actor.casting?.inst.def.id:undefined,
  gaugeTerms:inst=>actor.gaugeEff(inst)!,walked:()=>actor.moveAcc,clearWalked:()=>{actor.moveAcc=0;},
  gainEventCount:()=>actor.gainEvents.length,
  emitGainEvent:(id,n,inst,depth)=>{actor.gainEvents.push({kind:'charge',id,depth,n,tags:inst?.def.tags});},
  setSource:(id,mods)=>actor.sheet.setSource(id,mods),removeSource:id=>actor.sheet.removeSource(id),
 });
}

/** The SDK quotes the payment; the actor's canonical spend path syncs sources. */
export function consumeResourceCost(actor:Actor,inst:SkillInstance):ChargePayment{
 const cost=instanceChargeCost(inst);if(!cost)return chargePayment(0,undefined);
 const receipt=chargePayment(actor.charges.get(cost.charge)??0,cost);
 actor.spendCharge(cost.charge,receipt.consumed);return receipt;
}
