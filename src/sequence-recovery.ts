import type {ClockSkill, StampedClocks} from './cooldown-lifecycle.js';

export interface SequenceRecoveryOwner extends StampedClocks {
  readonly skillRecoveryLocks: {
    add(id: string): unknown;
    delete(id: string): boolean;
  };
}

/** Borrowed identities and stores. A miss requires a recovery policy. */
export interface SequenceRecoveryState {
  readonly owner: SequenceRecoveryOwner;
  readonly host: ClockSkill;
  readonly spec: {
    readonly recovery?: {readonly missCooldown: number};
    readonly catchBuff?: unknown;
  };
  caught: number;
}

export interface SequenceRecoveryCast {
  readonly state: SequenceRecoveryState;
  readonly connected: boolean;
  readonly caught: number;
  done: boolean;
}

/** Synchronous observations at the host's existing settlement phase. Objects
 * represent this cast's outstanding pickups; grounded objects still hold it. */
export interface SequenceRecoveryPorts<C extends SequenceRecoveryCast> {
  flying(cast: C, state: C['state']): boolean;
  pending(cast: C): boolean;
  objects(cast: C): readonly {readonly airborne: boolean}[];
  clearCatch(state: C['state']): undefined;
}

/** The one-second sweep presents a hold; the lock set determines admission.
 * Reads and writes stay live. A throwing store leaves earlier writes visible. */
export function lockSequenceRecovery(state: SequenceRecoveryState): void {
  state.owner.skillRecoveryLocks.add(state.host.def.id);
  state.owner.cooldowns.set(state.host.def.id, 1);
  state.owner.cooldownTotals.set(state.host.def.id, 1);
}

/** Retiring a sequence uses miss=false. A completed missed throw may stamp its
 * authored penalty after removing the hold and both presentation clocks. */
export function releaseSequenceRecovery(state: SequenceRecoveryState, miss: boolean): void {
  state.owner.skillRecoveryLocks.delete(state.host.def.id);
  state.owner.cooldowns.delete(state.host.def.id);
  state.owner.cooldownTotals.delete(state.host.def.id);
  if (miss && state.spec.recovery!.missCooldown > 0) {
    state.owner.cooldowns.set(state.host.def.id, state.spec.recovery!.missCooldown);
    state.owner.cooldownTotals.set(state.host.def.id, state.spec.recovery!.missCooldown);
  }
}

/** Snapshot iteration preserves the original reentrant ordering. Only the last
 * active cast of the same state releases it, using that cast's connected flag.
 * No clock advancement, geometry, scheduling, allocation of actors, or RNG. */
export function settleSequenceRecoveries<C extends SequenceRecoveryCast>(
  active: Set<C>, ports: SequenceRecoveryPorts<C>,
): void {
  for (const cast of [...active]) {
    const state: C['state'] = cast.state;
    const flying = ports.flying(cast, state);
    const pending = ports.pending(cast);
    const objects = ports.objects(cast);
    if (!flying && !pending && !objects.some(object => object.airborne) && !cast.done) {
      cast.done = true;
      if (!cast.caught && state.spec.catchBuff) {
        state.caught = 0;
        ports.clearCatch(state);
      }
    }
    if (!flying && !pending && !objects.length) {
      active.delete(cast);
      if (![...active].some(other => other.state === state)) releaseSequenceRecovery(state, !cast.connected);
    } else lockSequenceRecovery(state);
  }
}
