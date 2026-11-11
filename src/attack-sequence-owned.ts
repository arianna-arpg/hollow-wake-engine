import type {AttackSequenceSpec,SequenceBuff} from './attack-sequence-types.js';
// Internal bridge shared only by the controller and optional continuation entry.
// It is not an exported package entry or an authorization boundary.
export const sequenceContinuationState:unique symbol=Symbol('attack-sequence-continuation');
export interface SequenceState<A, I, M, D extends {type: string}> {
  owner: A; host: I; spec: AttackSequenceSpec<M, D>; policy: string; key: string;
  stacks: Map<A, number>; caught: number; retired: boolean; buffs: Map<A, SequenceBuff<M>>;
}
export interface SequenceCast<A, I, M, D extends {type: string}> {
  state: SequenceState<A, I, M, D>; inst: I; caught: number; connected: boolean; done: boolean;
  receipt?: { target: A; dealt: number; physical: number };
}
export interface Recovery<A, I, P, Aim, M, D extends {type: string}> {
  cast: SequenceCast<A, I, M, D>; projectile: P; target?: A; at: Aim; from: Aim;
  elapsed: number; duration: number; marker?: A; dealt: number; airborne: boolean;
}
export interface Scheduled<A, I, Aim, M, D extends {type: string}> {
  state: SequenceState<A, I, M, D>; inst: I; aim: Aim; due: number; power: number;
}


export interface SequenceOwnedState<A,I,P,Aim,M,D extends {type:string}> {
 states:Set<SequenceState<A,I,M,D>>;casts:WeakMap<I & object,SequenceCast<A,I,M,D>>;
 active:Set<SequenceCast<A,I,M,D>>;recoveries:Recovery<A,I,P,Aim,M,D>[];
 scheduled:Scheduled<A,I,Aim,M,D>[];rainAt:WeakMap<P & object,number>;
 deferredContacts:{projectile:P;target:A}[];serial:number;continuationImported:boolean;
}
