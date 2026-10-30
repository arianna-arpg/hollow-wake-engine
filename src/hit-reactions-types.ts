/** Trusted borrowed state, not a content-import schema. Position, content and
 * modifier payloads retain the host's types and identities. */
export interface HitReactionInstance {
  state?: {trigDepth?: number} | null;
}
export interface HitReactionPacket<Tag extends string> {
  tags: Set<Tag>;
  rollT?: number;
}
export interface HitReactionResult {
  crit: boolean;
  culled?: boolean;
  clamped?: boolean;
  poiseBroke?: boolean;
}
export interface HitReactionActor<P, M, Tag extends string, Item, Brain, Watch> {
  id: number; team: string; tier: number; pos: P; life: number; dead: boolean;
  lastCombatAt: number; aiHitAt: number; aiHitById: number;
  lastFoeAt: number; lastFoeId: number;
  alertUntil: number; alertFrom: P | null; alertTier?: number;
  lootSack?: Item[]; lastSpillAt: number; defId?: string; recentHurt: number;
  brain?: Brain;
  aiTuning?: {target?: {threat?: {damage?: number | null} | null} | null} | null;
  buffs: Iterable<[string, {def: unknown}]>;
  construct?: unknown;
  casting?: {mode: string; hitSpool?: number} | null;
  ambushArmed?: boolean; aggroed: boolean;
  watch?: Watch; watchAt?: P; watchRung: number; esBroke: boolean;
  sheet: {get(id: string, tags?: ReadonlySet<Tag>, extra?: readonly M[]): number};
  addThreat(sourceId: number, amount: number): void;
  removeBuff(id: string): void;
  maxLife(): number;
  lowLifeLine(): number;
}
export interface HitReactionProcContext<A, I, M, Tag extends string> {
  depth: number; tags?: Set<Tag>; extra?: M[]; inst?: I; target?: A;
}
export interface HitReactionTriggerContext<I, P> {
  depth: number; aim: P; sourceInst: I; rollT?: number;
}
/** Bind once per world. Every port is synchronous; configuration accessors and
 * live registries are sampled at their original place in the phase. */
export interface HitReactionPorts<A, I, S, P, M, Tag extends string, Item, Brain, Watch, Spill, Result> {
  time(): number;
  player(): A;
  actors(): readonly A[];
  copyPoint(point: P): P;
  /** Keep host component reads live, including replacement by a setter. */
  assignWatchPoint(target: A, source: P): void;
  aimPoint(target: A): P;
  distance(a: P, b: P): number;
  hostileTo(target: A, caster: A): boolean;
  alertScale(actor: A): number;
  readonly woundSearchSeconds: number;
  bumpDrives(actor: A, event: 'onHurt' | 'onDealt'): void;
  /** Native delivery constructs the drop after the SDK pops the borrowed item. */
  spillLoot(target: A, item: Item): void;
  essenceSpill(definitionId: string): Spill | undefined;
  bankEssenceSpill(target: A, spill: Spill, damage: number): void;
  releasePrimedPours(target: A): void;
  baseThreatWeight(brain: Brain): number | null | undefined;
  tags(definition: S): ReadonlySet<Tag>;
  instanceMods(instance: I): M[];
  tapCharges(actor: A, event: 'hit' | 'takeHit', counterpart: A): void;
  orbCount(): number;
  readonly orbCap: number;
  /** A fresh enumeration of the current registry, once for each eligible hit. */
  orbKeys(): readonly string[];
  orbOnHurtStat(id: string): string;
  chance(probability: number): boolean;
  shedOrb(id: string, position: P, options: {scatter: number; tier: number}): void;
  rouseOnWound(target: A): void;
  springAmbush(target: A): void;
  isStealthed(caster: A): boolean;
  readonly watchSearchRung: number;
  feedWatch(target: A, watch: Watch, time: number, amount: number, floor: number): void;
  watchValue(target: A, watch: Watch, time: number): number;
  watchRung(value: number): number;
  readonly lowLifeFlashSeconds: number;
  lowLifeFlash(seconds: number): void;
  /** Presentation reads live position/result fields in its native order. */
  damageCue(target: A, damage: number, result: Result): void;
  outcomeCue(target: A, outcome: 'culled' | 'hit_cap', origin: P): void;
  ownProcs(actor: A, event: 'poiseBreakDealt' | 'esBreak', context: HitReactionProcContext<A, I, M, Tag>): void;
  sweepDefenseEvents(target: A, depth: number): void;
  rollTriggers(caster: A, event: 'crit' | 'highRoll', context: HitReactionTriggerContext<I, P>): void;
  bankDamageTakenTriggers(target: A, damage: number, caster: A): void;
}
