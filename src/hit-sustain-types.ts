/** Trusted borrowed state. Validate authored content before entering combat. */
export interface HitSustainSkill<Cue> {
  siphon?: number;
  bondFeed?: number | null;
  feedingCue?: Cue | false;
}
export interface HitSustainConstruct {
  range: number;
  healBurst?: {cap: number};
  stored?: number;
  baseRadius?: number;
}
export interface HitSustainActor<P, M, Tag extends string> {
  id: number;
  dead: boolean;
  team: string;
  pos: P;
  radius: number;
  bond?: {targetId: number; buffId: string};
  construct?: HitSustainConstruct;
  buffs: {has(id: string): boolean};
  sheet: {get(id: string, tags?: ReadonlySet<Tag>, extra?: readonly M[]): number};
  healBy(amount: number): number;
}
/** All ports are synchronous. Actor arrays and records remain host-owned. */
export interface HitSustainPorts<A, S, P, Tag extends string, Cue> {
  /** Read separately for sharing, bond lookup and tree traversal. */
  actors(): readonly A[];
  tags(definition: S): ReadonlySet<Tag>;
  sameStory(a: A, b: A): boolean;
  distance(from: P, to: P): number;
  /** May be a live getter when the host supports mutable configuration. */
  readonly sharingRadius: number;
  resourceFlow(recipient: A, source: A, amount: number, cue: Cue | false | undefined): void;
  sharedHealingCue(recipient: A, amount: number): void;
  bondedHealingCue(recipient: A, amount: number): void;
}
