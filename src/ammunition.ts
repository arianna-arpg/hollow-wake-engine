import {finite} from './validation.js';

export interface UseChargeSpec {
  max: number;
  recharge?: number;
  stepsFromBank?: boolean;
  magazine?: true | {refill?: number; drip?: true};
  empower?: number;
  still?: {bleed: number};
  ventAll?: true;
}

export interface UseChargeBank {
  count: number;
  timer: number;
  reloading?: boolean;
}

export interface AmmunitionSkill {
  def: {id: string; cooldown: number};
}

/** Reads must be pure and coherent for the duration of each operation. The
 * host advances cooldowns first and supplies its own movement observation. */
export interface AmmunitionPorts<I extends AmmunitionSkill> {
  spec(inst: I): UseChargeSpec | undefined;
  skills(): readonly (I | null)[];
  capacityBonus(inst: I): number;
  chargeRate(inst: I): number;
  cooldownRecovery(inst: I): number;
  still(): boolean;
  cooling(inst: I): boolean;
}

const MAX_BLEED_STEPS = 65_536;

function nonnegative(value: number, label: string): number {
  if (finite(value, label) < 0) throw new Error(`${label} must be nonnegative`);
  return value;
}

function validateSpec(spec: UseChargeSpec): void {
  if (!spec || typeof spec !== 'object') throw new Error('Ammunition specification is required');
  nonnegative(spec.max, 'Ammunition maximum');
  if (spec.recharge !== undefined) nonnegative(spec.recharge, 'Ammunition recharge');
  if (spec.empower !== undefined) finite(spec.empower, 'Ammunition empowerment');
  if (spec.stepsFromBank !== undefined && typeof spec.stepsFromBank !== 'boolean') {
    throw new Error('Ammunition repeat flag must be boolean');
  }
  if (spec.ventAll !== undefined && spec.ventAll !== true) throw new Error('Ammunition vent flag must be true');
  if (spec.still !== undefined) nonnegative(spec.still.bleed, 'Ammunition movement bleed');
  const magazine = spec.magazine;
  if (magazine !== undefined && magazine !== true) {
    if (!magazine || typeof magazine !== 'object') throw new Error('Invalid ammunition magazine');
    if (magazine.refill !== undefined) nonnegative(magazine.refill, 'Ammunition refill');
    if (magazine.drip !== undefined && magazine.drip !== true) throw new Error('Ammunition drip flag must be true');
  }
}

function bankState(bank: UseChargeBank): void {
  // A fractional legacy bank can become slightly negative after moving bleed.
  finite(bank.count, 'Ammunition count');
  nonnegative(bank.timer, 'Ammunition timer');
  if (bank.reloading !== undefined && typeof bank.reloading !== 'boolean') throw new Error('Ammunition reload flag must be boolean');
}

function skillId(inst: AmmunitionSkill): string {
  const id = inst?.def?.id;
  if (typeof id !== 'string' || !id || id.length > 256) throw new Error('Invalid ammunition skill id');
  return id;
}

/** Check this before querying/creating a bank. Optional fuel must not create
 * lazy state during an affordability refusal. Other admission remains host-owned. */
export function requiresUseCharge(spec: UseChargeSpec | undefined): boolean {
  if (spec === undefined) return false;
  validateSpec(spec);
  return spec.empower === undefined && !spec.ventAll;
}

export function useChargeReady(spec: UseChargeSpec | undefined, count: number): boolean {
  if (!requiresUseCharge(spec)) return true;
  return finite(count, 'Ammunition count') > 0;
}

/** An actor's borrowed banks and fixed read ports. No global registry or clock.
 * Ordered updates are not transactions: earlier bank commits survive a later
 * invalid observation. Movement bleed is bounded to 65,536 rounds per bank. */
export class Ammunition<I extends AmmunitionSkill> {
  readonly #banks: Map<string, UseChargeBank>;
  readonly #ports: AmmunitionPorts<I>;
  #busy = false;

