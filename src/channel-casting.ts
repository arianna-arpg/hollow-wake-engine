import {finite} from './validation.js';

export interface ChannelRamp { per: number; max: number; curve?: 'linear' | 'quadratic' | 'exponential' }
export type ChannelCurve = 'linear' | 'quadIn' | 'quadOut' | 'cubicIn' | 'cubicOut'
  | 'expoIn' | 'expoOut' | 'sqrt' | 'smooth' | 'breath';
export interface ChannelBrimSpec {
  fillTime: number;
  decay?: number;
  bankAt?: number;
  minRelease?: number;
  spend?: boolean;
  autoRelease?: boolean;
  minScale?: number;
  maxScale?: number;
  curve?: ChannelCurve;
}
export interface ChannelCastSpec {
  interval: number;
  windup?: number;
  intervalJitter?: readonly [number, number];
  trackAim?: boolean;
  turnRate?: number;
  maxHold?: number;
  cooldownOnEnd?: boolean;
  ramp?: ChannelRamp;
  rampAoe?: ChannelRamp;
  rampArc?: ChannelRamp;
  costRamp?: ChannelRamp;
  brim?: ChannelBrimSpec;
  release?: {minHold?: number; requireFull?: boolean; pulses?: boolean; dmgRamp?: ChannelRamp; aoeRamp?: ChannelRamp};
  releaseDetonate?: {damageScale: number};
  persist?: {perHeldSec: number; maxDuration?: number; minHold?: number; fade?: number};
}
export interface ChannelCastState {
  held: boolean;
  total: number;
  baseMult: number;
  channelTime?: number;
  pulseTimer?: number;
  hitCap?: boolean;
  finishRolled?: boolean;
  trigBeat?: number;
  runeTick?: number;
  hitSpool?: number;
  gather?: ChannelCastSpec;
}
export interface ChannelBrim { fill: number }
export interface ChannelCost { mana: number; life: number }
export interface ChannelRelease { dmgMult: number; aoeMult: number; noCooldown: boolean }
export interface ChannelPulse {
  dmgMult: number;
  aoeMult: number;
  arcMult?: number;
  bonusProjectiles: number;
  paidCost?: ChannelCost;
}
export interface ChannelPersistence {
  interval: number;
  timer: number;
  remaining: number;
  total: number;
  powerMult: number;
  fade: number;
}
export type ChannelPulseStat = 'channelRamp' | 'channelSpool' | 'channelHitSpool' | 'channelSpoolCap';

/** Reads are pure within a phase, but sinks may change observations of later
 * phases. In particular, context is captured before payment and its values
 * are queried after payment. A whole-update stat snapshot is not equivalent. */
export interface ChannelCastingPorts<A, S extends ChannelCastState, T, C> {
  spec(state: S): ChannelCastSpec;
  dead(actor: A): boolean;
  stat(actor: A, state: S, key: 'effectDuration' | 'brimFill' | 'brimPower'): number;
  speed(actor: A, state: S): number;
  /** Ensure the bank exists and refresh its instance/spec binding. */
  brim(actor: A, state: S, spec: ChannelBrimSpec): ChannelBrim;
  /** Lookup again after release effects; do not create a missing bank. */
  releaseBrim(actor: A, state: S): ChannelBrim | undefined;
  trigger(actor: A, state: S, event: 'channelFinish' | 'channelBeat'): void;
  tapFinish(actor: A, state: S): void;
  rune(actor: A, state: S): void;
  /** Host owns spatial conventions. Return whether delivery uses live aim. */
  aim(actor: A, state: S, spec: ChannelCastSpec, dt: number): boolean;
  /** Clear active casting and set recovery before any release sink. */
  end(actor: A, state: S, recovery: number): void;
  cooldown(state: S): number;
  stampCooldown(actor: A, state: S, duration: number): void;
  /** Host-specific detonation/body creation, including their live death gates. */
  releaseEffects(actor: A, state: S, spec: ChannelCastSpec): void;
  release(actor: A, state: S, track: boolean, payload: ChannelRelease, initialTarget: T | undefined): void;
  persist(actor: A, state: S, plan: ChannelPersistence): void;
  supports(actor: A, state: S, dt: number): void;
  /** null = targeted pulse has no recipient; undefined = no targeting required. */
  target(actor: A, state: S): T | null | undefined;
  context(state: S): C;
  cost(actor: A, state: S): ChannelCost;
  canAfford(actor: A, cost: ChannelCost): boolean;
  pay(actor: A, state: S, cost: ChannelCost): void;
  random(): number;
  pulseStat(actor: A, context: C, key: ChannelPulseStat): number;
  construct(actor: A): boolean;
  pulse(actor: A, state: S, track: boolean, target: T | undefined, payload: ChannelPulse): void;
  cue(actor: A, state: S, kind: 'ready' | 'fizzle' | 'gather'): void;
}

