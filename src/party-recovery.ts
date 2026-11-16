export interface RecoveryBody {
  dead: boolean; downed: boolean; life: number; mana: number; casting: unknown;
  pos: {x: number; y: number}; tier?: number;
  maxLife(): number; maxMana(): number; isQuiescent(): boolean;
}
export interface RecoverySeat<A> {
  id: string; actor: A; merc?: unknown; lastActedAt: number;
  reviveDwellBy: Map<string, number>;
}
export interface PartyRecoveryPorts<A, S> {
  seats(): readonly S[]; time(): number;
  reachable(ally: A, fallen: A): boolean;
  defeated(actor: A, killer?: A): void;
  downed(actor: A, killer?: A): void;
  revived(seat: S): void;
}

/** Combat defeat and cooperative recovery. Campaign respawn, corpse reclaim,
 * narrative fall interception and save handling belong to optional consumers. */
export class PartyRecovery<A extends RecoveryBody, S extends RecoverySeat<A>> {
  constructor(readonly rules: {mercsCanRevive: boolean; radius: number; dwell: number; lifeFraction: number; idleGrace: number},
    readonly ports: PartyRecoveryPorts<A, S>) {}
  down(actor: A, killer?: A): void {
    const seats = this.ports.seats();
    if (!seats.some(s => s.actor !== actor && !s.actor.dead && !s.actor.downed
      && (!s.merc || this.rules.mercsCanRevive))) {
      this.ports.defeated(actor, killer); return;
    }
    actor.dead = false; actor.downed = true; actor.life = 0; actor.casting = null;
    seats.find(s => s.actor === actor)?.reviveDwellBy.clear();
    this.ports.downed(actor, killer);
  }
  revive(seat: S): void {
    const actor = seat.actor;
    actor.downed = false; actor.dead = false;
    actor.life = Math.max(1, actor.maxLife() * this.rules.lifeFraction);
    actor.mana = actor.maxMana(); seat.reviveDwellBy.clear();
    this.ports.revived(seat);
  }
  advance(dt: number): void {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError('Recovery duration must be finite and nonnegative');
    const seats = this.ports.seats();
    for (const seat of seats) {
      if (!seat.actor.downed) { if (seat.reviveDwellBy.size) seat.reviveDwellBy.clear(); continue; }
      for (const ally of seats) {
        if (ally === seat || ally.actor.dead || ally.actor.downed) continue;
        const close = Math.hypot(ally.actor.pos.x - seat.actor.pos.x, ally.actor.pos.y - seat.actor.pos.y) <= this.rules.radius
          && this.ports.reachable(ally.actor, seat.actor);
        if (close && this.ports.time() - ally.lastActedAt >= this.rules.idleGrace && ally.actor.isQuiescent()) {
          const elapsed = (seat.reviveDwellBy.get(ally.id) ?? 0) + dt;
          seat.reviveDwellBy.set(ally.id, elapsed);
          if (elapsed >= this.rules.dwell) {this.revive(seat); break;}
        } else seat.reviveDwellBy.delete(ally.id);
      }
    }
  }
}
