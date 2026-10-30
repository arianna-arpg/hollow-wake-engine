import type {StatusDamageType} from './status-lifecycle-types.js';

export interface HitAftermathSkill<Tag extends string> {
  id: string;
  color: string;
  tags: readonly Tag[];
  delivery: {type: string};
  currentLifeDamage?: number;
  retaliate?: {charge: string; monsterId: string; duration: number; max: number};
  throng?: unknown;
}
export interface HitAftermathInstance<S> {
  def: S;
  state?: {trigDepth?: number; contagion?: {gen: number; seen: Set<number>}};
}
export interface HitAftermathPacket<Tag extends string> {
  amounts: Partial<Record<string, number>>;
  tags: Set<Tag>;
}
export interface HitAftermathContagion {
  chance: number; skillId?: string; decay?: number; maxGenerations?: number;
  delay?: number; damageScale?: number;
}
export interface HitAftermathSpread {
  chance: number; radius: number; strengthScale?: number;
  duration?: 'remaining' | 'refresh'; durationScale?: number;
}
export interface HitAftermathSpawn {
  every?: true; pct?: number; hits?: number;
  monsterId: string; count: number; cap: number;
}
export interface HitAftermathSocket {def: {id: string}; gauge?: number}
export interface HitAftermathActor<A, I, P, M, Tag extends string, Status> {
  id: number; team: string; pos: P; radius: number; tier?: number; level: number;
  life: number; mana: number; es: number; dead: boolean; invulnerable: boolean;
  untargetable: boolean; defId?: string; rarity?: string; owner?: A;
  sourceSkillId?: string; summonInst?: I; lifespan?: number;
  construct?: {castOnStruck?: unknown};
  volatile?: {skillId: string; chance: number; icd?: number; dmgMult?: number; cue?: string | false};
  volatileReadyAt: number; volatileInst?: I;
  onHitByType?: Partial<Record<string, {status?: string; chance?: number; skillId?: string; dmgMult?: number}>>;
  onHitTypeReadyAt: number; onHitTypeIcd?: number; onHitTypeInsts?: Map<string, I>;
  contagionReadyAt: number;
  statuses: readonly Status[];
  hexToggles: ReadonlyMap<string, {inst: I}>;
  skills: readonly (I | null | undefined)[];
  charges: ReadonlyMap<string, number>;
  gripping?: {id: number; severed: number};
  ironWard?: {until: number; stored: number; cap: number};
  hitFlash: number; hitFlashType?: StatusDamageType;
  strideDist: number; strideSpent: boolean;
  sheet: {get(id: string, tags?: ReadonlySet<Tag>, extra?: readonly M[]): number};
  applyStatus(id: string, dps: number, durationScale: number, sourceName: string): void;
  addBuff(effect: {type: 'buff'; id: string; duration: number; mods: M[]}): unknown;
  isMinion(): boolean;
  maxLife(): number;
  lifeCeiling(): number;
  spendCharge(id: string, amount: number): unknown;
  gainCharge(id: string, amount: number, max: number, inst?: I): unknown;
  healBy(amount: number): unknown;
  availableMaxMana(): number;
  maxEs(): number;
  spendBuffs(event: 'hit' | 'crit' | 'kill' | 'hurt', tags?: readonly Tag[], skillId?: string): void;
  noteRecent(event: 'kill'): void;
  conditionHolds(condition: 'strided'): boolean;
}

/** The existing status capability owns the full frame. Aftermath only reads the
 * captured tags and forwards the same frame through its three composition seams. */
export interface HitAftermathFrame<Tag extends string> {readonly tags: Set<Tag>}

/** Trusted synchronous ports. Bind once; no per-hit state is retained here.
 * Definitions, rows, arrays, queues and actor records remain borrowed and live.
 * The host owns vectors/directions, spatial services, actual delivery and cues;
 * the service owns eligibility, numeric policy and the complete phase order. */
