import {finite} from './validation.js';
export interface ChargeCastSpec {
  maxTime: number;
  minScale?: number;
  maxScale?: number;
  aoeScaleMax?: number;
  arcTaper?: number;
  speedAtFull?: number;
}
export interface OverchargeCastSpec {
  stages: number;
  time: number;
  perStage: number;
  aoePerStage?: number;
  window?: number;
  windowBonus?: number;
  costPerStage?: number;
}
export interface StrikeTiming { kind: 'perfect' | 'timed'; bonus?: number }
export interface ChargedCastState {
  mode: 'charge' | 'overcharge';
  elapsed: number;
  total: number;
  held: boolean;
  baseMult: number;
  channelTime?: number;
  stage?: number;
  sinceStage?: number;
  sparkWindow?: number;
  indicatorAt?: number;
}
export interface ChargedCastCost { mana: number; life: number }
export interface ChargedCastRelease {
  dmgMult: number;
  aoeMult: number;
  arcMult?: number;
  speedMult?: number;
}
export interface ChargedCastingPorts<A, S extends ChargedCastState> {
  active(actor: A): S | null;
  dead(actor: A): boolean;
  chargeSpec(state: S): ChargeCastSpec;
  overchargeSpec(state: S): OverchargeCastSpec;
  stageLimit(actor: A, state: S, spec: OverchargeCastSpec): number;
  timing(state: S): StrikeTiming | undefined;
  sparkBonus(actor: A, state: S, spec: OverchargeCastSpec): number;
  /** Returns an owned, mutable quote; the stage fraction scales this object. */
  cost(actor: A, state: S): ChargedCastCost;
  canAfford(actor: A, cost: ChargedCastCost): boolean;
  pay(actor: A, state: S, cost: ChargedCastCost): void;
  random(): number;
  stageBanked(actor: A, state: S): void;
  /** Clear active state and set recovery before delivery. Must not throw. */
  end(actor: A, state: S, recovery: number): void;
  execute(actor: A, state: S, release: ChargedCastRelease): void;
  cue(actor: A, state: S, kind: 'perfect' | 'flawless' | 'spark'): void;
}

function nonnegative(value: number, label: string): number {
  if (finite(value, label) < 0) throw new Error(`${label} must be nonnegative`);
  return value;
}

/** These durations are quoted once at press; subsequent speed changes do not
 * resize the running bar. Charge duration uses effect duration, not cast speed. */
export function chargeCastDuration(maxTime: number, effectDuration: number): number {
  return Math.max(.2, finite(nonnegative(maxTime, 'Charge time')
    * nonnegative(effectDuration, 'Effect duration'), 'Charge duration'));
}
export function overchargeCastDuration(time: number, useTime: number, speed: number): number {
  if (finite(speed, 'Cast speed') <= 0) throw new Error('Cast speed must be positive');
  return Math.max(.2, finite(Math.max(nonnegative(time, 'Stage time'),
    nonnegative(useTime, 'Use time')) / speed, 'Stage duration'));
}
export function overchargeMarker(roll: number): number {
  if (finite(roll, 'Marker draw') < 0 || roll >= 1) throw new Error('Marker draw must be in [0, 1)');
  return .3 + roll * (.85 - .3);
}

/** Shared simulation binding over caller-owned active casts. Admission, aim,
 * ordinary resource clocks and interruption happen before this phase. Each
 * call performs at most one stage payment. Ports must not throw or reenter;
 * prior payments/state changes are not rolled back after an invalid input. */
export class ChargedCasting<A, S extends ChargedCastState> {
  readonly #ports: ChargedCastingPorts<A, S>;
  #busy = false;

  constructor(ports: ChargedCastingPorts<A, S>) {
    const bound = {} as ChargedCastingPorts<A, S>;
    for (const key of ['active', 'dead', 'chargeSpec', 'overchargeSpec', 'stageLimit',
      'timing', 'sparkBonus', 'cost', 'canAfford', 'pay', 'random', 'stageBanked',
      'end', 'execute', 'cue'] as const) {
      const fn = ports[key];
      if (typeof fn !== 'function') throw new Error(`Charged casting ${key} port is required`);
      Object.defineProperty(bound, key, {value: fn.bind(ports), enumerable: true});
    }
    this.#ports = bound;
  }

