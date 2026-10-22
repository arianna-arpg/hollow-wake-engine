import type {ResourceCost} from './resource-payment.js';

export type AdmissionResource = 'life' | 'mana' | 'es';
export interface AdmissionGate {
  readonly charge?: {readonly id: string; readonly amount: number};
  readonly buff?: string;
  readonly holding?: true;
  readonly resource?: {readonly kind: AdmissionResource | 'ward'; readonly amount: number};
  readonly missing?: {readonly kind: AdmissionResource | 'any'; readonly amount?: number; readonly pct?: number};
  readonly guard?: true;
  readonly active?: string;
  readonly recentDamage?: {readonly within: number};
  readonly note?: string;
}
export interface AdmissionDelivery {
  readonly type: string;
  readonly mode?: string;
  readonly overdrive?: {readonly lane: 'mana' | 'life'};
  readonly lockAboveLife?: number;
  readonly persistent?: {readonly toggle?: boolean};
  readonly strobe?: unknown;
  readonly exclusiveGroup?: string;
}
export interface AdmissionSkill {
  readonly def: {
    readonly id: string;
    readonly useTime: number;
    readonly delivery: AdmissionDelivery;
    readonly effects: readonly {readonly type: string}[];
    readonly channel?: unknown;
    readonly concentration?: unknown;
    readonly reflex?: boolean;
    readonly usableWhileGuarding?: boolean;
    readonly requiresGuard?: boolean;
    readonly invokes?: unknown;
    readonly gauge?: unknown;
    readonly pool?: {readonly id: string; readonly min?: number};
  };
  readonly hostSkillId?: string;
}
export interface AdmissionReserve {
  readonly id: string;
  readonly perCast?: number;
  readonly costs?: Readonly<Record<string, number>>;
}
export interface AdmissionState<I extends AdmissionSkill> {
  readonly dead: boolean;
  readonly useLock: number;
  readonly reflexLock: number;
  readonly dash?: unknown;
  readonly casting?: {readonly mode: string; readonly inst: I} | null;
  readonly statuses: readonly {readonly id: string}[];
  readonly skillRecoveryLocks: ReadonlySet<string>;
  readonly cooldowns: ReadonlyMap<string, unknown>;
  readonly activeAuras: ReadonlyMap<string, unknown>;
  readonly summonToggles: ReadonlyMap<string, {readonly inst: I; readonly reserved: number}>;
  readonly strobes: ReadonlyMap<string, unknown>;
  readonly overdrive: {readonly mana?: {readonly debt: number}; readonly life?: {readonly debt: number}};
  readonly reserves?: ReadonlyMap<string, {readonly cur: number; readonly ventUntil: number}>;
  readonly reserveSpecs?: readonly AdmissionReserve[];
  readonly runes: readonly unknown[];
  readonly charges: ReadonlyMap<string, number>;
  readonly pools: ReadonlyMap<string, number>;
  readonly venting: ReadonlySet<string>;
  readonly brims?: ReadonlyMap<string, {readonly fill: number}>;
  readonly buffs: ReadonlyMap<string, unknown>;
  readonly primedPours: readonly unknown[];
  readonly gripping?: unknown;
  readonly recentHurt: number;
  readonly life: number;
  readonly mana: number;
  readonly es: number;
  readonly ward: number;
  readonly reservedMana: number;
  readonly manaReserved: number;
}
export interface AdmissionChargeCost {
  readonly charge: string;
  readonly amount: number | 'all';
  readonly minimum?: number;
  readonly optional?: boolean;
}
export interface AdmissionGather {
  readonly releaseOnCooldown?: boolean;
  readonly minRelease?: number;
}

/** All reads observe coherent trusted state. useChargeBank alone may create a
 * missing bank. Costs/specification validation remains with their providers. */
export interface SkillAdmissionPorts<A, I, G extends AdmissionGate, D extends AdmissionDelivery> {
  replenishing(inst: I): boolean;
  stunned(actor: A): boolean;
  statusForbids(id: string): readonly string[] | undefined;
  contextTags(inst: I): ReadonlySet<string>;
  castMode(inst: I): string;
  useTime(actor: A, inst: I): number;
  reflexStat(actor: A, inst: I): number;
  reflexDuring(): Readonly<Record<string, boolean | undefined>>;
  guardCast(inst: I): boolean;
  gather(inst: I): AdmissionGather | undefined;
  requiresUseCharge(inst: I): boolean;
  useChargeBank(actor: A, inst: I): {readonly count: number};
  cost(actor: A, inst: I): ResourceCost;
  canAfford(actor: A, cost: ResourceCost): boolean;
  gates(inst: I): readonly G[];
  /** null means ready; otherwise the original gauge refusal text. */
  gaugeRefusal(actor: A, inst: I): string | null;
  thirstless(actor: A, inst: I): number;
  primeCapacity(actor: A, inst: I): number;
  chargeCost(inst: I): AdmissionChargeCost | undefined;
  chargeCostReady(have: number, cost: AdmissionChargeCost): boolean;
  delivery(inst: I): D;
  summonSlots(actor: A, inst: I, delivery: D): number;
  summonReservation(actor: A, inst: I, delivery: D): number;
  maxLife(actor: A): number;
  maxMana(actor: A): number;
  availableMana(actor: A): number;
  maxShield(actor: A): number;
}

