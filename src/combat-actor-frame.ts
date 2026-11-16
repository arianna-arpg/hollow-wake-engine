import type {StatusDamageType, StatusTick} from './status-lifecycle-types.js';
import type {ProcGainEvent} from './proc-types.js';

export interface FrameActor {
  life: number; dead: boolean; esBroke: boolean; recentHurt: number;
  gainEvents: ProcGainEvent[];
  updateTimers(dt: number, chronoDt: number, onDotTick?: StatusTick): Partial<Record<StatusDamageType | 'untyped', number>> | null;
}
/** All algorithms here bind to SDK controllers in the authored owner. The
 * host-facing phase between bank payout and ledger upkeep is restricted to
 * physical/body facts and presentation; it does not implement combat rules. */
export interface ActorFrameServices<A> {
  damage: {applyDot(actor: A, amount: number, type?: StatusDamageType): void};
  procs: {own(actor: A, trigger: 'esBreak'): void; talents(actor: A): boolean; gain(actor: A, event: ProcGainEvent): void};
  triggers: {damageTaken(actor: A, amount: number): void; defense(actor: A): void};
  pours: {release(actor: A): void};
  gauges: {sample(actor: A): void};
  sympathy: {echo(actor: A, event: ProcGainEvent): void};
  banks: {brood(actor: A): void; leech(actor: A): void};
  ledgers: {advance(actor: A, dt: number): void};
  death: {kill(actor: A): void};
  statuses: {expireStatuses(actor: A): void; zapStatuses(actor: A): void; lashStatuses(actor: A): void};
  ironWard: {advance(actor: A): void};
}
export interface ActorFramePorts<A, R = void> {
  afterTimers(actor: A): void;
  afterBanks(actor: A, dt: number): R;
  dotText(actor: A, raw: number, dt: number): void;
  /** Optional observation. Damage still executes when campaign hooks are absent. */
  dotApplied?(actor: A, amount: number, type: StatusDamageType | 'untyped', lifeBefore: number): void;
}

/** Ordered combat portion of an actor frame, before cast continuation.
 * DoT totals returned by ActorTimers are NOT already-applied damage. Each type
 * must go through the same damage service used by direct hits. */
export class CombatActorFrame<A extends FrameActor, R = void> {
  constructor(readonly services: ActorFrameServices<A>, readonly ports: ActorFramePorts<A, R>) {}
  advance(actor: A, dt: number, chronoDt = dt, onDotTick?: StatusTick): R {
    if (!Number.isFinite(dt) || dt < 0 || !Number.isFinite(chronoDt) || chronoDt < 0) throw new RangeError('Combat frame duration must be finite and nonnegative');
    const s = this.services, p = this.ports;
    const dot = actor.updateTimers(dt, chronoDt, onDotTick);
    p.afterTimers(actor);
    if (dot) {
      let raw = 0;
      for (const [type, amount] of Object.entries(dot)) {
        if (!amount || amount <= 0) continue;
        raw += amount;
        const before = actor.life;
        s.damage.applyDot(actor, amount, type === 'untyped' ? undefined : type as StatusDamageType);
        p.dotApplied?.(actor, amount, type as StatusDamageType | 'untyped', before);
      }
      if (raw > 0) p.dotText(actor, raw, dt);
      if (actor.esBroke) {
        actor.esBroke = false;
        s.procs.own(actor, 'esBreak');
      }
      if (raw > 0) {
        s.triggers.damageTaken(actor, raw);
        actor.recentHurt = 0;
        s.pours.release(actor);
      }
    }
    s.triggers.defense(actor);
    if (s.procs.talents(actor)) s.gauges.sample(actor);
    if (actor.gainEvents.length) {
      const events = actor.gainEvents;
      actor.gainEvents = [];
      for (const event of events) {
        s.procs.gain(actor, event);
        s.sympathy.echo(actor, event);
      }
    }
    s.banks.brood(actor);
    s.banks.leech(actor);
    const phase = p.afterBanks(actor, dt);
    s.ledgers.advance(actor, dt);
    if (actor.life <= 0 && !actor.dead) s.death.kill(actor);
    s.statuses.expireStatuses(actor);
    s.statuses.zapStatuses(actor);
    s.statuses.lashStatuses(actor);
    s.ironWard.advance(actor);
    return phase;
  }
}
