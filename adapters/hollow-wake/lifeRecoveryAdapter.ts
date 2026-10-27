import type {LifeRecoveryPorts} from '@hollow-wake/engine/combat/recovery';
import type {Actor} from './actor';
import {SIM_TAP} from './tap';

/** Shared callbacks only; live actors continue to own every recovery field. */
export const lifeRecoveryPorts = Object.freeze<LifeRecoveryPorts<Actor>>({
  ceiling(actor) { return actor.lifeCeiling(); },
  maximumLife(actor) { return actor.maxLife(); },
  rate(actor) { return actor.sheet.get('healTaken'); },
  tapped(actor, amount) { SIM_TAP.current?.onHeal?.(actor, amount); return undefined; },
  observed(actor, amount, silent) { actor.onLifeHealed?.(amount, silent); return undefined; },
  recent(actor) { actor.noteRecent('heal'); return undefined; },
});
