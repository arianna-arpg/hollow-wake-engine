/** Preparation operates on trusted borrowed records, not serialized input. */
export type HitPreparationAmounts = Partial<Record<string, number>>;
export interface HitPreparationSkill<Tag extends string> {
  tags: readonly Tag[];
  color: string;
  shatterStatus?: {statuses: readonly string[]; mult: number; perStack?: boolean};
  backstabMult?: number;
}
export interface HitPreparationActor<A, P, M, Tag extends string> {
  id: number; team: string; pos: P; tier?: number;
  aiTargetId?: number; alertUntil: number;
  possession?: {guiseFaction?: string; guiseBroken?: boolean};
  segHitPending?: number;
  statuses: {id: string; stacks: number}[];
  sheet: {
    get(id: string, tags?: ReadonlySet<Tag>, extra?: readonly M[]): number;
    removeSource(id: string): void;
  };
  construct?: {breakable?: {ownerMult: number; affinityTags?: readonly Tag[]; affinityMult?: number}};
  owner?: A;
  tune?: unknown;
}
export interface HitPreparationFuse {delay: number; tell?: string}
export interface PendingPreparedHit<A, I, P, Effect> {
  kind: 'hit'; due: number; caster: A; inst: I; targetId: number;
  mult: number; depth: number; flat?: HitPreparationAmounts; force: boolean;
  hitEffects?: Effect[]; hitOrigin: P; hitTier?: number;
}
/** Called synchronously only after both interception gates admit the hit.
 * Records remain borrowed. Each invocation supplies independent scalar captures.
 * Returning through a host continuation avoids an intermediate result object. */
export type PreparedHitContinuation<A, I, S, P, M, Packet, Tone, Effect, R> = (
  caster: A, inst: I, target: A, damageMultiplier: number, depth: number,
  forceDamage: boolean, deliveryEffects: Effect[] | undefined,
  hitOrigin: P | undefined, hitTier: number | undefined,
  definition: S, modifiers: M[], packet: Packet,
  rearHit: boolean, struckTone: Tone | null, afflictionCarry: number,
) => R;
export interface HitPreparationPorts<A, I, S, P, M, Tag extends string, Packet, Tone, Effect, R> {
  time(): number;
  fuse(inst: I): HitPreparationFuse | undefined;
  instanceTags(inst: I): Set<Tag>;
  definitionTags(definition: S): Set<Tag>;
  modifiers(inst: I): M[];
  copyPosition(position: P): P;
  /** Read the live queue before evaluating a queued record's fields. */
  fuseQueue(): {push(fuse: PendingPreparedHit<A, I, P, Effect>): unknown};
  /** Preserve host cue ordering and live reads inside the cue. */
  fuseCue(target: A, definition: S, fuse: HitPreparationFuse): void;
  /** Host-specific combat recency and seat/account bookkeeping. */
  combat(caster: A, target: A): void;
  guiseCue(caster: A): void;
  forTarget(caster: A, inst: I, target: A, depth: number): I;
  noise(at: P, radius: number, caster: A): void;
  shatterCue(target: A): void;
  concealed(caster: A, time: number): boolean;
  ambushCue(target: A): void;
  /** Radians between the target's forward direction and the attacker. */
  rearAngle(target: A, caster: A): number;
  distance(from: P, to: P): number;
  proximityRadius(): number;
  victimScopeArmed(caster: A, extra: M[]): boolean;
  victimTags(target: A, caster: A, time: number): Tag[] | undefined;
  roll(caster: A, inst: I, flat: HitPreparationAmounts | undefined, victimTags: Tag[] | undefined): Packet;
  tone(amounts: HitPreparationAmounts): Tone | null;
  guard(target: A, caster: A, origin: P, raw: number): boolean;
  shell(target: A, origin: P, packet: Packet, caster: A): boolean;
  continue: PreparedHitContinuation<A, I, S, P, M, Packet, Tone, Effect, R>;
}
