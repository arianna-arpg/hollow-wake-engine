import {finite} from './validation.js';

export type PaymentLane = 'mana' | 'life';
export interface ResourceCost { readonly mana: number; readonly life: number }
export interface PaymentDebt { debt: number; idle: number }
export interface PaymentState<L extends PaymentDebt = PaymentDebt> {
  mana: number; life: number; es: number;
  reservedMana: number; reservedLife: number;
  overdrive: {mana?: L; life?: L};
}
export interface PaymentSpec {
  readonly cap: number;
  readonly idleDelay?: number;
  readonly recoveryPct?: number;
  readonly recoveryFlat?: number;
  readonly regenFactor?: number;
}
export type PaymentStat = 'overdriveCap' | 'overdriveIdleDelay' | 'overdriveFlow'
  | 'overdriveRecovery' | 'overdriveRecoveryFlat' | 'overdriveLifeFactor';

/** Read ports are pure, coherent synchronous observations. Context is borrowed
 * for one phase. lifeSpent is a terminal sink after both resource commitments. */
export interface ResourcePaymentPorts<A, L extends PaymentDebt, C> {
  maxMana(actor: A): number;
  maxLife(actor: A): number;
  esToMana(actor: A): number;
  spec(loan: L): PaymentSpec | undefined;
  context(loan: L): C;
  stat(actor: A, context: C, stat: PaymentStat, base?: number): number;
  attackSpeed(actor: A): number;
  lifeSpent(actor: A, amount: number): void;
}

function nonnegative(value: number, name: string): void {
  if (finite(value, name) < 0) throw new Error(`${name} must be nonnegative`);
}
function checkCost(cost: ResourceCost): void {
  nonnegative(cost.mana, 'Mana price'); nonnegative(cost.life, 'Life price');
}

/** One immutable policy can serve multiple borrowed actors. This is resource
 * arithmetic, not cast admission or an atomic/durable transaction boundary. */
export class ResourcePayment<A extends PaymentState<L>, L extends PaymentDebt, C> {
  private readonly ports: Readonly<ResourcePaymentPorts<A, L, C>>;
  constructor(ports: ResourcePaymentPorts<A, L, C>) { this.ports = Object.freeze({...ports}); }

  availableMana(actor: A): number { return Math.max(0, this.ports.maxMana(actor) - actor.reservedMana); }
  lifeCeiling(actor: A): number { return Math.max(1, this.ports.maxLife(actor) - actor.reservedLife); }

  headroom(actor: A, lane: PaymentLane): number {
    const loan = actor.overdrive[lane];
    if (!loan) return 0;
    const p = this.ports, spec = p.spec(loan);
    if (!spec) return 0;
    const context = p.context(loan);
    const cap = p.stat(actor, context, 'overdriveCap', spec.cap)
      * (lane === 'mana' ? p.maxMana(actor) : p.maxLife(actor));
    const room = cap - loan.debt;
    return lane === 'mana'
      ? Math.max(0, Math.min(room, p.maxMana(actor) - actor.reservedMana))
      : Math.max(0, room);
  }

  canAfford(actor: A, cost: ResourceCost): boolean {
    checkCost(cost);
    const esMana = actor.es * this.ports.esToMana(actor);
    const manaOk = actor.mana + esMana >= cost.mana
      || cost.mana - (actor.mana + esMana) <= this.headroom(actor, 'mana');
    const lifeOk = actor.life > cost.life || cost.life <= this.headroom(actor, 'life');
    return manaOk && lifeOk;
  }

  /** No affordability preflight: unchecked calls preserve partial spending. */
  pay(actor: A, cost: ResourceCost): void {
    checkCost(cost);
    const p = this.ports;
    let due = cost.mana;
    const fromMana = Math.min(actor.mana, due);
    actor.mana -= fromMana; due -= fromMana;
    if (due > 0) {
      const usable = actor.es * p.esToMana(actor), fromEs = Math.min(usable, due);
      if (fromEs > 0) { actor.es -= fromEs; due -= fromEs; }
    }
    if (due > 0) {
      const loan = actor.overdrive.mana;
      if (loan) {
        const booked = Math.min(due, this.headroom(actor, 'mana'));
        loan.debt += booked; actor.reservedMana += booked;
        actor.mana = Math.min(actor.mana, this.availableMana(actor));
        loan.idle = this.idleDelay(actor, loan);
      }
    }
    if (cost.life > 0) {
      const loan = actor.overdrive.life;
      if (loan && actor.life <= cost.life) {
        const booked = Math.min(cost.life, this.headroom(actor, 'life'));
        loan.debt += booked; actor.reservedLife += booked;
        actor.life = Math.min(actor.life, this.lifeCeiling(actor));
        loan.idle = this.idleDelay(actor, loan);
      } else {
        const spent = Math.max(0, Math.min(actor.life, cost.life));
        actor.life -= cost.life;
        if (spent > 0) p.lifeSpent(actor, spent);
      }
    }
  }

  private idleDelay(actor: A, loan: L): number {
    const p = this.ports, spec = p.spec(loan);
    return p.stat(actor, p.context(loan), 'overdriveIdleDelay', spec?.idleDelay ?? 2.5);
  }

  /** Host calls after life/mana regen, inside its living/not-downed phase.
   * lifeRegen is the raw pre-healing/pre-diversion scalar sampled by that phase. */
  advanceDebt(actor: A, dt: number, lifeRegen: number): void {
    nonnegative(dt, 'Repayment duration'); finite(lifeRegen, 'Raw life regeneration');
    this.repayLane(actor, 'mana', dt, lifeRegen);
    this.repayLane(actor, 'life', dt, lifeRegen);
  }

  private repayLane(actor: A, lane: PaymentLane, dt: number, lifeRegen: number): void {
    const loan = actor.overdrive[lane];
    if (!loan) return;
    loan.idle -= dt;
    if (loan.debt <= 0) return;
    const p = this.ports, context = p.context(loan), spec = p.spec(loan);
    const flowing = loan.idle <= 0 ? 1 : p.stat(actor, context, 'overdriveFlow');
    if (flowing <= 0) return;
    const rate = lane === 'mana'
      ? loan.debt * p.stat(actor, context, 'overdriveRecovery', spec?.recoveryPct ?? .15)
        + p.stat(actor, context, 'overdriveRecoveryFlat', spec?.recoveryFlat ?? 2)
      : lifeRegen * p.stat(actor, context, 'overdriveLifeFactor', spec?.regenFactor ?? .75)
        * p.attackSpeed(actor) * p.stat(actor, context, 'overdriveRecovery', 1);
    const repaid = Math.min(loan.debt, rate * flowing * dt);
    loan.debt -= repaid;
    if (lane === 'mana') actor.reservedMana = Math.max(0, actor.reservedMana - repaid);
    else actor.reservedLife = Math.max(0, actor.reservedLife - repaid);
  }
}
