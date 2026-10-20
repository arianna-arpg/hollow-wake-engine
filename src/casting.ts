import { copy, finite, freeze, integer } from './validation.js';

export interface Resources { mana: number; life: number }
export interface CastCost { mana: number; life: number }
export interface CastProgress { elapsed: number; total: number }
export interface CastProfile {
  skillId: string;
  /** Already resolved against the current build; no engine objects cross this boundary. */
  useTime: number;
  cost: CastCost;
  cooldown: number;
  cooldownAt: 'press' | 'completion';
}
export interface CastGates { blocked?: boolean; stunned?: boolean; dead?: boolean }
export interface CastFrame extends CastGates {
  cooldownRecovery?: number;
  /** Actual per-clock recovery rates, after the host resolves any tag scope. */
  cooldownRates?: Readonly<Record<string, number>>;
  /** Repriced at execution, like the original game. Omit to retain the press quote. */
  completionCooldown?: number;
}
export interface ActiveCast extends CastProgress {
  token: number;
  profile: CastProfile;
}
export interface CastEvent {
  kind: 'started' | 'completed' | 'cancelled';
  token: number;
  skillId: string;
  paid: CastCost;
  reason?: 'host' | 'stunned' | 'dead';
}
export type PressResult = CastEvent | { kind: 'rejected'; reason: 'dead' | 'stunned' | 'blocked' | 'busy' | 'recovery' | 'cooldown' | 'resources' };
export interface CastSnapshot {
  schemaVersion: 1;
  capability: 'ordinary-cast/v1';
  time: number;
  nextToken: number;
  resources: Resources;
  recovery: number;
  active: ActiveCast | null;
  cooldowns: [string, number][];
}

function nonnegative(value: number, context: string): number {
  if (finite(value, context) < 0) throw new Error(`${context} must be nonnegative`);
  return value;
}
export function validateCost(cost: CastCost): void {
  nonnegative(cost.mana, 'mana cost'); nonnegative(cost.life, 'life cost');
}
function validateResources(resources: Resources): void {
  nonnegative(resources.mana, 'mana'); finite(resources.life, 'life');
}
/** A life payment must leave the caster alive. Energy-shield/debt policies are separate capabilities. */
export function canPayCast(resources: Resources, cost: CastCost): boolean {
  validateResources(resources); validateCost(cost);
  return resources.mana >= cost.mana && resources.life > cost.life;
}
/** Validates both lanes before mutation. The caller owns the resource record. */
export function payCast(resources: Resources, cost: CastCost): void {
  if (!canPayCast(resources, cost)) throw new Error('Insufficient casting resources');
  resources.mana -= cost.mana; resources.life -= cost.life;
}
/** Ordinary casts below the instant threshold have no bar; all other bars floor at 0.2 s. */
export function castDuration(useTime: number): number {
  nonnegative(useTime, 'use time');
  return useTime <= 0.001 ? 0 : Math.max(0.2, useTime);
}
/** Allocation-free shared transition, used directly by the Hollow Wake adapter. */
export function advanceCastProgress(cast: CastProgress, dt: number): boolean {
  nonnegative(dt, 'dt');
  const elapsed = finite(cast.elapsed + dt, 'cast elapsed');
  cast.elapsed = elapsed;
  return elapsed >= cast.total;
}
export function advanceCooldown(remaining: number, dt: number, recovery: number): number {
  nonnegative(dt, 'dt'); nonnegative(recovery, 'cooldown recovery');
  return finite(remaining - dt * recovery, 'cooldown remaining');
}
function validateProfile(profile: CastProfile): void {
  for (const key of Object.keys(profile)) if (!['skillId', 'useTime', 'cost', 'cooldown', 'cooldownAt'].includes(key)) throw new Error(`Unsupported cast field: ${key}`);
  if (typeof profile.skillId !== 'string' || !profile.skillId || ['__proto__', 'constructor', 'prototype'].includes(profile.skillId)) throw new Error('A non-reserved skill id is required');
  castDuration(profile.useTime); validateCost(profile.cost); nonnegative(profile.cooldown, 'cooldown');
  if (!['press', 'completion'].includes(profile.cooldownAt)) throw new Error('Unsupported cooldown policy');
}

