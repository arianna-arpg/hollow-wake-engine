/** Borrowed live state. The host owns the actor and its event accumulator. */
export interface HealingState {
  life: number;
  readonly dead: boolean;
  readonly lifeSealAt?: number;
  healedSince: number;
}

/** Synchronous ports; notifications return undefined to exclude async callbacks.
 * Ports may observe or nest transitions. Earlier changes survive exceptions. */
export interface HealingPorts<A extends HealingState> {
  readonly ceiling: (actor: A) => number;
  readonly rate: (actor: A) => number;
  readonly tapped?: (actor: A, landed: number) => undefined;
  readonly observed?: (actor: A, landed: number, silent: boolean) => undefined;
  readonly recent: (actor: A) => undefined;
}

export interface RefillPorts<A extends {life: number}> {
  readonly maximumLife: (actor: A) => number;
  readonly observed?: (actor: A, landed: number, silent: boolean) => undefined;
}

export interface LifeRecoveryPorts<A extends HealingState> extends HealingPorts<A>, RefillPorts<A> {}

/** Native numeric transition. Use validated content and coherent host state;
 * this low-level operation deliberately preserves native IEEE-number behavior. */
export function healLife<A extends HealingState>(actor: A, amount: number, ports: HealingPorts<A>, silent = false): number {
  if (amount <= 0 || actor.dead) return 0;
  const before = actor.life;
  // The ceiling call may change the seal. Keep the second seal read after it.
  const cap = actor.lifeSealAt !== undefined
    ? Math.min(ports.ceiling(actor), actor.lifeSealAt)
    : ports.ceiling(actor);
  // The life operand is sampled before the rate callback, as in the original.
  actor.life = Math.min(cap, actor.life + amount * ports.rate(actor));
  const landed = actor.life - before;
  if (landed > 0) {
    ports.tapped?.(actor, landed);
    ports.observed?.(actor, landed, silent);
    if (!silent) {
      ports.recent(actor);
      actor.healedSince += landed;
    }
  }
  return landed;
}

/** Full refill bypasses healing gates and notifies only positive growth. */
export function refillLife<A extends {life: number}>(actor: A, ports: RefillPorts<A>): void {
  const before = actor.life;
  actor.life = ports.maximumLife(actor);
  if (actor.life > before) ports.observed?.(actor, actor.life - before, true);
}

/** Proc schema only. Targeted skill healing uses a different content schema. */
export interface ProcHealingEffect {readonly type: 'heal'; readonly flat?: number; readonly pctMax?: number}
export interface ProcHealingPorts<A> {
  readonly maximumLife: (actor: A) => number;
}
export type ProcHealMethod<A> = (this: A, amount: number) => number;

// Capture native invocation once. A host callable can shadow its own .call;
// native method syntax does not read that property. No per-call array or binding.
const invokeHeal: <A>(method: ProcHealMethod<A>, actor: A, amount: number) => number =
  Function.prototype.call.bind(Function.prototype.call);

/** Apply an already-scaled proc effect. The host follows with its cue and riders.
 * Pass the current method before amount queries run, retaining native method
 * selection even when a query replaces that method. No bound closure is needed. */
export function applyProcHeal<A>(actor: A, effect: ProcHealingEffect, ports: ProcHealingPorts<A>, method: ProcHealMethod<A>): boolean {
  return invokeHeal(method, actor, (effect.flat ?? 0) + (effect.pctMax ?? 0) * ports.maximumLife(actor)) > 0;
}
