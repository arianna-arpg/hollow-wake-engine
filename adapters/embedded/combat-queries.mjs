// Compiled from the pinned source into the authored combat package. Only named
// rule reads are exported; registration functions stay private to this bundle.
import {
  instanceMods,instanceInnateMods,skillContextTags,grantedTags,hostSockets,effectiveSkillLevel,makeSkillInstance,grimoireForm,supportGlobalMods,skillMaxLevel,
  instanceDelivery,instanceEffects,instanceBirth,instanceSummon,instanceTurret,instancePulsePlan,instanceCascadePlan,instanceSizeOver,instanceVariance,
  instanceAim,instanceTargeting,instanceCurseField,instanceTethers,instanceChargeCost,instanceChargeGain,instanceSelfStack,instanceCastCycle,instanceUseCharges,
  instanceEchoes,instanceFollowUps,instanceTrail,instanceFissureTrail,instanceChannel,instanceCastMode,instanceStrikeTiming,instanceOvercharge,instanceConduits,
  instanceTameMod,instanceBrood,instanceThrongSources,instanceSequel,instanceContagion,instanceGates,instanceConvert,instanceFuse,instanceTrigger,instanceTriggerArmed,
  instanceTriggerLimit,instanceTriggerPermit,instanceMeta,instanceMetas,socketSpec,treeNodeOf,treeNodeRefusal,guardBashSpec,guardBashReady,skillCooldownSeconds,REFLEX_CFG,
} from 'hollow-wake-source/skills';
import {instanceInvocation,runeForCast,makeInvocationPayload} from 'hollow-wake-source/invocation';
import {resolveInvocation,RUNE_INFO} from 'hollow-wake-source/invocations';
import {replenishingDelivery} from 'hollow-wake-source/replenishment';
import 'hollow-wake-source/minion-families';
import {CHARGE_DEFS} from 'hollow-wake-source/charges';
import {DEFENSE_CFG} from 'hollow-wake-source/defense';
import {GAUGE_CFG} from 'hollow-wake-source/gauge';
import {RECENT_KINDS,RECENT_NEVER,recentWindow} from 'hollow-wake-source/recency';
import {attributeModifiers} from 'hollow-wake-source/stats';
import {STATUS_RELAY_IDS} from 'hollow-wake-source/reception';

export const combatActorRules=Object.freeze({
  vitals:Object.freeze({insightGrace:DEFENSE_CFG.insight.graceWindow,weightMin:DEFENSE_CFG.weight.min,
    weightPerPoise:DEFENSE_CFG.weight.perPoise,poiseBrackets:Object.freeze([...DEFENSE_CFG.poise.brackets]),poiseBreakStatus:DEFENSE_CFG.poise.breakStatus}),
  gauge:Object.freeze({...GAUGE_CFG}),reflexDuring:Object.freeze({...REFLEX_CFG.during}),
  recentKinds:Object.freeze([...RECENT_KINDS]),recentWindows:Object.freeze(RECENT_KINDS.map(recentWindow)),
  recentNever:RECENT_NEVER,poiseOverDecay:DEFENSE_CFG.poise.overDecay,relayIds:Object.freeze([...STATUS_RELAY_IDS]),
});

export const combatSkillQueries=Object.freeze({
  chargeDefinitions:CHARGE_DEFS,skillCooldownSeconds,attributeModifiers,
  instanceMods,instanceInnateMods,skillContextTags,grantedTags,hostSockets,effectiveSkillLevel,makeSkillInstance,grimoireForm,supportGlobalMods,skillMaxLevel,
  instanceDelivery,instanceEffects,instanceBirth,instanceSummon,instanceTurret,instancePulsePlan,instanceCascadePlan,instanceSizeOver,instanceVariance,
  instanceAim,instanceTargeting,instanceCurseField,instanceTethers,instanceChargeCost,instanceChargeGain,instanceSelfStack,instanceCastCycle,instanceUseCharges,
  instanceEchoes,instanceFollowUps,instanceTrail,instanceFissureTrail,instanceChannel,instanceCastMode,instanceStrikeTiming,instanceOvercharge,instanceConduits,
  instanceTameMod,instanceBrood,instanceThrongSources,instanceSequel,instanceContagion,instanceGates,instanceConvert,instanceFuse,instanceTrigger,instanceTriggerArmed,
  instanceTriggerLimit,instanceTriggerPermit,instanceMeta,instanceMetas,socketSpec,treeNodeOf,treeNodeRefusal,guardBashSpec,guardBashReady,
  instanceInvocation,runeForCast,makeInvocationPayload,resolveInvocation,replenishingDelivery,runeColor:id=>Object.hasOwn(RUNE_INFO,id)?RUNE_INFO[id].color:undefined,
});