export interface HitAftermathPorts<A extends {team: string}, I, S, P, Direction, M, Tag extends string, Status, Socket, Frame, Packet, Tone, Effect> {
  time(): number;
  actors(): readonly A[];
  appendActor(actor: A): void;
  skill(id: string): S | undefined;
  monster(id: string): {boss?: boolean} | undefined;
  makeInstance(def: S, level: number): I;
  effectiveLevel(inst: I): number;
  chance(probability: number): boolean;
  pick<T>(values: readonly T[]): T;
  /** Read the actor's current coordinates in the host's component order. */
  copyPosition(actor: A): P;
  scatterPosition(actor: A, halfExtent: number): P;
  clampPoint(point: P, radius: number): P;
  distance(from: P, to: P): number;
  direction(from: P, to: P): Direction;
  randomDirection(): Direction;
  randomPhase(): number;
  sameStory(actor: A, victim: A): boolean;
  enemies(caster: A): readonly A[];
  executeSkill(caster: A, inst: I, at: P, options: {
    dmgMult: number; noCooldown: true; noRepeat: true; keepFacing: true;
  }): void;
  volatileCue(target: A, origin: P, color: string): void;
  knockFixtures(caster: A, target: A, tone: Tone | null, wounding: boolean, inst: I): void;
  contagion(inst: I): HitAftermathContagion | undefined;
  readonly contagionConfig: {readonly maxGenerations: number; readonly decay: number; readonly actorIcd: number; readonly delay: number};
  queueContagion(release: {
    when: number; caster: A; skillId: string; level: number; host: A;
    at: P; gen: number; seen: Set<number>; damageScale: number;
  }): void;
  flash(at: P, radius: number, color: string, life: number, edgeFraction?: number): void;
  spreadOnHit(inst: I): HitAftermathSpread | undefined;
  transplant(target: A, status: Status, sourceName: string, spec: HitAftermathSpread): void;
  curseOnHit(inst: I): {damageScale?: number} | undefined;
  resolveHit(caster: A, inst: I, target: A, multiplier: number, depth: number, forceDamage?: true): void;
  dischargeStatuses(caster: A, target: A, packet: Packet, dealt: number, depth: number): void;
  plantAssault(caster: A, target: A, packet: Packet, depth: number, dealt: number): void;
  plantImpale(caster: A, target: A, def: S, packet: Packet, extra: M[], dealt: number, depth: number): void;
  flatPhysicalModifier(amount: number): M;
  dominate(inst: I): {chance: number; max: number; duration: number} | undefined;
  createMonster(id: string, level: number, team: A['team'], owner: A): A;
  companionBindCue(actor: A, owner: A, definition: S): void;
  companionArrivalCue(actor: A, inst: I): void;
  thorns(target: A, caster: A, dealt: number): void;
  kill(target: A, silent?: false, caster?: A): void;
  minionsOfSkill(owner: A, skillId: string): readonly A[];
  readonly deliveryKnock: Readonly<Record<string, number | undefined>>;
  readonly deliveryKnockDefault: number;
  push(target: A, direction: Direction, strength: number, caster: A, inst: I): void;
  resistance(target: A, type: 'lightning' | 'fire' | 'cold' | 'chaos'): number;
  currentLifeDamageCue(target: A, amount: number): void;
  prepareStatuses(caster: A, inst: I, target: A, def: S, extra: M[], packet: Packet, dealt: number, depth: number, afflictionCarry: number): Frame;
  applyRiders(frame: Frame): void;
  beforeEffects(caster: A, inst: I, target: A, dealt: number, depth: number): void;
  dispatchEffects(frame: Frame, damageMultiplier: number, deliveryEffects?: Effect[]): void;
  applyGrantedStatuses(frame: Frame): void;
  strikeSurfaces(caster: A, at: P, radius: number, tier: number | undefined): void;
  orbCount(): number;
  readonly orbCap: number;
  orbKeys(): readonly string[];
  orbOnHitStat(id: string): string;
  orbHitChance(caster: A, id: string, chance: number, time: number): number;
  shedOrb(id: string, at: P, options: {scatter: number; tier: number | undefined}): void;
  remnantCount(): number;
  appendRemnant(remnant: {pos: P; element: 'fire' | 'cold' | 'lightning'; bob: number; life: number}): void;
  ringBell(target: A): void;
  throngOnHit(caster: A, target: A, crit: boolean, lethal: boolean): void;
  throngSplash(inst: I): number | undefined;
  throngBurst(caster: A, at: P, radius: number, scale: number, exclude: A): void;
  sockets(inst: I): readonly Socket[];
  spawnSpec(socket: Socket): HitAftermathSpawn | null | undefined;
  readonly spawnDuration: number;
  birth(caster: A, effect: {
    type: 'birth'; monsterId: string; count: [number, number]; cap: number; duration: number;
  }, at: P, options: {host: true; capKey: string}): void;
  hitProcs(caster: A, inst: I, target: A, packet: Packet, dealt: number, depth: number, crit: boolean, lethal: boolean, elite: boolean, tags: Set<Tag>, extra: M[]): void;
  carryProcs(owner: A, inst: I, target: A, packet: Packet, dealt: number, depth: number, crit: boolean, lethal: boolean, elite: boolean, tags: Set<Tag>, extra: M[]): boolean;
  chargeGains(inst: I): readonly {on: string; chance?: number; charge: string; amount: number; max: number}[];
  rollKillOrbs(caster: A, inst: I, target: A): void;
  rollKillRemnants(caster: A, inst: I, at: P): void;
  assaultAfterHit(caster: A, target: A, dealt: number, depth: number, hasDamage: boolean): void;
  assaultDoomCull(target: A): void;
  challengeAfterHit(caster: A, inst: I, target: A, dealt: number, depth: number, multiplier: number): void;
  sequenceLanded(caster: A, inst: I, target: A, dealt: number, physical: number, depth: number): void;
  companionOnHit(caster: A, inst: I, target: A): void;
  contextTags(inst: I): ReadonlySet<Tag>;
  strideCue(caster: A): void;
  killCharges(caster: A, target: A): void;
  rollTriggers(caster: A, event: 'kill' | 'meleeHit', context: {depth?: number; aim: P; sourceInst: I}): void;
  instanceTrigger(inst: I): unknown;
}