/** Actor eligibility is not host authorization or a complete button press.
 * No actor, query context, mutable cache or scratch record is retained here. */
export class SkillAdmission<A extends AdmissionState<I>, I extends AdmissionSkill,
  G extends AdmissionGate = AdmissionGate, D extends AdmissionDelivery = AdmissionDelivery> {
  readonly #ports: Readonly<SkillAdmissionPorts<A, I, G, D>>;
  constructor(ports: SkillAdmissionPorts<A, I, G, D>) { this.#ports = Object.freeze({...ports}); }

  canAct(actor: A): boolean {
    return !actor.dead && actor.useLock <= 0 && !this.#ports.stunned(actor)
      && !actor.dash && !actor.casting;
  }

  tagsForbidden(actor: A, inst: I): boolean {
    const p = this.#ports;
    for (const status of actor.statuses) {
      const forbids = p.statusForbids(status.id);
      if (!forbids) continue;
      for (const tag of forbids) if (p.contextTags(inst).has(tag)) return true;
    }
    return false;
  }

  isReflex(actor: A, inst: I): boolean {
    const p = this.#ports, def = inst.def;
    if (p.castMode(inst) !== 'cast' || def.channel || def.concentration) return false;
    if (p.useTime(actor, inst) > 0.001) return false;
    return def.reflex === true || p.reflexStat(actor, inst) > 0;
  }

  private reflexOpen(actor: A): boolean {
    const p = this.#ports, during = p.reflexDuring();
    if (actor.dead) return false;
    if (actor.casting && during[actor.casting.mode] === false) return false;
    if (actor.dash && during.dash === false) return false;
    if (actor.useLock > 0 && during.useLock === false) return false;
    if (p.stunned(actor) && during.stun !== true) return false;
    return true;
  }

  private gatherReleasable(actor: A, inst: I): boolean {
    const p = this.#ports, gather = p.gather(inst);
    if (!gather?.releaseOnCooldown) return false;
    if (p.castMode(inst) !== 'cast' || inst.def.concentration || inst.def.useTime < 0.3) return false;
    return (actor.brims?.get(inst.def.id)?.fill ?? 0) >= (gather.minRelease ?? 0.15);
  }

  canUse(actor: A, inst: I): boolean {
    const p = this.#ports;
    if (p.replenishing(inst)) return false;
    if (this.tagsForbidden(actor, inst)) return false;
    const heldMode = actor.casting?.mode;
    const held = heldMode === 'guard' || heldMode === 'channel' || heldMode === 'charge' || heldMode === 'overcharge';
    const combo = held && p.useTime(actor, inst) <= 0.001
      && (!!inst.def.usableWhileGuarding || p.guardCast(inst)
        || (inst.hostSkillId !== undefined && actor.casting!.inst.def.id === inst.hostSkillId));
    const reflex = !this.canAct(actor) && actor.reflexLock <= 0
      && this.isReflex(actor, inst) && this.reflexOpen(actor);
    if (!reflex) {
      if (combo) { if (actor.dead || actor.useLock > 0 || p.stunned(actor)) return false; }
      else if (!this.canAct(actor)) return false;
    }
    if (actor.skillRecoveryLocks.has(inst.def.id)) return false;
    if (actor.cooldowns.has(inst.def.id) && !this.gatherReleasable(actor, inst)) return false;
    if (inst.def.requiresGuard && actor.casting?.mode !== 'guard') return false;
    const raw = inst.def.delivery;
    if (raw.type === 'aura' && raw.mode === 'toggle' && actor.activeAuras.has(inst.def.id)) {
      if (raw.overdrive && (actor.overdrive[raw.overdrive.lane]?.debt ?? 0) > 0) return false;
      if (raw.lockAboveLife !== undefined && actor.life > raw.lockAboveLife * p.maxLife(actor)) return false;
      return true;
    }
    if (raw.type === 'summon' && raw.persistent?.toggle && actor.summonToggles.has(inst.def.id)) return true;
    if (raw.type === 'ground' && raw.strobe && actor.strobes.has(inst.def.id)) return true;
    if (p.requiresUseCharge(inst) && p.useChargeBank(actor, inst).count <= 0) return false;
    if (actor.reserves && actor.reserveSpecs) {
      for (const spec of actor.reserveSpecs) {
        const price = Math.max(0, spec.costs?.[inst.def.id] ?? spec.perCast ?? 0);
        if (!price) continue;
        const state = actor.reserves.get(spec.id);
        if (!state || state.cur < price || state.ventUntil > 0) return false;
      }
    }
    if (inst.def.invokes && actor.runes.length === 0) return false;
    const cost = p.cost(actor, inst);
    if (!p.canAfford(actor, cost)) return false;
    if (!this.gatesMet(actor, inst)) return false;
    const charge = p.chargeCost(inst);
    if (charge && !charge.optional && !p.chargeCostReady(actor.charges.get(charge.charge) ?? 0, charge)) return false;
    const pool = inst.def.pool;
    if (pool && !actor.venting.has(pool.id) && (actor.pools.get(pool.id) ?? 0) < (pool.min ?? 1)) return false;
    const delivery = p.delivery(inst);
    if (delivery.type === 'summon' && delivery.persistent) {
      const slots = delivery.persistent.toggle ? p.summonSlots(actor, inst, delivery) : 1;
      if (slots <= 0) return false;
      const reserved = p.summonReservation(actor, inst, delivery) * slots;
      let freed = 0;
      if (delivery.persistent.toggle && delivery.exclusiveGroup) {
        for (const contract of actor.summonToggles.values()) {
          const other = p.delivery(contract.inst);
          if (other.type === 'summon' && other.exclusiveGroup === delivery.exclusiveGroup) freed += contract.reserved;
        }
      }
      if (actor.reservedMana - freed + reserved > p.maxMana(actor) && actor.manaReserved === 0) return false;
    }
    return true;
  }

  unmetGate(actor: A, inst: I): G | {note: string} | null {
    const p = this.#ports;
    if (inst.def.gauge) {
      const note = p.gaugeRefusal(actor, inst);
      if (note !== null) return {note};
    }
    for (const gate of p.gates(inst)) {
      if (gate.charge && (actor.charges.get(gate.charge.id) ?? 0) < gate.charge.amount) return gate;
      if (gate.buff && !actor.buffs.has(gate.buff)) return gate;
      if (gate.holding && !actor.gripping) return gate;
      if (gate.resource && actor[gate.resource.kind] < gate.resource.amount) return gate;
      if (gate.missing && p.thirstless(actor, inst) <= 0) {
        const missing = gate.missing;
        const met = missing.kind === 'any'
          ? this.missingMet(actor, 'life', missing) || this.missingMet(actor, 'mana', missing)
          : this.missingMet(actor, missing.kind, missing);
        if (!met && !this.primedPourOpen(actor, inst)) return gate;
      }
      if (gate.guard && actor.casting?.mode !== 'guard') return gate;
      if (gate.active && !actor.activeAuras.has(gate.active) && !actor.summonToggles.has(gate.active)) return gate;
      if (gate.recentDamage && actor.recentHurt > gate.recentDamage.within) return gate;
    }
    return null;
  }

  gatesMet(actor: A, inst: I): boolean { return this.unmetGate(actor, inst) === null; }

  primedPourOpen(actor: A, inst: I): boolean {
    let pours = false;
    for (const effect of inst.def.effects) if (effect.type === 'restoreOverTime') { pours = true; break; }
    if (!pours) return false;
    const p = this.#ports;
    if (p.useTime(actor, inst) > 0.001) return false;
    const cap = Math.floor(p.primeCapacity(actor, inst));
    if (cap <= 0 || actor.primedPours.length >= cap) return false;
    for (const gate of p.gates(inst)) {
      if (!gate.missing) continue;
      const kind = gate.missing.kind;
      if (kind === 'any' ? this.full(actor, 'life') && this.full(actor, 'mana') : this.full(actor, kind)) return true;
    }
    return false;
  }

  private maximum(actor: A, kind: AdmissionResource): number {
    const p = this.#ports;
    return kind === 'life' ? p.maxLife(actor) : kind === 'mana' ? p.availableMana(actor) : p.maxShield(actor);
  }
  private missingMet(actor: A, kind: AdmissionResource, missing: NonNullable<AdmissionGate['missing']>): boolean {
    const short = this.maximum(actor, kind) - actor[kind];
    const need = Math.max(missing.amount ?? 1, (missing.pct ?? 0) * this.maximum(actor, kind));
    return short >= need;
  }
  private full(actor: A, kind: AdmissionResource): boolean { return this.maximum(actor, kind) - actor[kind] < 1; }
}
