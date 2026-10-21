import {SupportRules} from '@hollow-wake/engine/skills/supports';
import {instanceBaseTags,instanceDelivery,instanceCastMode,instanceTreeMods,instanceSelfStack,instanceSummon,makeSkillInstance,mechanismHolds,
  MINION_SEAT_BOUND_SUPPORT_FIELDS,GLOBAL_SUPPORT_STATS,HOST_COST_STATS,STRIKE_GRANTING_GRAFTS,SURFACE_GRANTING_STATS,CHILD_GRANTING_FLIGHT_STATS,DEFAULT_LEVELING,CREW_CFG,
  type SkillDef,type SkillInstance,type SupportInstance} from './skills';
import {attackSequenceOf,attackSequenceStatuses,attackSequenceSweepInstances} from './attackSequenceSpec';
import {STATUS_DEFS,tuneAilmentChance} from './status';
import type {Modifier} from './stats';

type Rules=SupportRules<Modifier,SkillDef,SupportInstance,SkillInstance>;
let rules:Rules|undefined;
/** Lazy binding avoids the native skills module's registration cycle. The SDK
 * keeps no derived state here: every call observes current host content/state. */
export function supportRules():Rules{
 if(rules)return rules;
 const policy={seatBoundFields:MINION_SEAT_BOUND_SUPPORT_FIELDS,globalStats:GLOBAL_SUPPORT_STATS,costStats:HOST_COST_STATS,
    strikeFields:STRIKE_GRANTING_GRAFTS,surfaceStats:SURFACE_GRANTING_STATS,childFlightStats:CHILD_GRANTING_FLIGHT_STATS,defaultLeveling:DEFAULT_LEVELING};
 return rules=new SupportRules({
  policy:()=>policy,
  boarding:()=>CREW_CFG.boarding,baseTags:instanceBaseTags,delivery:instanceDelivery,castMode:instanceCastMode,
  treeModifiers:instanceTreeMods,selfStack:instanceSelfStack,summon:instanceSummon,componentInstances:attackSequenceSweepInstances,
  componentStatuses:attackSequenceStatuses,hasChildFlights:inst=>{const sequence=attackSequenceOf(inst);return !!(sequence?.flightRain||sequence?.bounce);},
  status:id=>STATUS_DEFS[id],tuneChance:tuneAilmentChance,createCrew:(def,sockets)=>makeSkillInstance(def,1,sockets),
  mechanism:mechanismHolds,
 });
}
