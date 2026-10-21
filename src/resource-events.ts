import {finite} from './validation.js';
import {gaugeAdd, gaugeShaveSec, type GaugeInstance, type GaugeSpec, type GaugeTerms} from './resource-gauges.js';
import type {ResourceFeed, ResourceTap} from './resource-content.js';

export type ResourceEvent = ResourceFeed['on'];
export interface ResourceEventSkill extends GaugeInstance {
  def: {id: string; gauge?: GaugeSpec & {feeds?: readonly ResourceFeed[]}};
}

/** Positions and victims are opaque host handles. Spatial units, elite identity,
 * equipped skills and randomness are explicit inputs, not global services. */
export interface ResourceEventPorts<A, I extends ResourceEventSkill, P, V> {
  skills(actor: A): readonly (I | null)[];
  taps(inst: I): readonly ResourceTap[];
  toggled(actor: A, inst: I): boolean;
  distance(actor: A, at: P): number;
  elite(victim: V): boolean;
  random(): number;
  gain(actor: A, inst: I, tap: ResourceTap): void;
  gaugeTerms(actor: A, inst: I): GaugeTerms;
  cooldown(actor: A, inst: I): number;
  setCooldown(actor: A, inst: I, seconds: number): void;
}

const EVENTS = new Set<ResourceEvent>([
  'hit', 'kill', 'takeHit', 'block', 'enemyDeath', 'allyDeath', 'second',
  'move', 'orbPickup', 'channelSecond', 'channelFinish', 'use',
]);

function event(value: ResourceEvent): void {
  if (!EVENTS.has(value)) throw new Error('Unknown resource event');
}
function nonnegative(value: number, label: string): number {
  if (finite(value, label) < 0) throw new Error(`${label} must be nonnegative`);
  return value;
}

/** One simulation binding, with no owned actor state or per-dispatch queue.
 * Ports observe coherent borrowed inputs. Sinks must not throw or reenter.
 * A dispatch commits in slot/tap order; an exception does not roll back earlier
 * awards or random draws. Hosts determine whether the underlying event occurred.
 * Timed events normally belong to ChargeRuntime, not a second event dispatch. */
export class ResourceEvents<A, I extends ResourceEventSkill, P = unknown, V = unknown> {
  readonly #ports: ResourceEventPorts<A, I, P, V>;
  readonly #deathRadius: number;
  #busy = false;

  constructor(ports: ResourceEventPorts<A, I, P, V>, tuning: {deathRadius: number}) {
    this.#deathRadius = nonnegative(tuning.deathRadius, 'Resource death radius');
    const bound = {} as ResourceEventPorts<A, I, P, V>;
    for (const key of ['skills', 'taps', 'toggled', 'distance', 'elite', 'random',
      'gain', 'gaugeTerms', 'cooldown', 'setCooldown'] as const) {
      const fn = ports[key];
      if (typeof fn !== 'function') throw new Error(`Resource event ${key} port is required`);
      Object.defineProperty(bound, key, {value: fn.bind(ports), enumerable: true});
    }
    this.#ports = bound;
  }

  #enter(): void {
    if (this.#busy) throw new Error('Reentrant resource event operation');
    this.#busy = true;
  }

  #chance(probability: number | undefined): boolean {
    if (probability === undefined) return true;
    nonnegative(probability, 'Resource probability');
    if (probability > 1) throw new Error('Resource probability exceeds one');
    // Even explicit zero and one consume a draw in the original game.
    const roll = finite(this.#ports.random(), 'Resource random draw');
    if (roll < 0 || roll >= 1) throw new Error('Resource random draw must be in [0, 1)');
    return roll < probability;
  }

  #fires(actor: A, inst: I, spec: ResourceFeed, on: ResourceEvent, at: P | undefined,
    orbKind: string | undefined, victim: V | undefined): boolean {
    const p = this.#ports;
    if (spec.on !== on) return false;
    if (spec.whileToggled && !p.toggled(actor, inst)) return false;
    if (on === 'enemyDeath' && at !== undefined) {
      const distance = nonnegative(p.distance(actor, at), 'Resource event distance');
      if (distance > nonnegative(spec.radius ?? this.#deathRadius, 'Resource radius')) return false;
    }
    if (on === 'orbPickup' && spec.orbKind && spec.orbKind !== orbKind) return false;
    if (spec.eliteVictim && (victim === undefined || !p.elite(victim))) return false;
    return this.#chance(spec.chance);
  }

  /** Filter order and strict chance threshold match equipped charge/gauge feeds.
   * Missing event position bypasses the death-radius check, as in Hollow Wake. */
  fires(actor: A, inst: I, spec: ResourceFeed, on: ResourceEvent, at?: P,
    orbKind?: string, victim?: V): boolean {
    event(on);
    this.#enter();
    try { return this.#fires(actor, inst, spec, on, at, orbKind, victim); }
    finally { this.#busy = false; }
  }

  /** Charges precede gauges for each slot. A successful gauge feed shaves an
   * active cooldown instead of banking; later feeds observe the new cooldown.
   * Locked, full and draining banks still reach their eligible chance rolls. */
  dispatch(actor: A, on: ResourceEvent, at?: P, orbKind?: string, victim?: V): void {
    event(on);
    this.#enter();
    try {
      const p = this.#ports;
      for (const inst of p.skills(actor)) {
        if (!inst) continue;
        for (const spec of p.taps(inst)) {
          if (this.#fires(actor, inst, spec, on, at, orbKind, victim)) p.gain(actor, inst, spec);
        }
        const gauge = inst.def.gauge;
        if (!gauge?.feeds) continue;
        for (const spec of gauge.feeds) {
          if (!this.#fires(actor, inst, spec, on, at, orbKind, victim)) continue;
          const terms = p.gaugeTerms(actor, inst);
          const cooldown = finite(p.cooldown(actor, inst), 'Resource skill cooldown');
          if (gauge.cooldownPer && cooldown > 0) {
            p.setCooldown(actor, inst, Math.max(0, cooldown - gaugeShaveSec(gauge, terms, spec.amount)));
            continue;
          }
          gaugeAdd(inst, spec.amount, terms);
        }
      }
    } finally { this.#busy = false; }
  }

}