  constructor(banks: Map<string, UseChargeBank>, ports: AmmunitionPorts<I>) {
    if (!(banks instanceof Map)) throw new Error('Ammunition banks require a map');
    this.#banks = banks;
    const bound = {} as AmmunitionPorts<I>;
    for (const key of ['spec', 'skills', 'capacityBonus', 'chargeRate', 'cooldownRecovery', 'still', 'cooling'] as const) {
      if (typeof ports?.[key] !== 'function') throw new Error(`Ammunition ${key} port is required`);
      Object.defineProperty(bound, key, {value: ports[key].bind(ports), enumerable: true});
    }
    this.#ports = Object.freeze(bound);
  }

  get banks(): Map<string, UseChargeBank> { return this.#banks; }

  #enter(): void {
    if (this.#busy) throw new Error('Reentrant ammunition operation');
    this.#busy = true;
  }

  #capacity(inst: I, spec: UseChargeSpec | undefined): number {
    if (spec === undefined) return 0;
    validateSpec(spec);
    const total = finite(spec.max + finite(this.#ports.capacityBonus(inst), 'Ammunition capacity bonus'), 'Ammunition capacity');
    return Math.max(1, Math.round(total));
  }

  #bank(inst: I): UseChargeBank {
    const id = skillId(inst);
    let bank = this.#banks.get(id);
    if (!bank) {
      bank = {count: this.#capacity(inst, this.#ports.spec(inst)), timer: 0};
      this.#banks.set(id, bank);
    } else bankState(bank);
    return bank;
  }

  capacity(inst: I): number {
    this.#enter();
    try { skillId(inst); return this.#capacity(inst, this.#ports.spec(inst)); }
    finally { this.#busy = false; }
  }

  bank(inst: I): UseChargeBank {
    this.#enter();
    try { return this.#bank(inst); }
    finally { this.#busy = false; }
  }

  spendOne(inst: I): void {
    this.#enter();
    try { const bank = this.#bank(inst); bank.count = Math.max(0, bank.count - 1); }
    finally { this.#busy = false; }
  }

  /** The host refunds the owning skill's cooldown and emits its cue only when
   * the returned amount is positive. This deliberately retains the rest timer. */
  restore(inst: I, amount?: number): number {
    if (amount !== undefined) nonnegative(amount, 'Ammunition restoration');
    this.#enter();
    try {
      const bank = this.#bank(inst), cap = this.#capacity(inst, this.#ports.spec(inst));
      const add = Math.min(cap - bank.count, amount ?? cap);
      if (add <= 0) return 0;
      bank.count = finite(bank.count + add, 'Restored ammunition');
      bank.reloading = false;
      return add;
    } finally { this.#busy = false; }
  }

  advance(dt: number): void {
    nonnegative(dt, 'Ammunition frame');
    this.#enter();
    try {
      const p = this.#ports;
      for (const inst of p.skills()) {
        const spec = inst ? p.spec(inst) : undefined;
        if (!inst || spec === undefined) continue;
        const id = skillId(inst), cap = this.#capacity(inst, spec);
        const cooldown = nonnegative(inst.def.cooldown, 'Ammunition cooldown');
        let bank = this.#banks.get(id);
        if (!bank) { bank = {count: cap, timer: 0}; this.#banks.set(id, bank); }
        else bankState(bank);
        if (bank.reloading && !p.cooling(inst)) {
          const refill = spec.magazine && spec.magazine !== true ? (spec.magazine.refill ?? cap) : cap;
          bank.count = Math.min(cap, finite(bank.count + refill, 'Reloaded ammunition'));
          bank.reloading = false;
        }
        if (spec.still && !p.still()) {
          const mag = spec.magazine;
          const period = spec.recharge ?? (mag && mag !== true && mag.drip ? cooldown : 0);
          if (period > 0 && (bank.count > 0 || bank.timer > 0)) {
            let timer = finite(bank.timer - dt * spec.still.bleed * period, 'Ammunition bleed timer');
            let count = bank.count, steps = 0;
            while (timer < 0 && count > 0) {
              if (++steps > MAX_BLEED_STEPS) throw new Error('Ammunition bleed exceeds the operation limit');
              count -= 1;
              timer += period;
            }
            bank.count = count;
            bank.timer = Math.max(0, timer);
          }
          continue;
        }
        if (bank.count >= cap) { bank.timer = 0; continue; }
        const mag = spec.magazine;
        if (mag && mag !== true && mag.drip && !bank.reloading && cooldown > 0) {
          const recovery = nonnegative(p.cooldownRecovery(inst), 'Ammunition cooldown recovery');
          const rate = nonnegative(p.chargeRate(inst), 'Ammunition charge rate');
          bank.timer = finite(bank.timer + dt * recovery * rate, 'Ammunition drip timer');
          if (bank.timer >= cooldown) {
            bank.timer -= cooldown;
            bank.count = Math.min(cap, finite(bank.count + (mag.refill ?? 1), 'Drip ammunition'));
            if (bank.count >= cap) bank.timer = 0;
          }
          continue;
        }
        if (!spec.recharge) continue;
        bank.timer = finite(bank.timer + dt * nonnegative(p.chargeRate(inst), 'Ammunition charge rate'), 'Ammunition recharge timer');
        if (bank.timer >= spec.recharge) {
          bank.timer -= spec.recharge;
          bank.count = Math.min(cap, bank.count + 1);
          if (bank.count >= cap) bank.timer = 0;
        }
      }
    } finally { this.#busy = false; }
  }
}

export interface AmmunitionPressPorts<A, I extends AmmunitionSkill> {
  bank(actor: A, inst: I): UseChargeBank;
  spend(actor: A, inst: I): void;
  finalRoundDamage(actor: A, inst: I): number;
  stampCooldown(actor: A, inst: I, time: number): void;
}

export interface AmmunitionPress {
  readonly bankSteps?: number;
  readonly roundMult: number;
  readonly ventRounds?: number;
}

const plainPress: AmmunitionPress = Object.freeze({bankSteps: undefined, roundMult: 1, ventRounds: undefined});

/** Runs after admission. Read ports are pure; commit ports must not throw,
 * reenter or change unrelated rule/state inputs. A thrown sink is not rolled
 * back. The clock sink observes spent rounds before reload flag/timer changes. */
export function commitAmmunitionPress<A, I extends AmmunitionSkill>(actor: A, inst: I, spec: UseChargeSpec | undefined, p: AmmunitionPressPorts<A, I>): AmmunitionPress {
  if (spec === undefined) return plainPress;
  validateSpec(spec);
  skillId(inst);
  nonnegative(inst.def.cooldown, 'Ammunition cooldown');
  const bankSteps = spec.stepsFromBank ? Math.max(1, finite(p.bank(actor, inst).count, 'Ammunition count')) : undefined;
  let roundMult = 1, ventRounds: number | undefined;
  if (spec.ventAll) {
    const bank = p.bank(actor, inst);
    ventRounds = finite(bank.count, 'Vented ammunition');
    bank.count = 0;
  } else if (spec.empower !== undefined) {
    if (finite(p.bank(actor, inst).count, 'Ammunition count') > 0) {
      p.spend(actor, inst);
      roundMult = finite(1 + spec.empower, 'Ammunition multiplier');
    }
  } else {
    p.spend(actor, inst);
    const bank = p.bank(actor, inst);
    if (finite(bank.count, 'Ammunition count') <= 0) {
      roundMult = finite(p.finalRoundDamage(actor, inst), 'Last-round multiplier');
      if (spec.magazine && inst.def.cooldown > 0) {
        p.stampCooldown(actor, inst, inst.def.cooldown);
        bank.reloading = true;
      }
    }
  }
  p.bank(actor, inst).timer = 0;
  return {bankSteps, roundMult, ventRounds};
}
