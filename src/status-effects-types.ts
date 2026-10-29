import type {ActiveStatus, StatusOptions, StatusDefinition, StatusDamageType} from './status-lifecycle-types.js';
export type {StatusDamageType, StatusOptions};
/** Host-owned mutable records; no serialization or untrusted-input validation. */
export interface EffectStatus extends ActiveStatus {zapAt?: number; lashAt?: number}
export interface StatusEffectDefinition<M> extends StatusDefinition<M, string> {
  color: string; element?: StatusDamageType; cullsAtLethal?: boolean;
  dischargeMatchingType?: boolean;
  zapNearby?: {interval: number; factor: number; radius: number};
  lashOut?: {interval: number; factor: number; radius: number};
}
export interface StatusEffectActor<P, M, Tag extends string> {
  id: number; pos: P; radius: number; team: string; life: number;
  dead: boolean; invulnerable: boolean; untargetable: boolean;
  passive: boolean; construct?: unknown;
  hitFlash: number; hitFlashType?: StatusDamageType;
  statuses: EffectStatus[]; expiredStatuses: EffectStatus[];
  sheet: {
    get(id: string, tags?: ReadonlySet<Tag>, extra?: readonly M[]): number;
    setSource(id: string, mods: M[]): void;
    removeSource(id: string): void;
  };
  isStunned(): boolean;
  applyStatus(id: string, dps: number, durationScale: number, sourceName: string, options?: StatusOptions): void;
  endStatus(id: string): void;
  cleanseDebuffs(count: number): number;
}
export interface StatusEffectPorts<A, I, P, M, Tag extends string, D> {
  definition(id: string): D | undefined;
  /** Live reads, including during reentrant callbacks; never a cached actor list. */
  actors(): readonly A[];
  actorById(id: number): A | undefined;
  time(): number;
  zoneLevel(): number;
  distance(from: P, to: P): number;
  sameStory(a: A, b: A): boolean;
  skillContextTags(inst: I, extraTags?: Tag[]): Set<Tag>;
  instanceMods(inst: I): M[];
  mitigateTyped(target: A, amounts: Partial<Record<StatusDamageType, number>>, options?: {attacker?: A; tags?: Set<Tag>; extra?: M[]}): number;
  resistValue(target: A, type: StatusDamageType): number;
  recordIndirectDamage(target: A, source: A | undefined, lifeBefore: number): void;
  kill(target: A, silent?: boolean, source?: A): void;
  accumulateDotText(target: A, amount: number, interval: number): void;
  /** Presentation owns copying coordinates; height is the original screen-space offset. */
  text(at: P, text: string, color: string, size: number, channel?: 'combat', height?: number): void;
  flash(at: P, radius: number, color: string, life: number): void;
  ruptureCue(target: A, status: EffectStatus, radius: number): void;
}
export interface TransplantOptions {strengthScale?: number; duration?: 'remaining' | 'refresh'; durationScale?: number}
export interface ProcStatusEffect {status: string; magnitude?: number}
