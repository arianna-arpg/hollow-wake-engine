import {advanceCastProgress} from './casting.js';
import {advanceFocusCast, focusFizzleCooldown, focusWithinReach, pressCastTiming,
  type CastTimingCue, type FocusCastSpec} from './interactive-casting.js';
import type {ChannelCastSpec} from './channel-casting.js';
import type {DispatchCast} from './skill-dispatch.js';
import type {ResourceCost} from './resource-payment.js';
import {finite} from './validation.js';

export interface ContinuationInstance {
  readonly def: {readonly id: string; readonly cooldown: number; readonly concentration?: FocusCastSpec};
}
export interface ContinuationCast<I, Aim, Id = number> extends DispatchCast<I, Aim, Id> {
  aiHold?: number;
  aiRecovery?: number;
  aiClickAt?: number;
  losLost?: number;
  pressUsed?: boolean;
  empowered?: number;
  focusBroken?: boolean;
}
export interface ContinuationActor<S, Aim, Id = number> {
  casting: S | null;
  shellGuard?: {fromAura?: string};
  useLock: number;
  readonly cooldowns: Map<string, number>;
  readonly cooldownTotals: Map<string, number>;
  readonly pos: Aim;
  readonly radius: number;
  readonly dead: boolean;
  readonly downed?: boolean;
  readonly untargetable?: boolean;
  readonly clingTo?: {readonly id: Id};
  readonly aiTargetId?: Id;
}
export interface ContinuationDelivery<Target> {
  targetInfo?: Target;
  dmgMult: number;
  paidCost?: ResourceCost;
  chargesSpent?: number;
  repeat?: number;
  ventRounds?: number;
}
export interface ContinuationVesselSpec {
  type: 'construct'; kind: 'eruptor'; range: number; duration: number;
  maxActive: number; life: number; placeRange: number; interval: number;
}
export type ContinuationStat = 'invisible' | 'cooldownRecovery' | 'channelPersist';
export interface CastingContinuationConfig {channelGrace: number; focusSlack: number}

/** Synchronous ports over borrowed live state. Readers are pure observations.
 * Sinks can affect later observations; errors propagate without rollback.
 * Mode advance ports bind the existing guard/channel/charged runtime services.
 * The click port re-enters the host's public click entry, including observers. */
export interface CastingContinuationPorts<A, I, S, Aim, Target, Tags, Mods, Id> {
  stunned(actor: A): boolean;
  lowerGuard(actor: A, inst: I): void;
  feedback(actor: A, state: S, kind: 'interrupt' | 'fizzle'): void;
  updateAim(actor: A): void;
  seated(actor: A): boolean;
  primary(actor: A): boolean;
  actor(id: Id): A | undefined;
  /** Mutate the existing aim without replacing its identity. */
  assignAim(aim: Aim, position: Aim): void;
  /** Return a fresh owned value preserving every host dimension. */
  copyAim(aim: Aim): Aim;
  channel(inst: I): ChannelCastSpec | undefined;
  random(): number;
  hold(state: S): number;
  needsFireLine(actor: A, inst: I): boolean;
  lineOfFire(actor: A, prey: A): boolean;
  finesse(actor: A): {readonly chance: number} | undefined;
  click(actor: A): void;
  distance(a: Aim, b: Aim): number;
  tags(inst: I): Tags;
  mods(inst: I): Mods;
  stat(actor: A, id: ContinuationStat, tags?: Tags, mods?: Mods): number;
  target(position: Aim, actor?: A): Target;
  deliver(actor: A, inst: I, aim: Aim, options: ContinuationDelivery<Target>): void;
  advanceGuard(actor: A, state: S, dt: number): void;
  advanceChannel(actor: A, state: S, dt: number, target: Target | undefined): void;
  advanceCharged(actor: A, dt: number): void;
  plantTotem(actor: A, inst: I, aim: Aim): void;
  spawnChannelVessel(actor: A, inst: I, spec: ContinuationVesselSpec, aim: Aim):
    {construct?: {holdOnce?: boolean}} | null | undefined;
  acted(actor: A): void;
  timingBonus(inst: I): number | undefined;
  timingCue(actor: A, cue: CastTimingCue, aim: Aim): void;
  flawless(actor: A, aim: Aim, inst: I): void;
}

