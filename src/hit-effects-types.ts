/** Minimum fields read by dispatch, not a serialized or complete effect schema.
 * Extend each row with the payload required by its host verb. */
export interface HitEffectSet {
  heal: {type: 'heal'; excludeCaster?: boolean};
  cleanse: {type: 'cleanse'; count?: number};
  buff: {type: 'buff'; id: string; bond?: boolean};
  rupture: {type: 'rupture'; status: string; fraction: number; mul?: number};
  status: {type: 'status'};
  knockback: {type: 'knockback'; mode?: 'shove' | 'buffet'; strength: number};
  grabSeize: {type: 'grabSeize'};
  possess: {type: 'possess'};
  pull: {type: 'pull'; stun?: number};
  absorb: {type: 'absorb'; amount: number; duration: number};
  restore: {type: 'restore'};
  ward: {type: 'ward'; amount: number; onHit?: boolean};
  siphonOrb: {type: 'siphonOrb'; resource: 'life' | 'mana' | 'es'; amount: number};
  birth: {type: 'birth'; onHit?: boolean};
  spreadStatus: {type: 'spreadStatus'; radius: number; statuses?: readonly string[]; maxTargets?: number};
  transfuseStatus: {type: 'transfuseStatus'; statuses?: readonly string[]; splash?: number};
}
/** Other delivery phases may share this list. Known discriminators cannot use
 * the ignored-row escape hatch to omit required dispatch fields. */
export type HitEffectInput<E extends HitEffectSet, Other extends string = never> =
  E[keyof HitEffectSet] | {type: string extends Other ? never : Exclude<Other, keyof HitEffectSet>};

export interface HitEffectSkill<Tag extends string> {id: string; name: string; color: string; tags: Tag[]}
export interface HitEffectActor<A, P, M, Tag extends string, Status> {
  id: number; team: string; dead: boolean; radius: number; pos: P; tier?: number;
  construct?: unknown; anchored?: boolean; leap?: unknown; owner?: A;
  bond?: {targetId: number; buffId: string}; statuses: Status[];
  sheet: {
    get(id: string, tags?: ReadonlySet<Tag>, extra?: readonly M[]): number;
    removeSource(id: string): void;
  };
  gainWard(amount: number): unknown;
  applyStatus(id: string, dps: number, durationScale: number, sourceName: string): void;
}
/** Borrows the existing hit frame. Captured fields are immutable; records are live. */
export interface HitEffectFrame<A, I, S, M, Tag extends string> {
  readonly caster: A; readonly target: A; readonly inst: I; readonly def: S;
  readonly tags: Set<Tag>; readonly extra: M[];
  readonly durScale: number; readonly dealt: number; readonly depth: number;
}
export interface HitEffectPorts<A, I, P, Direction, M, Tag extends string, Status, E extends HitEffectSet, Other extends string, Frame> {
  effects(inst: I): readonly HitEffectInput<E, Other>[];
  heal(caster: A, inst: I, target: A, effect: E['heal'], damageMultiplier: number): void;
  cleanse(target: A, count: number): void;
  buff(caster: A, target: A, inst: I, effect: E['buff'], durationScale: number): void;
  rupture(caster: A, target: A, status: string, fraction: number, multiplier: number, tags: Set<Tag>, extra: M[]): void;
  status(frame: Frame, effect: E['status']): void;
  direction(from: P, to: P): Direction;
  randomDirection(): Direction;
  distance(from: P, to: P): number;
  push(target: A, direction: Direction, strength: number, caster: A, inst: I): void;
  grab(caster: A, inst: I, target: A, effect: E['grabSeize']): void;
  possess(caster: A, inst: I, target: A, effect: E['possess']): void;
  dormant(target: A): boolean;
  absorbAmount(caster: A, inst: I, base: number): number;
  absorb(target: A, amount: number, duration: number): void;
  restore(target: A, effect: E['restore'], context: {tags: Tag[]}): void;
  orb(resource: E['siphonOrb']['resource'], at: P, options: {
    scatter: number; amount: number; life: number; homeTo: A; clamp: false; flowFromTier: number;
  }): void;
  copyPosition(at: P): P;
  birth(caster: A, inst: I, effect: E['birth'], at: P, options: {host: true}): void;
  enemies(caster: A): readonly A[];
  sameStory(actor: A, target: A): boolean;
  transplant(target: A, status: Status, sourceName: string, effect: E['spreadStatus'] | E['transfuseStatus']): void;
  /** Receives an already copied position. */
  flash(at: P, radius: number, color: string, life: number): void;
  fail(caster: A, key: string, message: string): void;
}
