/** Synchronous host-owned clocks. Native Maps satisfy this small interface;
 * hosts may provide another iterable store without changing content IDs. */
export interface CooldownClocks extends Iterable<readonly [string, number]> {
  set(id: string, seconds: number): CooldownClocks;
  delete(id: string): boolean;
}
export interface CooldownTrigger { readonly def: { readonly id: string } }
export interface CooldownSkill extends CooldownTrigger {
  readonly def: { readonly id: string; readonly tags: readonly string[] };
}
export interface CooldownState {
  readonly cooldowns: CooldownClocks;
  readonly skills: readonly (CooldownSkill | null | undefined)[];
}
export interface ProcCooldownEffect {
  readonly type: 'cooldown';
  readonly seconds?: number;
  readonly fraction?: number;
  readonly reset?: true;
  readonly skills?: readonly string[];
  readonly tags?: readonly string[];
  readonly exceptSelf?: true;
}

/** Apply an already-resolved proc effect. Clock entries are snapshotted before
 * any write; selectors, bar instances, trigger and destination methods stay
 * live. Earlier writes survive failure. No clock advancement, cue, rider,
 * randomness, validation or rollback occurs here.
 *
 * Returns whether any selected entry computed a smaller remaining time. The
 * caller uses that result for its normal gain cue, then runs its proc riders.
 * A tag selector (including []) requires the first matching bar instance;
 * an explicit skill-ID selector can also match an unslotted clock. */
export function applyProcCooldown(actor: CooldownState, effect: ProcCooldownEffect, trigger?: CooldownTrigger | null): boolean {
  let changed = false;
  for (const [id, remaining] of [...actor.cooldowns]) {
    if (effect.exceptSelf && trigger && id === trigger.def.id) continue;
    if (effect.skills && !effect.skills.includes(id)) continue;
    if (effect.tags) {
      const skill = actor.skills.find(candidate => candidate?.def.id === id);
      if (!skill || !effect.tags.every(tag => skill.def.tags.includes(tag))) continue;
    }
    const left = effect.reset ? 0 : remaining - (effect.seconds ?? 0) - remaining * (effect.fraction ?? 0);
    if (left < remaining) changed = true;
    if (left <= 0) actor.cooldowns.delete(id);
    else actor.cooldowns.set(id, left);
  }
  return changed;
}
