import type {SequenceRecoveryOwner} from './sequence-recovery.js';

/** Portable attack policy. Delivery and modifier records retain host compiler
 * extensions; the controller never reads rendering objects or global content. */
export interface SequenceBuff<M> {
  type: 'buff'; id: string; label?: string; duration: number; mods: M[]; maxStacks?: number;
}
export interface SequenceTrajectory {
  homing?: number; erratic?: number; spiral?: number; orbit?: number;
  spin?: number; weave?: number; amplitude?: number; orbitRadius?: number;
}
export interface SequenceFlightInheritance {
  homing: number; erratic: number; spiral: number; orbit: number;
  spin: number; weave: number; amp: number; orbitR0: number;
}
export interface SequenceProjectileDelivery {
  type: 'projectile'; speed: number; radius: number; range: number;
  trajectory?: SequenceTrajectory;
}
export interface SequenceMeleeDelivery {type: 'melee'; range: number; arcDeg: number}
export interface AttackSequenceSpec<M, D extends {type: string}> {
  hitCycle?: {max: number; increasedPerStack: number};
  cycleMax?: number;
  cycleBuff?: SequenceBuff<M>;
  vulnerability?: {perStack: number; duration: number; label: string};
  rhythm?: {bleed: number; impale: number};
  cycleArea?: {radiusPerStack: number; arcPerStack: number};
  consumeRhythm?: {multiplier: number};
  thrown?: D & SequenceProjectileDelivery;
  recovery?: {meleeRange: number; bleed: number; missCooldown: number; look: string};
  bounce?: {seconds: number; distance: number; radius: number; charge: string; amount: number;
    cap: number; airLook: string; nova: {count: number; power: number}};
  catchBuff?: {max: number; label: string; repeatInterval: number};
  flightRain?: {interval: number; power: number; range: number; radius: number};
  castSweeps?: {delay: number; delivery: D & SequenceMeleeDelivery; power: number}[];
  impactBleed?: {radius: number; power: number; bleed: number};
}
export interface SequenceGem {def: {id: string}; level: number; rolled?: unknown}
export interface SequenceSkill<I, M, Tag extends string, D extends {type: string}> {
  def: {id: string; name: string; tags: Tag[]; delivery: D; attackSequence?: AttackSequenceSpec<M, D>};
  level: number; bonusLevels?: number; treeNodes?: string[];
  sockets: (SequenceGem | null)[]; grafts?: SequenceGem[]; extraMods?: M[];
  state?: {trigDepth?: number}; sequenceRole?: 'primary' | 'payload'; sequenceHost?: I; procChainDepth?: number;
}
export interface SequenceStatus {sourceKey?: string; dps: number; stacks: number; remaining: number; rupture?: number}
export interface SequenceActor<A, I, Aim, M, Tag extends string> extends SequenceRecoveryOwner {
  id: number; pos: Aim; tier: number; radius: number; dead: boolean; life: number; facing: number;
  lifespan: number; look?: string; untargetable?: boolean; owner?: A;
  skills: (I | null)[]; aiActionInsts?: Map<string, I>; construct?: {castInst?: I; echo?: unknown};
  statuses: SequenceStatus[]; buffs: Map<string, {def: SequenceBuff<M>}>;
  sheet: {get(id: string, tags?: ReadonlySet<Tag>, mods?: readonly M[]): number; setBase(id: string, value: number): void};
  addBuff(buff: SequenceBuff<M>, durationScale?: number): void;
  removeBuff(id: string): void;
  gainCharge(id: string, amount: number, max: number, inst?: I): void;
  speedFactor(inst: I): number;
}
export interface SequenceProjectile<A, I, Aim> {
  caster: A; inst: I; pos: Aim; tier?: number; mult: number;
}
export interface SequenceWork<A, I> {caster: A; inst: I; kind?: string; targetId?: number}
export type SequenceQueue = 'salvos' | 'repeats' | 'steps' | 'followUps' | 'fuses';
export interface SequenceStatusApplication<Tag> {
  casterId: number; sourceKey: string; holdDischarge: boolean; rupture?: number; ruptureType?: Tag;
  stacksBonus: number; leech: number; propagates: boolean;
}
export interface SequenceMarkerSpec {
  type: 'construct'; kind: 'embed'; look: string; range: number; duration: number;
  maxActive: number; invulnerable: true; placeRange: number;
}
/** All ports are synchronous. Data is borrowed and observations stay live;
 * sinks may re-enter. Exceptions preserve prior writes rather than rolling back.
 * Geometry owns dimensions/units, while this controller owns ranges and timing. */
export interface AttackSequencePorts<A, I, P, Aim, M, Tag extends string, D extends {type: string}> {
  time(): number;
  random(): number;
  actors(): readonly A[];
  enemiesOf(actor: A): A[];
  distance(a: Aim, b: Aim): number;
  copyPosition(position: Aim): Aim;
  pointAt(origin: Aim, angle: number, distance: number): Aim;
  interpolate(from: Aim, to: Aim, ratio: number): Aim;
  clampPosition(at: Aim, radius: number, origin: Aim, tier: number): Aim;
  lineOfFire(from: Aim, to: Aim, tier: number): boolean;
  actorScale(actor: A): number;
  spec(inst: I): AttackSequenceSpec<M, D> | undefined;
  delivery(inst: I): D;
  tags(inst: I): ReadonlySet<Tag>;
  mods(inst: I): readonly M[];
  modifier(stat: string, kind: 'more' | 'increased', value: number): M;
  payload(host: I, delivery: D, tags?: Tag[]): I;
  sweep(host: I, delivery: D & SequenceMeleeDelivery): I;
  execute(actor: A, inst: I, aim: Aim,
    options: {noRepeat: true; noCooldown: true; dmgMult: number; componentUse: boolean}): undefined;
  spawnMarker(actor: A, inst: I, spec: SequenceMarkerSpec, at: Aim): A | null | undefined;
  spawnProjectile(actor: A, inst: I, at: Aim, angle: number,
    options: {mult: number; depth: number; inherit?: SequenceFlightInheritance}): undefined;
  inheritedFlight(projectile: P): SequenceFlightInheritance | undefined;
  statusDefinition(id: string): {element?: Tag; dotType?: unknown; duration: number};
  zoneLevel(): number;
  baselineStatusDps(id: string, level: number): number;
  applyStatus(actor: A, id: string, dps: number, durationScale: number, name: string, options: SequenceStatusApplication<Tag>): undefined;
  burst(owner: A, inst: I, target: A, amount: number): undefined;
  flights(): readonly P[];
  filterFlights(keep: (projectile: P) => boolean): undefined;
  work(queue: SequenceQueue): readonly SequenceWork<A, I>[];
  filterWork(queue: SequenceQueue, keep: (work: SequenceWork<A, I>) => boolean): undefined;
  /** Visit a snapshot, retiring matching zones in order through the host's
   * ordinary teardown path. Do not defer the predicate or the teardown. */
  retireZones(owned: (caster: A, inst: I) => boolean): undefined;
  kill(actor: A, silent: true): undefined;
  cycleCue(target: A, inst: I, step: number, maximum: boolean): undefined;
  impactCue(target: A, radius: number): undefined;
  flightCue(projectile: P): undefined;
  lodgedCue(at: Aim, target: A, inst: I): undefined;
  bounceCue(at: Aim, projectile: P, inst: I, radius: number, elapsed: number, ratio: number): undefined;
}
