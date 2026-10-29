/** Borrowed, live integration records. These contracts are neither a save
 * format nor validation for untrusted content. Hosts may carry additional data. */
export type StatusDamageType = 'physical' | 'fire' | 'cold' | 'lightning' | 'chaos';
export interface ActiveStatus {
  id: string; remaining: number; stacks: number; dps: number; sourceName: string;
  statusDuration?: number; sourceKey?: string; challengeField?: number;
  holdDischarge?: boolean; power?: number; propagates?: boolean;
  rupture?: number; ruptureType?: StatusDamageType; ruptureRadius?: number;
  casterId?: number; total?: number; window?: {lo: number; hi: number};
  brood?: {monsterId: string; perDamage: number; duration: number; max: number};
  broodAcc?: number; leech?: number; leechAcc?: number; popAcc?: number;
  bankPeak?: number; bankFrac?: number;
}
export interface StatusOptions {
  propagates?: boolean; rupture?: number; ruptureType?: StatusDamageType;
  ruptureRadius?: number; relayed?: boolean; stacksBonus?: number;
  casterId?: number; challengeField?: number; sourceKey?: string;
  holdDischarge?: boolean; brood?: ActiveStatus['brood']; leech?: number;
  popBonus?: number; power?: number;
}
export interface StatusDefinition<M, Tag extends string> {
  duration: number; beneficial?: boolean; hardCC?: boolean; forbidsTags?: Tag[];
  stacking?: boolean; maxStacks?: number; stackPolicy?: 'refresh' | 'strongest';
  dotType?: StatusDamageType; mods?: M[]; modsPerStack?: boolean;
  buildup?: {into: string}; propagateOnDeath?: boolean; refreshCaster?: boolean;
  bank?: {capMul: number; duration?: number; wetMul?: number};
  weakSpot?: {size: number; gap: number}; pop?: {fraction: number};
  dpsCurve?: 'ramp' | 'taper'; timeScale?: number; flight?: boolean;
  panic?: boolean; neverRetreats?: boolean; fickleSpan?: [number, number];
  baseline?: {dps: number; perLevel: number};
}
export interface StatusSkill<Tag extends string> {def: {tags: Tag[]}}
export interface StatusActor<A, I, M, Tag extends string> {
  statuses: ActiveStatus[]; expiredStatuses: ActiveStatus[];
  life: number; poise: number; poiseBroken: boolean;
  casting?: {inst: I} | null; rainWet: boolean;
  flying: boolean; flyingBase: boolean; touchdown: boolean;
  sheet: {
    get(id: string): number;
    armedFamily(prefix: string, ids: readonly string[]): readonly string[];
    setSource(id: string, mods: M[]): void;
    removeSource(id: string): void;
  };
  maxLife(): number;
  isWet(): boolean;
  applyStatus(id: string, dps: number, durationScale: number, sourceName: string, options?: StatusOptions): void;
  statusRelay?: (target: A, args: [string, number, number, string, StatusOptions?]) => boolean;
}
export interface StatusPorts<A, I, D, Tag extends string> {
  /** Live lookup; callbacks may change host definitions between reads. */
  definition(id: string): D | undefined;
  /** One draw when requested, finite in [0,1). */
  random(): number;
  skillContextTags(inst: I): ReadonlySet<Tag>;
  /** Own presentation and notification; callback effects are visible immediately. */
  popCue(actor: A, id: string, definition: D | undefined): void;
  /** Copied at construction; changing the relay vocabulary requires a new service. */
  relayIds: readonly string[];
}
export type StatusTick = (status: ActiveStatus, amount: number, type: StatusDamageType | 'untyped') => void;