const EMPTY_FRAME: CastFrame = Object.freeze({});
/** One actor's ordinary cast lifecycle. Time is supplied by the host. */
export class CastRuntime {
  private resources: Resources;
  private active: ActiveCast | null = null;
  private cooldowns = new Map<string, number>();
  private recovery = 0;
  private time = 0;
  private nextToken = 1;
  constructor(resources: Resources, readonly maxCooldowns = 128) {
    validateResources(resources); integer(maxCooldowns, 1, 'maximum cooldowns');
    this.resources = copy(resources);
  }
  get mana(): number { return this.resources.mana; }
  get life(): number { return this.resources.life; }
  get busy(): boolean { return this.active !== null; }
  get useLock(): number { return this.recovery; }
  get now(): number { return this.time; }
  cooldown(skillId: string): number { return this.cooldowns.get(skillId) ?? 0; }
  setResources(resources: Resources): void { validateResources(resources); this.resources = copy(resources); }
  press(input: CastProfile, gates: CastGates = {}): PressResult {
    validateProfile(input);
    if (gates.dead || this.life <= 0) return { kind: 'rejected', reason: 'dead' };
    if (gates.stunned) return { kind: 'rejected', reason: 'stunned' };
    if (gates.blocked) return { kind: 'rejected', reason: 'blocked' };
    if (this.active) return { kind: 'rejected', reason: 'busy' };
    if (this.recovery > 0) return { kind: 'rejected', reason: 'recovery' };
    if (this.cooldowns.has(input.skillId)) return { kind: 'rejected', reason: 'cooldown' };
    if (!canPayCast(this.resources, input.cost)) return { kind: 'rejected', reason: 'resources' };
    // Reserve capacity before payment, including a completion-stamped clock.
    if (this.cooldowns.size >= this.maxCooldowns) throw new Error('Cooldown capacity reached');
    integer(this.nextToken + 1, 1, 'cast token');
    const profile = freeze(copy(input));
    const active: ActiveCast = { token: this.nextToken++, profile, elapsed: 0, total: castDuration(profile.useTime) };
    payCast(this.resources, profile.cost);
    if (profile.cooldownAt === 'press') this.stamp(profile.skillId, profile.cooldown);
    if (active.total === 0) {
      if (profile.cooldownAt === 'completion') this.stamp(profile.skillId, profile.cooldown);
      this.recovery = 0.12;
      return this.event(active, 'completed');
    }
    this.active = active;
    return this.event(active, 'started');
  }
  /** Timers precede cast completion, matching Actor.updateTimers -> World.updateCasting. */
  advance(dt: number, frame: CastFrame = EMPTY_FRAME): CastEvent | null {
    nonnegative(dt, 'dt');
    const nextTime = finite(this.time + dt, 'simulation time');
    const recovery = nonnegative(frame.cooldownRecovery ?? 1, 'cooldown recovery');
    if (frame.completionCooldown !== undefined) nonnegative(frame.completionCooldown, 'completion cooldown');
    // Validate the whole frame before touching any clock.
    if (this.cooldowns.size) for (const [id, left] of this.cooldowns) advanceCooldown(left, dt, frame.cooldownRates?.[id] ?? recovery);
    if (this.active) finite(this.active.elapsed + dt, 'cast elapsed');
    this.time = nextTime;
    if (this.cooldowns.size) for (const [id, left] of this.cooldowns) {
      const next = advanceCooldown(left, dt, frame.cooldownRates?.[id] ?? recovery);
      if (next <= 0) this.cooldowns.delete(id); else this.cooldowns.set(id, next);
    }
    if (this.recovery > 0) this.recovery -= dt;
    if (frame.dead || this.life <= 0) return this.cancel('dead');
    if (frame.stunned) return this.cancel('stunned');
    const active = this.active;
    if (!active || !advanceCastProgress(active, dt)) return null;
    this.active = null; // Clear before returning a completion: callers can never execute it twice.
    this.recovery = 0.1;
    if (active.profile.cooldownAt === 'completion') {
      this.stamp(active.profile.skillId, frame.completionCooldown ?? active.profile.cooldown);
    }
    return this.event(active, 'completed');
  }
  cancel(reason: 'host' | 'stunned' | 'dead' = 'host'): CastEvent | null {
    const active = this.active;
    if (!active) return null;
    this.active = null;
    return { ...this.event(active, 'cancelled'), reason }; // Payment and any press clock remain.
  }
  snapshot(): CastSnapshot {
    return copy({ schemaVersion: 1, capability: 'ordinary-cast/v1', time: this.time, nextToken: this.nextToken,
      resources: this.resources, recovery: this.recovery, active: this.active, cooldowns: [...this.cooldowns] });
  }
  static restore(snapshot: CastSnapshot, maxCooldowns = 128): CastRuntime {
    const state = copy(snapshot);
    if (state.schemaVersion !== 1 || state.capability !== 'ordinary-cast/v1') throw new Error('Unsupported cast snapshot');
    if (state.active !== null && (!state.active || typeof state.active !== 'object')) throw new Error('Invalid active cast snapshot');
    const runtime = new CastRuntime(state.resources, maxCooldowns);
    nonnegative(state.time, 'time'); finite(state.recovery, 'recovery'); integer(state.nextToken, 1, 'next token');
    if (state.cooldowns.length > maxCooldowns) throw new Error('Cooldown capacity reached');
    for (const [id, left] of state.cooldowns) {
      if (typeof id !== 'string' || !id || ['__proto__', 'constructor', 'prototype'].includes(id) || runtime.cooldowns.has(id) || nonnegative(left, 'cooldown') <= 0) throw new Error('Invalid cooldown snapshot');
      runtime.cooldowns.set(id, left);
    }
    if (state.active) {
      const active = state.active;
      validateProfile(active.profile); integer(active.token, 1, 'cast token');
      nonnegative(active.elapsed, 'cast elapsed');
      if (active.token >= state.nextToken || active.total !== castDuration(active.profile.useTime)
        || active.total <= 0 || active.elapsed >= active.total) throw new Error('Invalid active cast snapshot');
      active.profile = freeze(active.profile);
      if (active.profile.cooldownAt === 'completion' && runtime.cooldowns.size >= maxCooldowns) throw new Error('No capacity reserved for cast completion');
    }
    runtime.time = state.time; runtime.recovery = state.recovery;
    runtime.nextToken = state.nextToken; runtime.active = state.active;
    return runtime;
  }
  private stamp(id: string, duration: number): void { if (duration > 0) this.cooldowns.set(id, duration); }
  private event(active: ActiveCast, kind: CastEvent['kind']): CastEvent {
    return { kind, token: active.token, skillId: active.profile.skillId, paid: copy(active.profile.cost) };
  }
}
