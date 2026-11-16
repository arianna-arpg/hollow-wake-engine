import type {UseChargeBank, UseChargeSpec} from './ammunition.js';
import type {CooldownClocks} from './cooldowns.js';

export interface CastResourceSkill {
  readonly def: {readonly id: string; readonly useCharges?: UseChargeSpec};
  readonly hostSkillId?: string;
}
export interface CastResourceActor<I> {
  readonly skills: readonly (I | null | undefined)[];
  readonly cooldowns: CooldownClocks;
  readonly activeAuras: ReadonlyMap<string, {ledger?: {balance: number}}>;
  readonly casting: {readonly inst: I; readonly mode: string; held: boolean} | null;
  skillChargeBank(skill: I): UseChargeBank;
  skillChargeCap(skill: I): number;
  gainCharge(charge: string, amount: number, max: number, skill: I): void;
  startChargeDrain(charge: string, perSecond: number): void;
}
export type CastResourceEffect =
  | {readonly type: 'gainCharge'; readonly charge: string; readonly amount: number; readonly max: number}
  | {readonly type: 'drainCharge'; readonly charge: string; readonly perSec: number}
  | {readonly type: 'payLedger'; readonly flat?: number; readonly pct?: number}
  | {readonly type: 'reduceCooldowns'; readonly seconds?: number; readonly fraction?: number}
  | {readonly type: 'restoreSkillCharges'; readonly scope?: 'host' | 'all' | 'still'; readonly amount?: number};

/** Synchronous live operations. Queries and callbacks retain their original
 * order. The actor owns the banks; this service never replaces skill identities.
 * Content admission, host availability and payment precede this trusted seam. */
export interface CastResourcePorts<A, I> {
  useCharges(skill: I): UseChargeSpec | undefined;
  refundCooldown(actor: A, skillId: string): void;
  ammunitionCue(actor: A, skill: I): void;
  ledgerPaid(actor: A, amount: number): void;
  ledgerEmpty(actor: A, skillId: string): void;
  cooldownsReduced(actor: A): void;
}

/** Caster-side resource effects from the pinned World.executeSkill tail.
 * Apply in authored effect order, once per use. This is distinct from proc
 * arithmetic: skill cooldown reduction excludes its own clock and reports
 * visiting a clock even when the authored reduction is zero. Throws retain
 * preceding live writes, matching the other borrowed-state combat services. */
export class CastResourceEffects<A extends CastResourceActor<I>, I extends CastResourceSkill> {
  constructor(readonly ports: CastResourcePorts<A, I>) {}

  apply(actor: A, skill: I, effect: CastResourceEffect): void {
    switch (effect.type) {
      case 'gainCharge':
        actor.gainCharge(effect.charge, effect.amount, effect.max, skill);
        return;
      case 'drainCharge':
        actor.startChargeDrain(effect.charge, effect.perSec);
        return;
      case 'payLedger': {
        const aura = skill.hostSkillId ? actor.activeAuras.get(skill.hostSkillId) : undefined;
        if (aura?.ledger && aura.ledger.balance > 0.5) {
          const paid = Math.min(aura.ledger.balance,
            (effect.flat ?? 0) + (effect.pct ?? 0) * aura.ledger.balance);
          aura.ledger.balance -= paid;
          this.ports.ledgerPaid(actor, paid);
        } else this.ports.ledgerEmpty(actor, skill.def.id);
        return;
      }
      case 'reduceCooldowns': {
        let visited = 0;
        // Snapshot entries, not the destination. Callback-visible stores may
        // change while writes occur; newly inserted clocks wait for next use.
        for (const [id, seconds] of [...actor.cooldowns]) {
          if (id === skill.def.id) continue;
          const left = seconds - (effect.seconds ?? 0) - seconds * (effect.fraction ?? 0);
          if (left <= 0) actor.cooldowns.delete(id);
          else actor.cooldowns.set(id, left);
          visited++;
        }
        if (visited > 0) this.ports.cooldownsReduced(actor);
        return;
      }
      case 'restoreSkillCharges': {
        const banks: I[] = [];
        if (effect.scope === 'all') {
          for (const entry of actor.skills) if (entry && this.ports.useCharges(entry)) banks.push(entry);
        } else if (effect.scope === 'still') {
          for (const entry of actor.skills) if (entry && this.ports.useCharges(entry)?.still) banks.push(entry);
        } else {
          const host = skill.hostSkillId ? actor.skills.find(entry => entry?.def.id === skill.hostSkillId) : undefined;
          const own = host ?? (skill.def.useCharges ? skill : undefined);
          if (own && this.ports.useCharges(own)) banks.push(own);
        }
        let loaded = 0;
        for (const bankSkill of banks) {
          const bank = actor.skillChargeBank(bankSkill);
          const cap = actor.skillChargeCap(bankSkill);
          const add = Math.min(cap - bank.count, effect.amount ?? cap);
          if (add <= 0) continue;
          bank.count += add;
          bank.reloading = false;
          this.ports.refundCooldown(actor, bankSkill.def.id);
          loaded += add;
          if (effect.scope !== 'still') this.ports.ammunitionCue(actor, bankSkill);
        }
        if (loaded > 0) {
          const cast = actor.casting;
          if (cast && cast.inst === skill && cast.mode === 'channel'
            && (effect.scope ?? 'host') === 'host' && banks.length
            && actor.skillChargeBank(banks[0]).count >= actor.skillChargeCap(banks[0])) {
            cast.held = false;
          }
        } else if (banks.length) this.ports.refundCooldown(actor, skill.def.id);
        return;
      }
    }
  }
}
