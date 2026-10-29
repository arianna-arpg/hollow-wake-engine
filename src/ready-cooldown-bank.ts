import type {LifecycleClocks} from './cooldown-lifecycle.js';

/** Borrowed credit in seconds. The host owns its lifetime and policy changes. */
export interface ReadyCooldownBank {bank: number}
export interface ReadyCooldownOwner {
  readonly cooldowns: Pick<LifecycleClocks, 'get' | 'set' | 'delete'>;
}
export interface ReadyCooldownSkill {readonly def: {readonly id: string}}
export interface ReadyCooldownBankPorts<A, I> {
  enabled(skill: I): boolean;
  price(actor: A, skill: I): number;
  maxExtra(): number;
}
/** Undefined return types reject asynchronous publication in typed hosts. */
export interface ReadyCooldownBankPresentation<A> {
  clear(actor: A): undefined;
  publish(actor: A, hits: number, progress: number): undefined;
}

/** Finishing a running clock never also earns bank credit. Only a clock that
 * was already ready may bank the refund; its stamped total remains unchanged.
 * Earlier clock writes survive a later price, bank or host failure. */
export function refundReadyCooldown<A extends ReadyCooldownOwner, I extends ReadyCooldownSkill>(
  actor: A, skill: I, bank: ReadyCooldownBank, amount: number, ports: ReadyCooldownBankPorts<A, I>,
): void {
  const left = actor.cooldowns.get(skill.def.id) ?? 0;
  const reduction = Math.min(left, amount);
  if (left > reduction) actor.cooldowns.set(skill.def.id, left - reduction);
  else actor.cooldowns.delete(skill.def.id);
  if (left <= 0 && ports.enabled(skill))
    bank.bank = Math.min(ports.price(actor, skill) * ports.maxExtra(), bank.bank + amount);
}

/** Return extra uses for this command. A recall preserves credit; an ordinary
 * command spends whole current-price units and retains any fractional excess.
 * Price is read even for recall or disabled banking, in the original order. */
export function consumeReadyCooldownBank<A, I>(
  actor: A, skill: I, bank: ReadyCooldownBank, recall: boolean, ports: ReadyCooldownBankPorts<A, I>,
): number {
  const unit = Math.max(0.1, ports.price(actor, skill));
  const extra = !recall && ports.enabled(skill) ? Math.min(ports.maxExtra(), Math.floor(bank.bank / unit)) : 0;
  if (!recall) bank.bank = Math.max(0, bank.bank - extra * unit);
  return extra;
}

/** Publish the numeric projection after gameplay commits. State reads remain
 * live, including the second credit read for a partially filled next use. */
export function publishReadyCooldownBank<A, I>(
  bank: ReadyCooldownBank & {readonly owner: A; readonly host: I},
  ports: ReadyCooldownBankPorts<A, I>, presentation: ReadyCooldownBankPresentation<A>,
): void {
  if (!ports.enabled(bank.host)) {presentation.clear(bank.owner); return;}
  const unit = Math.max(0.1, ports.price(bank.owner, bank.host));
  const extra = Math.min(ports.maxExtra(), Math.floor(bank.bank / unit));
  presentation.publish(bank.owner, 1 + extra, extra >= ports.maxExtra() ? 1 : (bank.bank / unit) % 1);
}
