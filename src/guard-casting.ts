import {finite} from './validation.js';

export interface GuardBashState {
  channelTime?: number;
  shield?: number;
  maxShield?: number;
  bashAt?: number;
  bashLow?: boolean;
  bashArmAt?: number;
}
export interface GuardCastState extends GuardBashState {
  mode: string;
  held: boolean;
  trigBeat?: number;
  guardPulseT?: number;
  aiHold?: number;
  aiGuardEarly?: boolean;
  aiGuardWindup?: number;
  aiGuardReleaseAt?: number;
  aiGuardFacing?: number;
}
export interface GuardBashSpec { threshold?: number; armTime?: number }
export interface GuardCastSpec {
  maxDuration?: number;
  turnRate?: number;
  pulse?: {interval: number; skillId: string};
}
export interface GuardCastingConfig { beatInterval: number; releaseFloor: number; armTime: number }
export type GuardBashStat = 'bashFloor' | 'bashInvert' | 'bashArmTime';

/** The current cast, spec and context are borrowed. Readers must be pure;
 * synchronous sinks may affect observations of later phases. In particular,
 * lower runs before the release rereads the effective bash and shield. */
export interface GuardCastingPorts<A, S extends GuardCastState, B extends GuardBashSpec, C> {
  spec(state: S): GuardCastSpec;
  seated(actor: A): boolean;
  holdBonus(actor: A, state: S): number;
  aim(actor: A, state: S, spec: GuardCastSpec, dt: number): void;
  bash(state: S): B | undefined;
  context(state: S): C;
  bashStat(actor: A, context: C, stat: GuardBashStat): number;
  supports(actor: A, state: S, dt: number): void;
  trigger(actor: A, state: S): void;
  pulse(actor: A, state: S, skill: string): void;
  dead(actor: A): boolean;
  time(): number;
  facing(actor: A): number;
  plantUntil(actor: A, deadline: number): void;
  lower(actor: A, state: S): void;
  end(actor: A, state: S, recovery: number): void;
  cleanup(actor: A, state: S): void;
  cooldown(state: S): number;
  stampCooldown(actor: A, state: S, duration: number): void;
  deliverBash(actor: A, state: S, bash: B, payload: number): void;
}

function nonnegative(n: number, label: string): number {
  if (finite(n, label) < 0) throw new Error(`${label} must be nonnegative`);
  return n;
}
function positive(n: number, label: string): number {
  if (finite(n, label) <= 0) throw new Error(`${label} must be positive`);
  return n;
}
function bashArmed(state: GuardBashState): boolean {
  return nonnegative(state.channelTime ?? 0, 'Guard held time') + 1e-6 >= nonnegative(state.bashArmAt ?? 0, 'Guard arm time');
}
function bashLine(state: GuardBashState): boolean {
  const fraction = Math.max(0, finite(state.shield ?? 0, 'Guard shield')) / (nonnegative(state.maxShield ?? 0, 'Guard capacity') || 1);
  return state.bashAt !== undefined && (state.bashLow
    ? fraction <= finite(state.bashAt, 'Guard bash line') : fraction >= finite(state.bashAt, 'Guard bash line'));
}
/** The HUD and consumers that need all four observations use this receipt.
 * Internal boolean gates avoid creating a receipt for each readiness check. */
export function guardBashReady(state: GuardBashState): {clock: number; armed: boolean; line: boolean; ready: boolean} {
  const arm = nonnegative(state.bashArmAt ?? 0, 'Guard arm time'), held = nonnegative(state.channelTime ?? 0, 'Guard held time');
  const clock = arm > 0 ? Math.min(1, held / arm) : 1, armed = held + 1e-6 >= arm, line = bashLine(state);
  return {clock, armed, line, ready: armed && line};
}
/** Shared AI hold read. Absence means no rolled deadline, represented by Infinity.
 * Non-guard modes retain the raw hold, as in the original shared caller. */
export function guardAiHold(state: GuardCastState): number {
  const hold = state.aiHold === undefined ? Infinity : nonnegative(state.aiHold, 'Guard AI hold');
  if (state.mode !== 'guard' || state.aiGuardEarly || state.bashAt === undefined) return hold;
  const arm = nonnegative(state.bashArmAt ?? 0, 'Guard arm time');
  return arm > 0 && bashLine(state) ? Math.max(hold, arm) : hold;
}
export function guardDuration(duration: number, bonus: number): number {
  return Math.max(.05, finite(nonnegative(duration, 'Guard duration') + finite(bonus, 'Guard duration bonus'), 'Guard duration'));
}

/** One simulation binding. Host calls refresh at admission and advance only for
 * an active guard. Shared input/interruption runs beforehand; interception,
 * parry, shield damage and break dispatch remain separate host operations. */
