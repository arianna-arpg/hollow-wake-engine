import type {ChallengePoint, ChallengeSpec} from './challenge-types.js';

// Internal bridge for the optional continuation entry. This is not a package
// export or an authorization boundary; ordinary updates never enumerate casts.
export const challengeContinuationState: unique symbol = Symbol('challenge-continuation');

export interface ChallengeState<A, I> {
  owner: A; host: I; spec: ChallengeSpec; policy: string;
  primed: boolean; guaranteedAt: number; retired: boolean;
}
export interface ChallengeCast<A, I> {
  state: ChallengeState<A, I>; inst: I; primed: boolean;
  generation: number; orbitTargets: Set<number>;
}
export interface Effigy<A, I> {
  body: A; cast: ChallengeCast<A, I>; radius: number; average: number;
  creeper?: A; center: ChallengePoint; trailAt: number; strikeAt: number;
}
export interface Landing<A, I, C> {
  cast: ChallengeCast<A, I>; from: ChallengePoint; at: ChallengePoint;
  d: C; remaining: number; duration: number; power: number;
}
export interface Shock<A, I> {
  effigy: Effigy<A, I>; at: ChallengePoint; due: number; greater: boolean; echoes: boolean;
}
export interface ChallengeOwnedState<A, I extends object, C> {
  states: Map<string, ChallengeState<A, I>>;
  casts: WeakMap<I, ChallengeCast<A, I>>;
  landings: Landing<A, I, C>[];
  effigies: Effigy<A, I>[];
  shocks: Shock<A, I>[];
  used: boolean;
}
