import {advanceCooldown} from './casting.js';

/** Synchronous borrowed stores. Writes may throw; earlier writes remain visible. */
export interface CooldownWrites {
  set(id: string, seconds: number): CooldownWrites;
  delete(id: string): boolean;
}
export interface LifecycleClocks extends CooldownWrites, Iterable<readonly [string, number]> {
  readonly size: number;
  get(id: string): number | undefined;
}
export interface ClockSkill { readonly def: { readonly id: string } }
export interface ClockOwner<I extends ClockSkill> {
  readonly cooldowns: LifecycleClocks;
  readonly skills: readonly (I | null | undefined)[];
}
export interface StampedClocks {
  readonly cooldowns: CooldownWrites;
  readonly cooldownTotals: CooldownWrites;
}
export interface RecoveryPorts<A, I> {
  global(actor: A): number;
  hasTagged(actor: A): boolean;
  scoped(actor: A, skill: I): number;
}
export interface CooldownPricePorts<A, I, Tags, Modifiers> {
  tags(skill: I): Tags;
  modifiers(skill: I): Modifiers;
  absorbCooldown(skill: I): number | null | undefined;
  read(actor: A, stat: 'addedCooldown' | 'cooldownRecovery', tags?: Tags, modifiers?: Modifiers): number;
}
export interface StampPorts<A, I> {
  price(actor: A, skill: I, base: number): number;
  ultimateCap(): number;
}
export interface OrbRefundPorts<A, I> {
  seconds(actor: A, kind: string, skill: I): number;
}
export interface OtherCooldownEffect {
  readonly type: 'reduceCooldowns';
  readonly seconds?: number;
  readonly fraction?: number;
}

/** Call at the host's existing timer phase with resolved elapsed time. The map
 * iterator stays live; destination methods and bar lookups stay live too.
 * Global rate and tag-presence are read even when no clocks exist. */
export function advanceSkillCooldowns<I extends ClockSkill, A extends ClockOwner<I>>(
  actor: A, elapsed: number, ports: RecoveryPorts<A, I>,
): void {
  const global = ports.global(actor);
  const tagged = ports.hasTagged(actor);
  for (const [id, remaining] of actor.cooldowns) {
    let rate = global;
    if (tagged) {
      const skill = actor.skills.find(candidate => candidate?.def.id === id);
      if (skill) rate = ports.scoped(actor, skill);
    }
    const left = advanceCooldown(remaining, elapsed, rate);
    if (left <= 0) actor.cooldowns.delete(id);
    else actor.cooldowns.set(id, left);
  }
}

/** Shared price for preview and stamping. Contexts are borrowed opaque values;
 * no per-call adapter object or context copy is required. Nonpositive prices
 * skip recovery reads. The host owns stat validation and authored clamps. */
export function calculateSkillCooldown<A, I, Tags, Modifiers>(
  actor: A, skill: I, base: number, ports: CooldownPricePorts<A, I, Tags, Modifiers>,
): number {
  const tags = ports.tags(skill);
  const extra = ports.modifiers(skill);
  const price = (ports.absorbCooldown(skill) ?? base) + ports.read(actor, 'addedCooldown', tags, extra);
  if (price <= 0) return 0;
  return price / Math.max(0.1,
    ports.read(actor, 'cooldownRecovery', tags, extra) / ports.read(actor, 'cooldownRecovery'));
}

/** Ultimate policy is queried lazily after pricing. Nonpositive stamps leave
 * existing clocks untouched; clock and HUD-total writes are distinct commits. */
export function stampSkillCooldown<A extends StampedClocks, I extends ClockSkill & {readonly def: {readonly ultimate?: unknown}}>(
  actor: A, skill: I, base: number, ports: StampPorts<A, I>,
): void {
  let seconds = ports.price(actor, skill, base);
  if (skill.def.ultimate) seconds = Math.min(seconds, ports.ultimateCap());
  if (seconds <= 0) return;
  actor.cooldowns.set(skill.def.id, seconds);
  actor.cooldownTotals.set(skill.def.id, seconds);
}

export function refundSkillCooldown(actor: StampedClocks, id: string): void {
  actor.cooldowns.delete(id);
  actor.cooldownTotals.delete(id);
}

/** Walk the live bar, including duplicate instances. Only explicit refunds
 * change remaining clocks; their stamped HUD denominators are retained. */
export function refundCooldownsOnOrb<I extends ClockSkill, A extends ClockOwner<I>>(
  actor: A, kind: string, ports: OrbRefundPorts<A, I>,
): void {
  if (actor.cooldowns.size === 0) return;
  for (const skill of actor.skills) {
    if (!skill) continue;
    const remaining = actor.cooldowns.get(skill.def.id);
    if (remaining === undefined) continue;
    const seconds = ports.seconds(actor, kind, skill);
    if (seconds <= 0) continue;
    const left = remaining - seconds;
    if (left <= 0) actor.cooldowns.delete(skill.def.id);
    else actor.cooldowns.set(skill.def.id, left);
  }
}

/** Time Dilation's distinct transition: snapshot entries, spare the supplied
 * live definition, count visits even for zero reduction or signed extension.
 * The host uses the count for presentation; totals are untouched. */
export function reduceOtherSkillCooldowns(
  actor: {readonly cooldowns: LifecycleClocks}, definition: {readonly id: string}, effect: OtherCooldownEffect,
): number {
  let visited = 0;
  for (const [id, remaining] of [...actor.cooldowns]) {
    if (id === definition.id) continue;
    const left = remaining - (effect.seconds ?? 0) - remaining * (effect.fraction ?? 0);
    if (left <= 0) actor.cooldowns.delete(id);
    else actor.cooldowns.set(id, left);
    visited++;
  }
  return visited;
}