export class GuardCasting<A, S extends GuardCastState, B extends GuardBashSpec = GuardBashSpec, C = undefined> {
  readonly #ports: GuardCastingPorts<A, S, B, C>;
  readonly #config: GuardCastingConfig;
  #busy = false;
  constructor(ports: GuardCastingPorts<A, S, B, C>, config: GuardCastingConfig) {
    this.#config = Object.freeze({beatInterval: positive(config.beatInterval, 'Guard beat interval'),
      releaseFloor: nonnegative(config.releaseFloor, 'Guard release floor'), armTime: nonnegative(config.armTime, 'Guard default arm time')});
    const bound = {} as GuardCastingPorts<A, S, B, C>;
    for (const key of ['spec','seated','holdBonus','aim','bash','context','bashStat','supports','trigger','pulse',
      'dead','time','facing','plantUntil','lower','end','cleanup','cooldown','stampCooldown','deliverBash'] as const) {
      const fn = ports[key];
      if (typeof fn !== 'function') throw new Error(`Guard casting ${key} port is required`);
      Object.defineProperty(bound, key, {value: fn.bind(ports), enumerable: true});
    }
    this.#ports = bound;
  }

  refresh(actor: A, state: S): void {
    if (this.#busy) throw new Error('Reentrant guard casting operation');
    this.#busy = true;
    try { this.#refresh(actor, state); } finally { this.#busy = false; }
  }

  advance(actor: A, state: S, dt: number): void {
    nonnegative(dt, 'Guard frame');
    if (this.#busy) throw new Error('Reentrant guard casting operation');
    this.#busy = true;
    try {
      const p = this.#ports, spec = p.spec(state);
      const duration = spec.maxDuration === undefined ? undefined : guardDuration(spec.maxDuration, p.holdBonus(actor, state));
      if (p.seated(actor)) { state.aiGuardReleaseAt = undefined; state.aiGuardFacing = undefined; }
      state.channelTime = finite(nonnegative(state.channelTime ?? 0, 'Guard held time') + dt, 'Guard held time');
      p.aim(actor, state, spec, dt);
      this.#refresh(actor, state);
      p.supports(actor, state, dt);
      state.trigBeat = finite(finite(state.trigBeat ?? this.#config.beatInterval, 'Guard beat timer') - dt, 'Guard beat timer');
      if (state.trigBeat <= 0) { state.trigBeat += this.#config.beatInterval; p.trigger(actor, state); }
      if (spec.pulse) {
        const interval = positive(spec.pulse.interval, 'Guard pulse interval');
        state.guardPulseT = finite(finite(state.guardPulseT ?? interval, 'Guard pulse timer') - dt, 'Guard pulse timer');
        if (state.guardPulseT <= 0) { state.guardPulseT += interval; p.pulse(actor, state, spec.pulse.skillId); }
      }
      if (duration && (state.channelTime ?? 0) >= duration) state.held = false;
      if (!p.seated(actor) && !p.dead(actor) && (state.aiGuardWindup ?? 0) > 0) {
        const windup = positive(state.aiGuardWindup!, 'Guard AI windup');
        const holdLeft = Math.min(guardAiHold(state), duration ?? Infinity) - (state.channelTime ?? 0);
        if ((!state.held || holdLeft <= windup) && state.aiGuardReleaseAt === undefined && state.bashAt !== undefined) {
          if (bashLine(state) && (state.channelTime ?? 0) + windup + 1e-6 >= (state.bashArmAt ?? 0)) {
            state.aiGuardReleaseAt = finite(finite(p.time(), 'Guard world time') + windup, 'Guard warning deadline');
            state.aiGuardFacing = finite(p.facing(actor), 'Guard facing');
            p.plantUntil(actor, state.aiGuardReleaseAt);
          }
        }
        if (state.aiGuardReleaseAt !== undefined) state.held = finite(p.time(), 'Guard world time') + 1e-9 < finite(state.aiGuardReleaseAt, 'Guard warning deadline');
      }
      if (!state.held || p.dead(actor)) {
        p.lower(actor, state);
        const bash = p.bash(state), capacity = nonnegative(state.maxShield ?? 0, 'Guard capacity') || 1;
        const shield = Math.max(0, finite(state.shield ?? 0, 'Guard shield'));
        p.end(actor, state, .2);
        p.cleanup(actor, state);
        const cooldown = nonnegative(p.cooldown(state), 'Guard cooldown');
        if (cooldown > 0) p.stampCooldown(actor, state, cooldown);
        if (bash && !p.dead(actor) && state.bashAt !== undefined) {
          const payload = state.bashLow ? capacity - shield : shield;
          if (bashArmed(state) && bashLine(state)) p.deliverBash(actor, state, bash, finite(payload, 'Guard bash payload'));
        }
      }
    } finally { this.#busy = false; }
  }

  #refresh(actor: A, state: S): void {
    const p = this.#ports, bash = p.bash(state);
    if (!bash) { state.bashAt = undefined; state.bashLow = undefined; state.bashArmAt = undefined; return; }
    const context = p.context(state);
    const floor = Math.max(0, Math.min(1, finite(finite(bash.threshold ?? this.#config.releaseFloor, 'Guard release floor')
      * finite(p.bashStat(actor, context, 'bashFloor'), 'Guard floor multiplier'), 'Guard bash line')));
    const inverted = finite(p.bashStat(actor, context, 'bashInvert'), 'Guard inversion') > 0;
    state.bashAt = inverted ? 1 - floor : floor;
    state.bashLow = inverted || undefined;
    state.bashArmAt = Math.max(0, finite(finite(bash.armTime ?? this.#config.armTime, 'Guard arm time')
      * finite(p.bashStat(actor, context, 'bashArmTime'), 'Guard arm multiplier'), 'Guard arm time'));
  }
}
