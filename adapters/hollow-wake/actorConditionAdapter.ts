import {ActorConditions,type ActorConditionPublication} from '@hollow-wake/engine/stats/conditions';
import {FULL_LIFE_FRAC,LOW_MANA_FRAC,FULL_MANA_FRAC,FULL_ES_FRAC,LOW_ES_FRAC} from './stats';
import {RECENT_KINDS,recentWindow} from './recency';
import type {Actor} from './actor';
export type {ActorConditionPublication};

/** Called once while actor.ts initializes, at the former recency-row capture.
 * Accept stance constants as values to avoid a runtime Actor import cycle. */
export function createActorConditions(plantSeconds:number,movingSeconds:number):ActorConditions<Actor> {
  return new ActorConditions<Actor>({
    maxLife:actor=>actor.maxLife(),maxMana:actor=>actor.maxMana(),maxEs:actor=>actor.maxEs(),
    lowLifeFraction:actor=>actor.lowLifeLine(),strideReach:actor=>actor.sheet.get('strideReach'),
  },{
    fullLifeFraction:FULL_LIFE_FRAC,lowManaFraction:LOW_MANA_FRAC,fullManaFraction:FULL_MANA_FRAC,
    fullEsFraction:FULL_ES_FRAC,lowEsFraction:LOW_ES_FRAC,plantSeconds,movingSeconds,
    recentWindows:RECENT_KINDS.map(recentWindow),
  });
}