/** One controller per simulation, with no actor cache or retained update result.
 * Configuration is copied once. The host owns frame scheduling and cast state. */
export class CastingContinuation<
  A extends ContinuationActor<S, Aim, Id>, I extends ContinuationInstance,
  S extends ContinuationCast<I, Aim, Id>, Aim, Target, Tags, Mods, Id = number
> {
  private readonly channelGrace: number;
  private readonly focusSlack: number;
  constructor(private readonly ports: CastingContinuationPorts<A, I, S, Aim, Target, Tags, Mods, Id>,
    config: CastingContinuationConfig) {
    this.channelGrace = finite(config.channelGrace, 'Channel sight grace');
    this.focusSlack = finite(config.focusSlack, 'Focus slack');
    if (this.channelGrace < 0 || this.focusSlack < 0) throw new Error('Continuation configuration must be nonnegative');
  }

  advance(actor: A, dt: number): void {
    const cs = actor.casting;
    if (!cs) return;
    const p = this.ports;
    if (p.stunned(actor)) {
      if (cs.mode === 'guard') p.lowerGuard(actor, cs.inst);
      if (actor.shellGuard?.fromAura === cs.inst.def.id) actor.shellGuard = undefined;
      actor.casting = null;
      p.feedback(actor, cs, 'interrupt');
      return;
    }
    p.updateAim(actor);
    if (actor.clingTo && !p.seated(actor)) {
      const ridden = p.actor(actor.clingTo.id);
      if (ridden && !ridden.dead) p.assignAim(cs.aim, ridden.pos);
    }
    const def = cs.inst.def, targetInfo = cs.targetInfo as Target | undefined;
    // Preserve the original primary-player predicate and pre-advance clock.
    if ((cs.mode === 'channel' || cs.mode === 'charge'
      || cs.mode === 'guard' || cs.mode === 'overcharge') && !p.primary(actor)) {
      const ch = cs.mode === 'channel' ? (cs.gather ?? p.channel(cs.inst)) : undefined;
      cs.aiHold ??= ch?.release?.requireFull ? (ch.maxHold ?? 4) + .5
        : ch?.brim ? ch.brim.fillTime + .4 : this.random(1.2, 2.6);
      const hold = cs.mode === 'charge' ? Math.min(cs.aiHold, cs.total) : p.hold(cs);
      cs.held = (cs.mode === 'charge' ? cs.elapsed : cs.channelTime ?? 0) < hold;
      if (cs.held && cs.mode === 'channel') {
        const prey = actor.aiTargetId !== undefined ? p.actor(actor.aiTargetId) : undefined;
        if (prey && !prey.dead && p.needsFireLine(actor, cs.inst) && !p.lineOfFire(actor, prey)) {
          cs.losLost = (cs.losLost ?? 0) + dt;
          if (cs.losLost >= this.channelGrace) cs.held = false;
        } else if (cs.losLost) cs.losLost = 0;
      }
    }
    if ((cs.mode === 'perfect' || cs.mode === 'timed') && !cs.pressUsed && !p.seated(actor)) {
      if (cs.aiClickAt === undefined) {
        const finesse = p.finesse(actor);
        if (!finesse) cs.aiClickAt = -1;
        else if (p.random() < finesse.chance) {
          cs.aiClickAt = cs.mode === 'perfect' ? this.random(.78, .96)
            : Math.max(.04, Math.min(.96, (cs.indicatorAt ?? .5) + this.random(-.05, .05)));
        } else {
          cs.aiClickAt = cs.mode === 'perfect' ? this.random(.15, .6)
            : Math.max(.04, Math.min(.96, (cs.indicatorAt ?? .5)
              + (p.random() < .5 ? -1 : 1) * this.random(.16, .35)));
        }
      }
      if (cs.aiClickAt >= 0 && cs.total > 0 && cs.elapsed / cs.total >= cs.aiClickAt) p.click(actor);
    }

    switch (cs.mode) {
      case 'concentration': {
        const spec = def.concentration!;
        const quarry = cs.quarryId !== undefined ? p.actor(cs.quarryId) : undefined;
        const live = !!quarry && !quarry.dead && !quarry.downed && !quarry.untargetable
          && p.stat(quarry, 'invisible') <= 0;
        if (!p.seated(actor) && live) cs.aim = p.copyAim(quarry.pos);
        const focused = cs.held && live
          && focusWithinReach(p.distance(cs.aim, quarry.pos), quarry.radius, spec.slack ?? this.focusSlack);
        const outcome = advanceFocusCast(cs, spec, dt, focused);
        if (!outcome) return;
        if (outcome.kind !== 'release') cs.aiRecovery = undefined;
        actor.casting = null;
        actor.useLock = .15;
        if (outcome.kind === 'release') {
          p.deliver(actor, cs.inst, p.copyAim(cs.aim), {
            targetInfo: live ? p.target(p.copyAim(quarry.pos), quarry) : p.target(p.copyAim(cs.aim)),
            dmgMult: cs.baseMult * outcome.multiplier,
            paidCost: cs.paidCost, chargesSpent: cs.chargesSpent,
          });
        } else {
          p.feedback(actor, cs, 'fizzle');
          if (def.cooldown > 0) {
            const tags = p.tags(cs.inst), extra = p.mods(cs.inst);
            const cd = focusFizzleCooldown(def.cooldown,
              p.stat(actor, 'cooldownRecovery', tags, extra), p.stat(actor, 'cooldownRecovery'));
            actor.cooldowns.set(def.id, cd);
            actor.cooldownTotals.set(def.id, cd);
          }
        }
        return;
      }
      case 'guard': p.advanceGuard(actor, cs, dt); return;
      case 'channel': p.advanceChannel(actor, cs, dt, targetInfo); return;
      case 'charge':
      case 'overcharge': p.advanceCharged(actor, dt); return;
      default:
        if (!advanceCastProgress(cs, dt)) return;
        actor.casting = null;
        actor.useLock = .1;
        if (cs.plantTotem) {
          p.plantTotem(actor, cs.inst, cs.aim);
          if (def.cooldown > 0) actor.cooldowns.set(def.id, def.cooldown);
          return;
        }
        if (cs.plantChannel) {
          const persist = p.stat(actor, 'channelPersist', p.tags(cs.inst), p.mods(cs.inst));
          const vessel = p.spawnChannelVessel(actor, cs.inst, {
            type: 'construct', kind: 'eruptor', range: 240, duration: Math.max(1.5, persist),
            maxActive: 2, life: 40, placeRange: 440, interval: .4,
          }, cs.aim);
          if (vessel?.construct) vessel.construct.holdOnce = true;
          if (def.cooldown > 0) actor.cooldowns.set(def.id, def.cooldown);
          return;
        }
        p.deliver(actor, cs.inst, cs.aim, {
          dmgMult: (cs.empowered ?? 1) * cs.baseMult,
          repeat: cs.mode === 'multitude' ? Math.max(1, cs.presses ?? 1) : 1,
          targetInfo, paidCost: cs.paidCost, chargesSpent: cs.chargesSpent, ventRounds: cs.ventRounds,
        });
    }
  }

  press(actor: A): void {
    const p = this.ports;
    p.acted(actor);
    const cs = actor.casting;
    if (!cs) return;
    const cue = pressCastTiming(cs, p.timingBonus(cs.inst));
    if (cue) {
      p.timingCue(actor, cue, cs.aim);
      p.flawless(actor, p.copyAim(cs.aim), cs.inst);
    }
  }

  private random(lo: number, hi: number): number {return lo + this.ports.random() * (hi - lo);}
}
