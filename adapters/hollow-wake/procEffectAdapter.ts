import type {WardResourcePorts,WardEffectPorts} from '@hollow-wake/engine/combat/effects';
import type {Actor} from './actor';

// Shared stateless ports retain the current native methods as observable calls.
export const wardResourcePorts:WardResourcePorts<Actor>=Object.freeze({
  rate:(actor:Actor)=>actor.sheet.get('wardGain'),
});
export const wardEffectPorts:WardEffectPorts<Actor>=Object.freeze({
  maximumLife:(actor:Actor)=>actor.maxLife(),
  gain:(actor:Actor,amount:number)=>actor.gainWard(amount),
});
