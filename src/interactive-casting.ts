import {finite} from './validation.js';

function nonnegative(value: number, label: string): number {
  if (finite(value, label) < 0) throw new Error(`${label} must be nonnegative`);
  return value;
}
export interface CastPressState {
  mode: string;
  elapsed: number;
  total: number;
  pressUsed?: boolean;
  empowered?: number;
  presses?: number;
  indicatorAt?: number;
}
export type CastTimingCue = 'perfect' | 'flawless';

/** Marks one timing attempt even when it misses. A multitude press is capped.
 * The host records input authority first, then emits the returned cue and event.
 * This function never advances a bar or delivers its eventual payload. */
export function pressCastTiming(state: CastPressState, bonus?: number): CastTimingCue | undefined {
  if (state.mode === 'multitude') {
    state.presses = Math.min(15, nonnegative(state.presses ?? 1, 'Cast presses') + 1);
    return;
  }
  if ((state.mode !== 'perfect' && state.mode !== 'timed') || state.pressUsed) return;
  nonnegative(state.elapsed, 'Cast elapsed');nonnegative(state.total, 'Cast total');
  const fraction = state.total > 0 ? state.elapsed / state.total : 0;
  const made = state.mode === 'perfect' ? fraction >= .72 : state.indicatorAt !== undefined
    && Math.abs(fraction - finite(state.indicatorAt, 'Timing marker')) <= .08;
  const multiplier = made ? 1 + finite(bonus ?? (state.mode === 'perfect' ? .7 : 1.2), 'Timing bonus') : 1;
  state.pressUsed = true;
  if (made) {
    state.empowered = multiplier;
    return state.mode === 'perfect' ? 'perfect' : 'flawless';
  }
}

export interface FocusCastState {
  elapsed: number;
  total: number;
  held: boolean;
  focusBroken?: boolean;
}
export interface FocusCastSpec {
  time: number;
  onBreak?: 'cancel' | 'release' | 'drain';
  drainRate?: number;
  minRelease?: number;
  slack?: number;
}
export type FocusCastOutcome = Readonly<{kind: 'release'; multiplier: number}> | Readonly<{kind: 'fizzle'}>;
const completed: FocusCastOutcome = Object.freeze({kind: 'release', multiplier: 1});
const fizzled: FocusCastOutcome = Object.freeze({kind: 'fizzle'});

export function focusCastDuration(time: number, speed: number): number {
  if (finite(speed, 'Cast speed') <= 0) throw new Error('Cast speed must be positive');
  return Math.max(.2, finite(nonnegative(time, 'Focus duration') / speed, 'Focus duration'));
}
/** The host supplies a distance in its own coordinate system and target radius.
 * Target presence, visibility, authority and aim tracking stay with that host. */
export function focusWithinReach(distance: number, radius: number, slack = 30): boolean {
  return nonnegative(distance, 'Focus distance') <= finite(nonnegative(radius, 'Focus radius')
    + nonnegative(slack, 'Focus slack'), 'Focus reach');
}
/** A fizzle owns a local recovery quote. The host stamps both clock and UI total.
 * Actor-wide recovery still advances that clock in the ordinary timer phase. */
export function focusFizzleCooldown(base: number, skillRecovery: number, globalRecovery: number): number {
  nonnegative(base, 'Focus cooldown');
  if (finite(globalRecovery, 'Global cooldown recovery') <= 0) throw new Error('Global cooldown recovery must be positive');
  return finite(base / Math.max(.1, nonnegative(skillRecovery, 'Skill cooldown recovery') / globalRecovery), 'Focus cooldown');
}
/** Advance one admitted focus cast. Returns no object while ongoing, immutable
 * shared outcomes for full completion/fizzle, and one value on partial release.
 * On an outcome the host must clear active state and set .15 recovery before
 * delivery or the fizzle cue/clock. Stun cleanup must run before this phase. */
export function advanceFocusCast(state: FocusCastState, spec: FocusCastSpec, dt: number, quarryFocused: boolean): FocusCastOutcome | undefined {
  nonnegative(dt, 'Focus frame');nonnegative(state.elapsed, 'Focus elapsed');
  if (finite(state.total, 'Focus total') <= 0) throw new Error('Focus total must be positive');
  const policy = spec.onBreak ?? 'drain';
  if (policy !== 'cancel' && policy !== 'release' && policy !== 'drain') throw new Error('Unknown focus break policy');
  const focused = state.held && quarryFocused;
  state.focusBroken = !focused;
  if (focused) {
    state.elapsed = finite(state.elapsed + dt, 'Focus progress');
    if (state.elapsed >= state.total) return completed;
  } else if (policy === 'cancel') return fizzled;
  else if (policy === 'release') {
    const fraction = state.elapsed / state.total;
    if (fraction >= nonnegative(spec.minRelease ?? .25, 'Minimum focus release')) return {kind:'release',multiplier:fraction};
    return fizzled;
  } else {
    if (!state.held) return fizzled;
    state.elapsed = finite(state.elapsed - dt * nonnegative(spec.drainRate ?? 1, 'Focus drain'), 'Focus progress');
    if (state.elapsed <= 0) return fizzled;
  }
}
