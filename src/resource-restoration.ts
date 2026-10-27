/** Borrowed pools. The host owns state, timer phases and event occurrence. */
export interface ShieldGainState { readonly dead: boolean; es: number; esJustFilled: boolean }
export interface PoiseGainState { readonly dead: boolean; poise: number }
export interface ShieldGainPorts<A> { readonly maximumShield: (actor: A) => number }
export interface PoiseGainPorts<A> {
  readonly maximumPoise: (actor: A) => number;
  readonly poiseOvercharge: (actor: A) => number;
}

/** Preserve native live-query order and IEEE-number behavior. Validate authored
 * content on ingress; this operation is not an input-validation boundary. */
export function gainEnergyShield<A extends ShieldGainState>(actor: A, amount: number, ports: ShieldGainPorts<A>): number {
  if (amount <= 0 || actor.dead) return 0;
  const max = ports.maximumShield(actor);
  if (max <= 0) return 0;
  const before = actor.es;
  actor.es = Math.min(max, actor.es + amount);
  if (before < max - 0.001 && actor.es >= max - 0.001) actor.esJustFilled = true;
  return actor.es - before;
}

/** Deliberate gains may overcharge a broken bar; the host timer owns rearm. */
export function gainPoise<A extends PoiseGainState>(actor: A, amount: number, ports: PoiseGainPorts<A>): number {
  if (amount <= 0 || actor.dead) return 0;
  const max = ports.maximumPoise(actor);
  if (max <= 0) return 0;
  const cap = max * (1 + ports.poiseOvercharge(actor));
  const before = actor.poise;
  actor.poise = Math.min(cap, actor.poise + amount);
  return actor.poise - before;
}

export type RestorationResource = 'life' | 'mana' | 'es' | 'poise';
/** Resolved payload accepted by the live operation; serialized effects also
 * require the discriminator, enforced by the separate content compiler. */
export interface InstantRestoration {
  readonly resource: RestorationResource;
  readonly amount: number;
  readonly resetEsDelay?: boolean;
}
export interface InstantRestorationEffect extends InstantRestoration { readonly type: 'restore' }
export interface ProcRestorationEffect {
  readonly type: 'restore';
  readonly resource: Exclude<RestorationResource, 'life'>;
  readonly flat?: number;
  readonly pctMax?: number;
  readonly resetEsDelay?: boolean;
}
export interface RestorationGainEvent<TTags = unknown> {
  kind: 'restore'; id: RestorationResource; depth: 0; n: number; tags?: TTags;
}
export interface InstantRestorationState<TTags = unknown> {
  mana: number;
  esDelay: number;
  readonly gainEvents: { readonly length: number; push(event: RestorationGainEvent<TTags>): number };
}
export interface InstantRestorationOptions<TTags = unknown, TCue = unknown> {
  readonly noEvent?: boolean;
  readonly tags?: TTags;
  readonly feedingCue?: TCue | false;
}
/** Synchronous host actions. The three restore actions must select the target
 * gain method BEFORE reading effect.amount, using native method-call syntax.
 * Tags and cue specifications are borrowed opaque host values, not cloned. */
export interface InstantRestorationPorts<A, TCue = unknown> {
  readonly availableMana: (actor: A) => number;
  readonly restoreLife: (actor: A, effect: InstantRestoration) => number;
  readonly restoreShield: (actor: A, effect: InstantRestoration) => number;
  readonly restorePoise: (actor: A, effect: InstantRestoration) => number;
  readonly noteGain: (actor: A, resource: Exclude<RestorationResource, 'poise'>, amount: number, cue: TCue | false | undefined) => undefined;
}

/** Returned gain drives immediate events. Earlier state/cues survive throws. */
export function applyInstantRestoration<A extends InstantRestorationState<TTags>, TTags = unknown, TCue = unknown>(
  actor: A, effect: InstantRestoration, ports: InstantRestorationPorts<A, TCue>,
  options?: InstantRestorationOptions<TTags, TCue>,
): number {
  let landed = 0;
  if (effect.resource === 'life') {
    landed = ports.restoreLife(actor, effect);
  } else if (effect.resource === 'mana') {
    const before = actor.mana;
    actor.mana = Math.min(ports.availableMana(actor), actor.mana + effect.amount);
    landed = actor.mana - before;
  } else if (effect.resource === 'poise') {
    landed = ports.restorePoise(actor, effect);
  } else {
    landed = ports.restoreShield(actor, effect);
    if (effect.resetEsDelay) actor.esDelay = 0;
  }
  if (effect.resource !== 'poise') ports.noteGain(actor, effect.resource, landed, options?.feedingCue);
  if (landed > 0 && !options?.noEvent && actor.gainEvents.length < 64) {
    actor.gainEvents.push({kind: 'restore', id: effect.resource, depth: 0, n: landed, tags: options?.tags});
  }
  return landed;
}

export interface ProcRestorationState { mana: number; es: number; poise: number; esDelay: number }
export interface ProcRestorationPorts<A> extends ShieldGainPorts<A> {
  readonly maximumMana: (actor: A) => number;
  readonly maximumPoise: (actor: A) => number;
  readonly availableMana: (actor: A) => number;
  /** Select the current gain method here, after the amount queries. */
  readonly gainShield: (actor: A, amount: number) => number;
  readonly gainPoise: (actor: A, amount: number) => number;
}
export interface ResourceRestorationPorts<A, TCue = unknown> extends
  ShieldGainPorts<A>, PoiseGainPorts<A>, InstantRestorationPorts<A, TCue>, ProcRestorationPorts<A> {}

/** Receives an already-scaled effect. Actual pool growth drives the host proc
 * cue; returned gain-method values do not. No immediate event is appended. */
export function applyProcRestoration<A extends ProcRestorationState>(actor: A, effect: ProcRestorationEffect, ports: ProcRestorationPorts<A>): boolean {
  const before = effect.resource === 'mana' ? actor.mana : effect.resource === 'poise' ? actor.poise : actor.es;
  const amount = (effect.flat ?? 0) + (effect.pctMax ?? 0)
    * (effect.resource === 'mana' ? ports.maximumMana(actor)
      : effect.resource === 'poise' ? ports.maximumPoise(actor) : ports.maximumShield(actor));
  if (effect.resource === 'mana') {
    actor.mana = Math.min(ports.availableMana(actor), actor.mana + amount);
  } else if (effect.resource === 'poise') {
    ports.gainPoise(actor, amount);
  } else {
    ports.gainShield(actor, amount);
    if (effect.resetEsDelay) actor.esDelay = 0;
  }
  const after = effect.resource === 'mana' ? actor.mana : effect.resource === 'poise' ? actor.poise : actor.es;
  return after > before;
}
