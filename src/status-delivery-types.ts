import type {StatusDamageType} from './status-lifecycle-types.js';
import type {TransplantOptions} from './status-effects-types.js';
export type {StatusDamageType};

export interface SiphonStatusEffect {
  type: 'siphonStatus'; radius: number; from: 'allies' | 'enemies' | 'all';
  statuses?: readonly string[]; healPer?: number;
}
export interface RecallImpalesEffect {
  type: 'recallImpales'; radius: number; damageScale?: number; spearShare?: number;
}
/** Minimum borrowed fields, not an external-input validation schema. */
export interface DeliveryStatus {id: string; rupture?: number; ruptureType?: StatusDamageType}
export interface DeliverySkill {id: string; name: string; color: string}
export interface DeliveryInstance {level: number}
export interface StatusDeliveryActor<I, P, M, Tag extends string, Status> {
  pos: P; radius: number; team: string; life: number; dead: boolean; untargetable: boolean;
  construct?: {breakable?: unknown}; statuses: Status[]; metaInsts: Map<string, I>;
  hitFlash: number; hitFlashType?: StatusDamageType;
  sheet: {get(id: string, tags?: ReadonlySet<Tag>, extra?: readonly M[]): number; removeSource(id: string): void};
  healBy(amount: number): void;
}
export interface StatusDeliveryPorts<A, I, S, P, Direction, Status> {
  /** Iterate the supplied live collection; the capability never copies it. */
  actors(): Iterable<A>;
  /** Host owns eligibility/story membership and whether the query is a snapshot. */
  enemies(caster: A): Iterable<A>;
  distance(from: P, to: P): number;
  copyPosition(at: P): P;
  direction(from: P, to: P): Direction;
  definition(id: string): {dischargeOnHit?: boolean; color?: string} | undefined;
  transplant(target: A, status: Status, sourceName: string, options: TransplantOptions): void;
  mitigateTyped(target: A, amounts: Partial<Record<StatusDamageType, number>>): number;
  kill(target: A, silent: boolean, caster: A): void;
  spearDefinition(): S | undefined;
  hasTreeRecall(inst: I): boolean;
  effectiveLevel(inst: I): number;
  makeInstance(def: S, level: number): I;
  spawnProjectile(caster: A, inst: I, origin: P, direction: Direction,
    options: {flat: {physical: number}}): void;
  /** An omitted height borrows the position; explicit height requests an offset copy. */
  text(at: P, text: string, color: string, size: number, height?: number): void;
  flash(at: P, radius: number, color: string, life: number): void;
  failNote(caster: A, key: string, text: string): void;
}