function nonnegative(n: number, label: string): number {
  if (finite(n, label) < 0) throw new Error(`${label} must be nonnegative`);
  return n;
}
function positive(n: number, label: string): number {
  if (finite(n, label) <= 0) throw new Error(`${label} must be positive`);
  return n;
}
export function channelInterval(interval: number, speed: number): number {
  return Math.max(.1, finite(nonnegative(interval, 'Channel interval') / positive(speed, 'Channel speed'), 'Channel interval'));
}
export function channelWindup(windup: number, speed: number): number {
  return Math.max(0, finite(finite(windup, 'Channel windup') / positive(speed, 'Channel speed'), 'Channel windup'));
}
export function channelRamp(r: ChannelRamp, time: number): number {
  nonnegative(time, 'Channel ramp time'); finite(r.per, 'Channel ramp rate'); finite(r.max, 'Channel ramp cap');
  if (r.curve !== undefined && r.curve !== 'linear' && r.curve !== 'quadratic' && r.curve !== 'exponential') throw new Error('Unknown channel ramp');
  return finite(Math.min(r.max, r.per * (r.curve === 'quadratic' ? time * time
    : r.curve === 'exponential' ? Math.pow(2, time) - 1 : time)), 'Channel ramp');
}
export function channelCurve(kind: ChannelCurve | undefined, fill: number): number {
  const t = Math.min(1, Math.max(0, finite(fill, 'Channel curve fill')));
  switch (kind) {
    case undefined: case 'linear': return t;
    case 'quadIn': return t * t;
    case 'quadOut': return 1 - (1 - t) * (1 - t);
    case 'cubicIn': return t * t * t;
    case 'cubicOut': return 1 - Math.pow(1 - t, 3);
    case 'expoIn': return t <= 0 ? 0 : Math.pow(2, 10 * (t - 1));
    case 'expoOut': return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
    case 'sqrt': return Math.sqrt(Math.max(0, t));
    case 'smooth': return t * t * (3 - 2 * t);
    case 'breath': return Math.sin(Math.PI * t);
    default: throw new Error('Unknown channel curve');
  }
}

/** Borrowed persistent pulse state. null means expired/dead; undefined means
 * still waiting; a number is this update's one pulse multiplier. Expiry wins
 * over a due pulse. The host owns removal, ordering, identity and delivery. */
export function advanceChannelPersistence(state: ChannelPersistence, dt: number, dead: boolean): number | null | undefined {
  nonnegative(dt, 'Persistence frame');
  const remaining = finite(finite(state.remaining, 'Persistence remaining') - dt, 'Persistence remaining');
  state.remaining = remaining;
  if (dead || remaining <= 0) return null;
  state.timer = finite(finite(state.timer, 'Persistence timer') - dt, 'Persistence timer');
  if (state.timer > 0) return undefined;
  state.timer = finite(state.timer + positive(state.interval, 'Persistence interval'), 'Persistence timer');
  const lived = 1 - remaining / positive(state.total, 'Persistence total');
  return finite(finite(state.powerMult, 'Persistence power') * (1 + (finite(state.fade, 'Persistence fade') - 1) * lived), 'Persistence pulse');
}

/** One simulation binding over borrowed cast and bank records. Synchronous
 * sinks must not throw or reenter; completed side effects are not rolled back.
 * Shared admission, interrupts, movement and input run in the host beforehand.
 * Work per update is bounded: at most one trigger beat, rune and paid pulse. */
export class ChannelCasting<A, S extends ChannelCastState, T = never, C = undefined> {
  readonly #ports: ChannelCastingPorts<A, S, T, C>;
  readonly #beatInterval: number;
  #busy = false;

  constructor(ports: ChannelCastingPorts<A, S, T, C>, beatInterval: number) {
    this.#beatInterval = positive(beatInterval, 'Channel trigger interval');
    const bound = {} as ChannelCastingPorts<A, S, T, C>;
    for (const key of ['spec', 'dead', 'stat', 'speed', 'brim', 'releaseBrim', 'trigger', 'tapFinish', 'rune',
      'aim', 'end', 'cooldown', 'stampCooldown', 'releaseEffects', 'release', 'persist', 'supports', 'target',
      'context', 'cost', 'canAfford', 'pay', 'random', 'pulseStat', 'construct', 'pulse', 'cue'] as const) {
      const fn = ports[key];
      if (typeof fn !== 'function') throw new Error(`Channel casting ${key} port is required`);
      Object.defineProperty(bound, key, {value: fn.bind(ports), enumerable: true});
    }
    this.#ports = bound;
  }

