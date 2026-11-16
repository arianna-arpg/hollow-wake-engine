import type {CombatPoint} from './combat-geometry.js';
import type {SatelliteDef, AuroraDef, GuardianDef, CreeperDef, SatelliteFlightVisual,
  SatelliteVisual, AuroraVisual, GuardianVisual, CreeperVisual} from './carried-effect-content.js';
export type * from './carried-effect-content.js';

export interface CarriedActor<A> {
  id: number; level: number; pos: CombatPoint; radius: number; tier: number;
  team: string; faction?: string; owner?: A; dead: boolean; downed: boolean; untargetable: boolean;
  sheet: {get(id: string, tags?: Set<string>): number; armedFamily(prefix: string, ids: readonly string[]): readonly string[]};
}
export interface CarriedEffectContext<A, I> {
  active(actor: A): boolean; elapsed(actor: A, dt: number): number;
  enemies(actor: A, reach: number, at?: CombatPoint): A[];
  hostile(a: A, b: A): boolean; clear(a: CombatPoint, b: CombatPoint, tier: number): boolean;
  instance(actor: A, skill: string, slot?: number): I | undefined;
  hit(actor: A, skill: I, target: A): void; radius(actor: A, skill: I): number;
  launch(actor: A, skill: I, from: CombatPoint, direction: number): void;
}
export interface CreeperEffectContext<A, I> extends CarriedEffectContext<A, I> {
  move(actor: A, from: CombatPoint, to: CombatPoint, radius: number, distance: number): CombatPoint;
}
export interface CarriedRegistry<D, C> {definitions: Readonly<Record<string, D>>; ids: readonly string[]; config: C}
export interface CarriedRules {
  satellites: CarriedRegistry<SatelliteDef, {maxPerActor: number; maxStep: number; maxFrame: number;
    maxSweepDistance: number; maxSweepSteps: number; sweepSpacing: number; promotePerFrame: number; maxFlightsPerActor: number}>;
  auroras: CarriedRegistry<AuroraDef, {maxCapacity: number; maxPerActor: number; maxFrame: number; teleport: number}>;
  guardians: CarriedRegistry<GuardianDef, {maxPerActor: number; maxFrame: number; teleport: number}>;
  creepers: CarriedRegistry<CreeperDef, {maxPerActor: number; maxFrame: number; teleport: number; maxTrail: number}>;
}
export interface CarriedController<A, C, V> {
  visuals: V[]; clear(): void; retire(actor: A): void;
  update(actors: readonly A[], dt: number, context: C): void;
}
export interface CarriedFlights<A, I> {
  visuals: SatelliteFlightVisual[]; clear(): void; retire(actor: A): void;
  launch(actor: A, definition: SatelliteDef, skill: I, slot: number, generation: number,
    from: CombatPoint, to: CombatPoint, radius: number): void;
  update(dt: number, context: CarriedEffectContext<A, I>, live: (actor: A, id: string, slot: number, generation: number) => boolean): void;
}
export interface CarriedEffects<A, I> {
  satellites: CarriedController<A, CarriedEffectContext<A, I>, SatelliteVisual> & {
    readonly flights: CarriedFlights<A, I>;
    reflectProjectiles(caster: A, tier: number, from: CombatPoint, to: CombatPoint, radius: number,
      context: CarriedEffectContext<A, I>): {owner: A; power: number; at: CombatPoint; color: string; radius: number} | undefined;
  };
  auroras: CarriedController<A, CarriedEffectContext<A, I>, AuroraVisual>;
  guardians: CarriedController<A, CarriedEffectContext<A, I>, GuardianVisual> & {
    readonly active: boolean;
    intercept(caster: A, tier: number, from: CombatPoint, to: CombatPoint, radius: number, context: CarriedEffectContext<A, I>): CombatPoint | undefined;
  };
  creepers: CarriedController<A, CreeperEffectContext<A, I>, CreeperVisual>;
}