  advance(actor: A, dt: number): void {
    nonnegative(dt, 'Charged casting frame');
    if (this.#busy) throw new Error('Reentrant charged casting operation');
    this.#busy = true;
    try {
      const p = this.#ports, state = p.active(actor);
      if (!state) return;
      nonnegative(state.elapsed, 'Cast elapsed');
      nonnegative(state.total, 'Cast total');
      finite(state.baseMult, 'Cast base multiplier');
      if (state.mode === 'charge') this.#charge(actor, state, dt);
      else if (state.mode === 'overcharge') this.#overcharge(actor, state, dt);
      else throw new Error('Unsupported charged casting mode');
    } finally { this.#busy = false; }
  }

  #charge(actor: A, state: S, dt: number): void {
    const p = this.#ports;
    if (state.held && !p.dead(actor)) {
      state.elapsed = Math.min(state.total, finite(state.elapsed + dt, 'Charge progress'));
      return;
    }
    const spec = p.chargeSpec(state), fraction = state.total > 0 ? state.elapsed / state.total : 1;
    const lo = finite(spec.minScale ?? .5, 'Charge minimum'), hi = finite(spec.maxScale ?? 2, 'Charge maximum');
    const release: ChargedCastRelease = {
      dmgMult: (lo + (hi - lo) * fraction) * state.baseMult,
      aoeMult: 1 + (finite(spec.aoeScaleMax ?? 1.4, 'Charge area') - 1) * fraction,
      arcMult: spec.arcTaper !== undefined ? finite(spec.arcTaper, 'Charge arc') + (1 - spec.arcTaper) * fraction : undefined,
      speedMult: spec.speedAtFull !== undefined ? 1 + (finite(spec.speedAtFull, 'Charge speed') - 1) * fraction : undefined,
    };
    p.end(actor, state, .15);
    // The source invokes charge delivery even when death released the hold.
    p.execute(actor, state, release);
  }

  #overcharge(actor: A, state: S, dt: number): void {
    const p = this.#ports, spec = p.overchargeSpec(state);
    state.channelTime = finite((state.channelTime ?? 0) + dt, 'Overcharge held time');
    state.sinceStage = finite((state.sinceStage ?? 999) + dt, 'Time since stage');
    const maxStages = Math.max(1, Math.floor(finite(p.stageLimit(actor, state, spec), 'Stage limit')));
    if (state.held && !p.dead(actor)) {
      if ((state.stage ?? 0) < maxStages) {
        state.elapsed = finite(state.elapsed + dt, 'Stage progress');
        if (state.elapsed >= state.total) {
          const cost = p.cost(actor, state), per = nonnegative(spec.costPerStage ?? 1, 'Stage cost fraction');
          cost.mana = finite(nonnegative(cost.mana, 'Stage mana') * per, 'Stage mana');
          cost.life = finite(nonnegative(cost.life, 'Stage life') * per, 'Stage life');
          if (per > 0 && !p.canAfford(actor, cost)) state.elapsed = state.total;
          else {
            if (per > 0) p.pay(actor, state, cost);
            state.stage = (state.stage ?? 0) + 1;
            state.sinceStage = 0;
            state.elapsed = 0;
            if (state.indicatorAt !== undefined) state.indicatorAt = overchargeMarker(p.random());
            p.stageBanked(actor, state);
          }
        }
      }
      return;
    }
    const stages = state.stage ?? 0, timing = p.timing(state);
    const fraction = state.total > 0 ? state.elapsed / state.total : 0;
    let strikeMult = 1;
    if (timing?.kind === 'perfect' && fraction >= .72) strikeMult = 1 + finite(timing.bonus ?? .7, 'Perfect bonus');
    else if (timing?.kind === 'timed' && state.indicatorAt !== undefined
      && Math.abs(fraction - state.indicatorAt) <= .08) strikeMult = 1 + finite(timing.bonus ?? 1.2, 'Timed bonus');
    const sparkWindow = state.sparkWindow ?? 0;
    const spark = sparkWindow > 0 && stages > 0 && (state.sinceStage ?? 999) <= sparkWindow;
    const sparkMult = spark ? 1 + finite(p.sparkBonus(actor, state, spec), 'Spark bonus') : 1;
    p.end(actor, state, .15);
    if (!p.dead(actor)) {
      p.execute(actor, state, {
        dmgMult: (1 + finite(spec.perStage, 'Stage power') * stages) * strikeMult * sparkMult * state.baseMult,
        aoeMult: 1 + finite(spec.aoePerStage ?? 0, 'Stage area') * stages,
      });
      if (strikeMult > 1) p.cue(actor, state, timing?.kind === 'timed' ? 'flawless' : 'perfect');
      if (spark) p.cue(actor, state, 'spark');
    }
  }
}