  advance(actor: A, state: S, dt: number, initialTarget?: T): void {
    nonnegative(dt, 'Channel frame');
    if (this.#busy) throw new Error('Reentrant channel casting operation');
    this.#busy = true;
    try {
      positive(state.total, 'Channel initial interval'); finite(state.baseMult, 'Channel base multiplier');
      const p = this.#ports, ch = p.spec(state);
      state.channelTime = finite(nonnegative(state.channelTime ?? 0, 'Channel held time') + dt, 'Channel held time');
      if (ch.maxHold !== undefined && state.channelTime >= finite(nonnegative(ch.maxHold, 'Channel cap')
        * nonnegative(p.stat(actor, state, 'effectDuration'), 'Channel duration multiplier'), 'Channel cap')) {
        state.held = false; state.hitCap = true;
        this.#finish(actor, state);
      }
      if (ch.brim) {
        const bank = p.brim(actor, state, ch.brim);
        const rate = positive(p.speed(actor, state), 'Channel speed')
          * nonnegative(p.stat(actor, state, 'brimFill'), 'Brim fill multiplier')
          / Math.max(.2, nonnegative(ch.brim.fillTime, 'Brim fill time'));
        const before = nonnegative(bank.fill, 'Brim fill');
        bank.fill = Math.min(1, finite(before + dt * rate, 'Brim fill'));
        if (before < 1 && bank.fill >= 1) {
          p.cue(actor, state, 'ready'); this.#finish(actor, state);
          if (ch.brim.autoRelease) { state.held = false; state.hitCap = true; }
        }
        if (bank.fill >= 1) state.hitCap = true;
      }
      state.trigBeat = finite(finite(state.trigBeat ?? this.#beatInterval, 'Channel beat timer') - dt, 'Channel beat timer');
      if (state.trigBeat <= 0) {
        state.trigBeat += this.#beatInterval;
        p.trigger(actor, state, 'channelBeat');
      }
      state.runeTick = finite(nonnegative(state.runeTick ?? 0, 'Channel rune timer') + dt, 'Channel rune timer');
      if (state.runeTick >= 1) { state.runeTick -= 1; p.rune(actor, state); }
      const track = p.aim(actor, state, ch, dt);
      if (!state.held || p.dead(actor)) { this.#release(actor, state, ch, track, initialTarget); return; }
      p.supports(actor, state, dt);
      state.pulseTimer = finite(finite(state.pulseTimer ?? 0, 'Channel pulse timer') - dt, 'Channel pulse timer');
      if (state.pulseTimer > 0) return;
      const target = p.target(actor, state);
      if (target === null) { state.pulseTimer += state.total; return; }
      const time = state.channelTime, context = p.context(state), cost = p.cost(actor, state);
      nonnegative(cost.mana, 'Channel mana cost'); nonnegative(cost.life, 'Channel life cost');
      if (state.gather?.brim) {
        const fraction = nonnegative(state.gather.interval, 'Gather interval') / Math.max(.2, nonnegative(state.gather.brim.fillTime, 'Gather fill time'));
        cost.mana *= fraction; cost.life *= fraction;
      }
      if (ch.costRamp) { const mult = 1 + channelRamp(ch.costRamp, time); cost.mana *= mult; cost.life *= mult; }
      nonnegative(cost.mana, 'Scaled channel mana cost'); nonnegative(cost.life, 'Scaled channel life cost');
      if (!p.canAfford(actor, cost)) { state.held = false; return; }
      p.pay(actor, state, cost);
      let jitter = 1;
      if (ch.intervalJitter) {
        const lo = nonnegative(ch.intervalJitter[0], 'Channel jitter minimum'), hi = nonnegative(ch.intervalJitter[1], 'Channel jitter maximum');
        if (hi < lo) throw new Error('Channel jitter bounds are reversed');
        const roll = nonnegative(p.random(), 'Channel jitter draw');
        if (roll >= 1) throw new Error('Channel jitter draw must be in [0, 1)');
        jitter = lo + roll * (hi - lo);
      }
      state.pulseTimer = finite(state.pulseTimer + state.total * jitter, 'Channel pulse timer');
      const rampStat = finite(p.pulseStat(actor, context, 'channelRamp'), 'Channel ramp stat');
      const dmg = Math.max(.1, 1 + (ch.ramp ? channelRamp(ch.ramp, time) : 0) + (rampStat > 0 ? Math.min(1.5, rampStat * time) : 0));
      const aoe = Math.max(.15, 1 + (ch.rampAoe ? channelRamp(ch.rampAoe, time) : 0));
      const arc = Math.max(.1, 1 + (ch.rampArc ? channelRamp(ch.rampArc, time) : 0));
      const spool = finite(p.pulseStat(actor, context, 'channelSpool'), 'Channel spool');
      const hitSpool = finite(p.pulseStat(actor, context, 'channelHitSpool'), 'Channel hit spool');
      const spooled = Math.min(Math.floor(finite(p.pulseStat(actor, context, 'channelSpoolCap'), 'Channel spool cap')),
        (spool > 0 ? Math.floor(spool * time) : 0) + (hitSpool > 0 ? Math.floor(hitSpool * nonnegative(state.hitSpool ?? 0, 'Channel hit count')) : 0));
      if (ch.release?.pulses === false) { p.cue(actor, state, 'gather'); return; }
      p.pulse(actor, state, track, target, {
        dmgMult: finite(dmg * state.baseMult, 'Channel pulse power'), aoeMult: aoe,
        arcMult: ch.rampArc ? arc : undefined, bonusProjectiles: finite(spooled, 'Channel bonus projectiles'),
        paidCost: p.construct(actor) ? undefined : {mana: cost.mana, life: cost.life},
      });
    } finally { this.#busy = false; }
  }

  #finish(actor: A, state: S): void {
    if (state.finishRolled) return;
    state.finishRolled = true;
    this.#ports.trigger(actor, state, 'channelFinish');
    this.#ports.tapFinish(actor, state);
  }

  #release(actor: A, state: S, ch: ChannelCastSpec, track: boolean, initialTarget: T | undefined): void {
    const p = this.#ports, rel = ch.release, time = state.channelTime!;
    p.end(actor, state, .15);
    const cooldown = nonnegative(p.cooldown(state), 'Channel cooldown');
    if (cooldown > 0 && ch.cooldownOnEnd) p.stampCooldown(actor, state, cooldown);
    p.releaseEffects(actor, state, ch);
    if (rel && !p.dead(actor) && time >= nonnegative(rel.minHold ?? 0, 'Channel minimum hold')) {
      const brim = ch.brim, bank = brim ? p.releaseBrim(actor, state) : undefined;
      const fill = nonnegative(bank?.fill ?? 0, 'Release brim fill');
      if ((brim !== undefined && fill < nonnegative(brim.minRelease ?? 0, 'Brim release floor')) || (rel.requireFull && !state.hitCap)) {
        p.cue(actor, state, 'fizzle');
      } else {
        const power = brim ? Math.max(.05, ((finite(brim.minScale ?? .25, 'Brim minimum scale'))
          + (finite(brim.maxScale ?? 1, 'Brim maximum scale') - (brim.minScale ?? .25)) * channelCurve(brim.curve, fill))
          * finite(p.stat(actor, state, 'brimPower'), 'Brim power'))
          : Math.max(.1, 1 + (rel.dmgRamp ? channelRamp(rel.dmgRamp, time) : 0));
        p.release(actor, state, track, {
          dmgMult: finite(power * state.baseMult, 'Channel release power'),
          aoeMult: Math.max(.15, 1 + (rel.aoeRamp ? channelRamp(rel.aoeRamp, time) : 0)),
          noCooldown: !!ch.cooldownOnEnd,
        }, initialTarget);
        if (brim && bank && (brim.spend ?? true)) bank.fill = 0;
      }
    }
    if (ch.persist && !p.dead(actor) && time >= nonnegative(ch.persist.minHold ?? .4, 'Persistence minimum hold')) {
      const total = finite(Math.min(nonnegative(ch.persist.maxDuration ?? 8, 'Persistence maximum'),
        time * nonnegative(ch.persist.perHeldSec, 'Persistence duration rate'))
        * nonnegative(p.stat(actor, state, 'effectDuration'), 'Persistence duration multiplier'), 'Persistence duration');
      if (total > .1) p.persist(actor, state, {
        interval: channelInterval(ch.interval, p.speed(actor, state)), timer: 0, remaining: total, total,
        powerMult: Math.max(.1, finite((1 + (ch.ramp ? channelRamp(ch.ramp, time) : 0)) * state.baseMult, 'Persistence power')),
        fade: finite(ch.persist.fade ?? .35, 'Persistence fade'),
      });
    }
  }
}
