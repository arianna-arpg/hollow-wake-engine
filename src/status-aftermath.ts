import type {CombatPoint} from './combat-geometry.js';

export interface StatusBank {
  casterId?: number;
  brood?: {monsterId: string; perDamage: number; max: number; duration: number};
  broodAcc?: number;
  leechAcc?: number;
}
export interface StatusBankActor<A> {
  id: number; dead: boolean; level: number; team: string; pos: CombatPoint;
  radius: number; owner?: A; sourceSkillId?: string; lifelineId?: number; lifespan: number;
  statuses: StatusBank[];
  healBy(amount: number): number;
}
export interface StatusBankServices<A> {
  bodies: {create(id: string, level: number, team: string, owner: A): A};
  births: {lifeline(owner: A): number | undefined};
}
export interface StatusBankPorts<A> {
  actors(): A[];
  random(): number;
  clamp(at: CombatPoint, radius: number): CombatPoint;
  emerge(body: A, options: {host: true}): void;
  resourceFlow(recipient: A, source: A, amount: number): void;
}

/** Timer payouts over the live actor graph. The bank is cleared before any
 * reentrant birth/heal operation. The cap belongs to the exact applier, not its
 * controlling player, matching the authored brood and DoT-leech contracts. */
export class StatusAftermath<A extends StatusBankActor<A>> {
  constructor(readonly services: StatusBankServices<A>, readonly ports: StatusBankPorts<A>) {}
  brood(actor: A): void {
    const p = this.ports;
    for (const status of actor.statuses) {
      if (!status.brood || !((status.broodAcc ?? 0) > 0)) continue;
      const probability = (status.broodAcc ?? 0) * status.brood.perDamage;
      status.broodAcc = 0;
      if (!(p.random() < Math.min(.35, probability))) continue;
      const owner = status.casterId === undefined ? undefined : p.actors().find(a => a.id === status.casterId && !a.dead);
      if (!owner) continue;
      const key = '__brood:' + status.brood.monsterId;
      if (p.actors().filter(a => a.owner === owner && !a.dead && a.sourceSkillId === key).length >= status.brood.max) continue;
      const child = this.services.bodies.create(status.brood.monsterId, owner.level, owner.team, owner);
      child.sourceSkillId = key;
      child.lifelineId = this.services.births.lifeline(owner);
      child.lifespan = status.brood.duration;
      child.pos = p.clamp({x: actor.pos.x + (-24 + p.random() * 48), y: actor.pos.y + (-24 + p.random() * 48)}, child.radius);
      p.actors().push(child);
      p.emerge(child, {host: true});
    }
  }
  leech(actor: A): void {
    const p = this.ports;
    for (const status of actor.statuses) {
      if (!status.leechAcc || status.leechAcc <= 0 || status.casterId === undefined) continue;
      const amount = status.leechAcc;
      status.leechAcc = 0;
      const owner = p.actors().find(a => a.id === status.casterId && !a.dead);
      if (owner) p.resourceFlow(owner, actor, owner.healBy(amount));
    }
  }
}
