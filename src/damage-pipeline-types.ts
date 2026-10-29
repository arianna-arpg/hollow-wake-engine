/** The synchronous shared damage service borrows live actor records. These are
 * structural integration contracts, not a save format or an untrusted parser. */
export type DamageType = 'physical' | 'fire' | 'cold' | 'lightning' | 'chaos';
export type DamageAmounts = Partial<Record<DamageType, number>>;
export interface DamagePacket<M, Tag extends string> {
  assaultGuaranteed?: boolean; amounts: DamageAmounts; crit: boolean; rollT?: number;
  tags: Set<Tag>; sourceName: string; extra?: M[];
}
export interface HitResult {
  receivedAmounts?: DamageAmounts; evaded: boolean; immune: boolean; blocked: boolean;
  blockedAmount?: number; total: number; crit: boolean; plyEaten?: boolean;
  poiseBroke?: boolean; culled?: boolean; clamped?: boolean;
}
export interface DamageBand {lo: number; hi: number}
export interface SkillDamagePreview {
  bands: Partial<Record<DamageType, DamageBand>>; total: DamageBand;
  critChance: number; critMulti: number;
}
export interface MitigateOptions<A, M, Tag extends string> {
  armorDamageFloor?: number; attacker?: A; tags?: Set<Tag>; extra?: M[];
  out?: {poiseBroke?: boolean; clamped?: boolean; receivedAmounts?: DamageAmounts};
}
export interface DamageSkill {
  def: {name: string; addedEffectiveness?: number; baseDamage?: Partial<Record<DamageType, [number, number]>>};
}
export interface DamageLedger {source: string; rate: number}
export interface AbsorbLayer<I> {
  amount: number; remaining: number; source: I;
  ended(reason: 'broken' | 'expired'): void;
}
export interface DamageActor<A, I, M, Tag extends string> {
  id: number; level: number; life: number; mana: number; reservedMana: number;
  es: number; esDelay: number; esRecharging: boolean; esBroke: boolean;
  ward: number; absorb: number; readonly absorbTotal: number;
  absorbLayers: Map<string, AbsorbLayer<I>>;
  insight: number; poise: number; poiseBroken: boolean; endurance: number; enduranceDelay: number;
  dead: boolean; downed?: boolean; invulnerable: boolean;
  evadeEntropy: number; evadeWindow: number; plies: number; plySpec?: {spentStatus?: string};
  lastGaspCd: number; lastGaspSpan: number; gasped: boolean;
  hitFlash: number; hitFlashType?: DamageType; segHitPending?: number; segTears?: number[];
  rarity?: string; partLink?: unknown; stationary?: boolean; spent?: boolean;
  rootedSpec?: unknown; rootedHeld?: boolean; bondHeld?: boolean; aiNerve: number;
  casting?: {mode: string; inst: I} | null;
  statuses: {id: string; stacks: number; casterId?: number}[];
  activeAuras: Map<string, {inst: {def: {delivery: {type: string; ledger?: DamageLedger}}}; ledger?: {balance: number}}>;
  lifeDamageInterceptors?: Map<string, (total: number) => number>;
  restoreStreams: {resource: string; perSec: number; remaining: number}[];
  gainEvents: {kind: string; id: string; depth: number; n?: number; tags?: Tag[]}[];
  sheet: {
    get(id: string, tags?: ReadonlySet<Tag>, extra?: readonly M[]): number;
    armedFamily(prefix: string, ids: readonly string[], extra?: readonly M[]): readonly string[];
    removeSource(name: string): void;
  };
  maxLife(): number;
  maxPoise(): number;
  effectiveWeight(): number;
  insightMomentum(): number;
  damagePoise(amount: number, attacker?: A, tags?: Set<Tag>, extra?: M[]): boolean;
  ledgerCap(ledger: DamageLedger): number;
  assaultPlyBreak?(attacker: A): void;
  applyStatus(id: string, power: number, duration: number, source: string): unknown;
  stanceRead(): {tags: ReadonlySet<Tag>; extra: M[]} | null | undefined;
  healBy(amount: number): number;
  gainWard(amount: number): number;
  gainEs(amount: number): number;
  gainPoise(amount: number): number;
  availableMaxMana(): number;
  staggerDamage(amount: number): void;
}
export interface DamageRules {
  armor: {k: number}; resistance: {hardCap: number; floor: number};
  evasion: {weight: number; minHitChance: number; windowReset: number};
  block: {guardBase: number; guardPerLevel: number};
  poise: {drFloor: number; drainRatio: number; drainFlat: number};
  endurance: {spendRatio: number};
  slayer: {giantsbaneRatio: number; regicideRarities: readonly string[]; quailAt: number};
  offTargetLess: number;
}
export interface DamagePorts<A, I extends DamageSkill, M, Tag extends string> {
  /** One draw per request, finite [0,1). No ambient RNG is accessed. */
  random(): number;
  instanceMods(inst: I): M[];
  instanceInnateMods(inst: I): M[];
  skillContextTags(inst: I | I['def'], extra?: Tag[]): Set<Tag>;
  travelProtected(actor: A): boolean;
  weakPointBonus(actor: A): number;
  plyFloor(actor: A): number;
  dominantType(amounts: DamageAmounts): DamageType | undefined;
  stampSegment(actor: A, segment: number): void;
  feedWound(actor: A, segment: number, amount: number): boolean;
  resourceFlow(recipient: A, source: A, resource: 'life' | 'es' | 'mana', amount: number): void;
  boundToAbsorb(status: string): boolean;
  onHit?(attacker: A, target: A, result: HitResult, packet: DamagePacket<M, Tag>): void;
  onDot?(target: A, landed: number, type?: DamageType): void;
}
