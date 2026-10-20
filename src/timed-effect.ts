import { copy, finite, freeze } from './validation.js';

export interface DotState { remaining: number; dps: number; stacks: number }
export interface DotDefinition {
  id: string;
  damageType: string;
  duration: number;
  reapply: 'strongest';
  /** Compatibility law: the expiry frame pays its full dt, as in the original Actor timers. */
  clock: 'hollow-wake-frame/v1';
}
export interface DotSnapshot {
  schemaVersion: 1;
  definition: DotDefinition;
  active: (DotState & { sourceId?: string }) | null;
}
function nonnegative(value: number, label: string): number {
  if (finite(value, label) < 0) throw new Error(`${label} must be nonnegative`);
  return value;
}
export function replaceStrongerDot(state: DotState, dps: number, duration: number): boolean {
  nonnegative(dps, 'dps'); nonnegative(duration, 'duration');
  if (dps <= state.dps) return false;
  state.dps = dps; state.remaining = duration;
  return true;
}
/** Returns raw damage; the host retains mitigation, death and presentation ownership. No allocation. */
export function advanceDotFrame(state: DotState, dt: number): number {
  nonnegative(dt, 'dt');
  const damage = finite(state.dps * state.stacks * dt, 'dot damage');
  const remaining = finite(state.remaining - dt, 'dot remaining');
  state.remaining = remaining;
  return damage;
}
/** One non-stacking strongest-wins effect per bearer, with bounded storage and no tick allocations. */
export class TimedDamage {
  readonly definition: DotDefinition;
  private active: DotSnapshot['active'] = null;
  constructor(input: DotDefinition) {
    for (const key of Object.keys(input)) if (!['id', 'damageType', 'duration', 'reapply', 'clock'].includes(key)) throw new Error(`Unsupported timed-effect field: ${key}`);
    if (typeof input.id !== 'string' || !input.id || typeof input.damageType !== 'string' || !input.damageType || input.reapply !== 'strongest' || input.clock !== 'hollow-wake-frame/v1') throw new Error('Unsupported timed-effect capability');
    if (nonnegative(input.duration, 'duration') === 0) throw new Error('Duration must be positive');
    this.definition = freeze(copy(input));
  }
  get remaining(): number { return this.active?.remaining ?? 0; }
  get dps(): number { return this.active?.dps ?? 0; }
  get sourceId(): string | undefined { return this.active?.sourceId; }
  get present(): boolean { return this.active !== null; }
  apply(dps: number, durationScale = 1, expiryRate = 1, sourceId?: string): 'applied' | 'replaced' | 'ignored' {
    nonnegative(dps, 'dps'); nonnegative(durationScale, 'duration scale');
    if (nonnegative(expiryRate, 'expiry rate') === 0) throw new Error('Expiry rate must be positive');
    if (sourceId !== undefined && (typeof sourceId !== 'string' || !sourceId)) throw new Error('Invalid source id');
    const duration = finite(this.definition.duration * durationScale / expiryRate, 'duration');
    if (!this.active) {
      this.active = { remaining: duration, dps, stacks: 1, ...(sourceId === undefined ? {} : { sourceId }) };
      return 'applied';
    }
    const replaced = replaceStrongerDot(this.active, dps, duration);
    // The original retains first-applier attribution even when a stronger application replaces its DPS.
    this.active.sourceId ??= sourceId;
    return replaced ? 'replaced' : 'ignored';
  }
  advance(dt: number): number {
    nonnegative(dt, 'dt');
    if (!this.active) return 0;
    const damage = advanceDotFrame(this.active, dt);
    if (this.active.remaining <= 0) this.active = null;
    return damage;
  }
  clear(): void { this.active = null; }
  snapshot(): DotSnapshot { return copy({ schemaVersion: 1, definition: this.definition, active: this.active }); }
  static restore(input: DotSnapshot): TimedDamage {
    const snapshot = copy(input);
    if (snapshot.schemaVersion !== 1) throw new Error('Unsupported timed-effect snapshot');
    if (snapshot.active !== null && (!snapshot.active || typeof snapshot.active !== 'object')) throw new Error('Invalid timed-effect snapshot');
    const effect = new TimedDamage(snapshot.definition);
    if (snapshot.active) {
      const state = snapshot.active;
      nonnegative(state.remaining, 'remaining'); nonnegative(state.dps, 'dps');
      if (state.stacks !== 1 || (state.sourceId !== undefined && (typeof state.sourceId !== 'string' || !state.sourceId))) throw new Error('Invalid timed-effect snapshot');
      effect.active = state;
    }
    return effect;
  }
}
