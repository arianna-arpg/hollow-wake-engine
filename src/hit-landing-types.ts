/** Trusted, borrowed damage records. Content validation is a separate boundary. */
export type HitLandingAmounts = Partial<Record<string, number>>;
export interface HitLandingSkill {
  effects: readonly {type: string}[];
  backstabCue?: string | false;
}
export interface HitLandingActor<P> {
  kind?: string; team: string; pos: P; life: number; dead: boolean;
  mimicWatch: boolean;
  sheet: {get(id: string): number};
  isPanicked(): boolean;
  healBy(amount: number): unknown;
  noteRecent(event: 'evade' | 'block' | 'hit' | 'hurt' | 'crit' | 'critHurt'): void;
  spendBuffs(event: 'evade' | 'block'): void;
}
export interface HitLandingPacket<Tag extends string> {
  amounts: HitLandingAmounts;
  tags: Set<Tag>;
}
export interface HitLandingResult {
  evaded: boolean; blocked: boolean; immune: boolean; total: number; crit: boolean;
  blockedAmount?: number; poiseBroke?: boolean;
  receivedAmounts?: HitLandingAmounts;
}
export interface HitLandingDeed<A, Tag extends string> {
  kind: 'evade' | 'block' | 'hurt' | 'poise' | 'hit';
  value?: number; subject?: A; tags?: Tag[]; flags?: string[]; keys?: string[]; distance?: number;
}
export interface HitLandingProcContext<A, I, M, Tag extends string> {
  depth: number; target?: A; crit?: boolean; receivedAmounts?: HitLandingAmounts;
  tags?: Set<Tag>; extra?: M[]; inst?: I;
}
/** Synchronous continuation. Result is absent for a non-damaging hit.
 * The original result remains borrowed; dealt and critical are earlier captures.
 * Refused hits never call this continuation. */
export type LandedHitContinuation<A, I, S, P, M, Packet, Tone, Effect, Result, R> = (
  caster: A, inst: I, target: A, damageMultiplier: number, depth: number,
  forceDamage: boolean, deliveryEffects: Effect[] | undefined,
  hitOrigin: P | undefined, hitTier: number | undefined,
  definition: S, modifiers: M[], packet: Packet,
  rearHit: boolean, struckTone: Tone | null, afflictionCarry: number,
  hasDamage: boolean, dealt: number, critical: boolean, result: Result | undefined,
) => R;
export interface HitLandingPorts<A, I, S, P, M, Tag extends string, Packet, Tone, Effect, Result, R> {
  player(): A;
  time(): number;
  bindDeeds(): void;
  concealed(caster: A, time: number): boolean;
  assault(caster: A, packet: Packet, depth: number): void;
  applyHit(caster: A, target: A, packet: Packet): Result;
  recordSelfDamage(caster: A, lostLife: number): void;
  metaActive(): boolean;
  deedEnemy(actor: A): boolean;
  deedOwned(actor: A): boolean;
  recordDeed(event: HitLandingDeed<A, Tag>): void;
  /** Capture the host tracker before evaluating live life/max-life/config reads. */
  trackHurt(lifeBefore: number, target: A): number;
  distance(from: P, to: P): number;
  /** Cue ports retain presentation-specific field reads and construction order. */
  evadeCue(target: A, caster: A): void;
  blockCue(target: A, caster: A): void;
  immuneCue(target: A, caster: A): void;
  rearCue(target: A, caster: A, definition: S): void;
  capturedArtCue(definition: S): void;
  thorns(target: A, caster: A): void;
  blockCharges(target: A): void;
  ownProcs(actor: A, event: 'evade' | 'miss' | 'block' | 'foiled' | 'struck' | 'hurt', context: HitLandingProcContext<A, I, M, Tag>): void;
  blockTriggers(target: A, caster: A): void;
  kill(target: A, environmental: false, caster: A): void;
  knockFixtures(caster: A, target: A, tone: Tone | null, wounding: false, inst: I): void;
  refreshMimic(target: A, time: number): void;
  captureMimic(target: A, caster: A, definition: S): boolean;
  bankPool(caster: A, type: string, amount: number): void;
  continue: LandedHitContinuation<A, I, S, P, M, Packet, Tone, Effect, Result, R>;
}
