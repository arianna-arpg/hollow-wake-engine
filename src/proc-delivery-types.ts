import type {ProcCastSpec} from './proc-casting.js';
import type {ProcCooldownEffect} from './cooldowns.js';
import type {DelayedBurstEffect} from './delayed-bursts.js';
import type {ProcHealingEffect} from './life-recovery.js';
import type {WardEffect} from './proc-effects.js';
import type {ProcRestorationEffect} from './resource-restoration.js';

export interface DeliveryCue {readonly profile?: string; readonly color?: string}
export interface DeliveryBuff {readonly id: string; readonly storedCue?: DeliveryCue | false}
export interface DeliveryVent {readonly bank: string; readonly radius: number; readonly duration: number}
export interface DeliveryStatusEffect {readonly type: 'status'; readonly status: string; readonly magnitude?: number}

/** Executable fields of the frozen effects. Buff and birth records retain the
 * host's own representation. Definitions are borrowed and read synchronously. */
export type ProcDeliveryEffect<B extends DeliveryBuff, Birth, Damage extends string> =
  | {readonly type: 'extraHit'; readonly damageScale: number}
  | {readonly type: 'collisionDamage'; readonly damageScale: number}
  | {readonly type: 'explosion'; readonly damageScale: number; readonly radius: number}
  | {readonly type: 'arc'; readonly damageScale: number; readonly range: number; readonly hops: number}
  | {readonly type: 'displace'; readonly force: number}
  | {readonly type: 'gainCharge'; readonly charge: string; readonly amount: number; readonly max: number}
  | {readonly type: 'buff'; readonly buff: B}
  | {readonly type: 'summon'; readonly monsterId: string; readonly duration: number; readonly max: number}
  | {readonly type: 'birth'; readonly birth: Birth; readonly at?: 'target' | 'self'}
  | DeliveryStatusEffect | ProcHealingEffect | ProcRestorationEffect
  | {readonly type: 'burst'; readonly damage: Damage; readonly base: number; readonly perLevel: number; readonly radius: number}
  | DelayedBurstEffect<Damage>
  | {readonly type: 'fortify'; readonly flat?: number; readonly pctMaxLife?: number}
  | ProcCooldownEffect
  | {readonly type: 'removeBuff'; readonly buff: string | readonly string[]}
  | WardEffect
  | {readonly type: 'cleanse'; readonly statuses?: readonly string[]; readonly hardCC?: true; readonly afflictions?: true}
  | {readonly type: 'kindle'; readonly kind: string}
  | ({readonly type: 'vent'} & DeliveryVent)
  | {readonly type: 'cast'; readonly cast: ProcCastSpec};

export interface ProcDeliveryDefinition<B extends DeliveryBuff, Birth, Damage extends string> {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly effect: ProcDeliveryEffect<B, Birth, Damage>;
  readonly procCue?: DeliveryCue | false;
  readonly announceName?: boolean;
}

/** A live view into host-owned actor state. Nested delivery observes writes
 * immediately. A host may back the fields with its own component tables. */
export interface ProcDeliveryActor<A, I, P, B, Damage, Lifeline> {
  readonly pos: P;
  readonly radius: number;
  readonly level: number;
  readonly tier: number;
  readonly dead: boolean;
  readonly untargetable: boolean;
  readonly invulnerable: boolean;
  readonly owner?: A | null;
  readonly charges: {get(id: string): number | undefined};
  readonly buffs: {has(id: string): boolean};
  readonly statuses: readonly {readonly id: string}[];
  life: number;
  esBroke: boolean;
  hitFlash: number;
  hitFlashType?: Damage;
  sourceSkillId?: string;
  lifelineId?: Lifeline;
  summonInst?: I;
  lifespan: number;
  gainCharge(id: string, amount: number, max: number, instance: I | undefined, depth: number): void;
  addBuff(buff: B, duration: number, depth: number): void;
  removeBuff(id: string): void;
  endStatus(id: string): void;
  maxLife(): number;
  gainEndurance(amount: number): number;
}

export interface ProcDeliveryPorts<A, I, P, Direction, B extends DeliveryBuff, Birth, Damage extends string, Lifeline, Def> {
  /** null supplies the original explicitly empty skill context. An omitted
   * instance requests an unscoped stat read (used by vent duration). */
  stat(actor: A, name: string, instance?: I | null): number;
  buffCue(buff: B): DeliveryCue | false | undefined;
  withStoredCue(buff: B, cue: DeliveryCue | false): B;
  cue(actor: A, cue: DeliveryCue | false, phase: 'gain' | 'release', id: string): void;
  status(effect: DeliveryStatusEffect, name: string, actor: A, instance: I | null, target: A | null): void;
  heal(actor: A, effect: ProcHealingEffect): boolean;
  restore(actor: A, effect: ProcRestorationEffect): boolean;
  cooldown(actor: A, effect: ProcCooldownEffect, instance: I | null): boolean;
  ward(actor: A, effect: WardEffect): boolean;
  delayed(actor: A, effect: DelayedBurstEffect<Damage>, color: string, depth: number, target: A | null): void;
  statusDefinition(id: string): {readonly hardCC?: unknown; readonly dotType?: unknown} | undefined;
  enemies(actor: A): Iterable<A>;
  sameStory(origin: A, candidate: A): boolean;
  distance(from: P, to: P): number;
  direction(from: P, to: P): Direction;
  copyPosition(at: P): P;
  /** Receives a detached position. The host may retain it for presentation. */
  flash(at: P, radius: number, color: string, life: number): void;
  arcTrail(from: A, to: A, proc: Def): void;
  strikeSurfaces(actor: A, at: P, radius: number): void;
  hit(actor: A, instance: I, target: A, scale: number, depth: number): void;
  mitigate(target: A, type: Damage, amount: number): number;
  text(at: P, value: string, color: string, size: number): void;
  shieldBreak(target: A, depth: number): void;
  sweepDefenses(target: A, depth: number): void;
  kill(target: A): void;
  push(target: A, direction: Direction, force: number): void;
  summonCount(owner: A, key: string): number;
  createMonster(id: string, owner: A): A;
  lifeline(owner: A): Lifeline | undefined;
  forwardSockets(instance: I, summon: A): void;
  placeSummon(summon: A, target: A, scatter: number): void;
  publishSummon(summon: A): void;
  birth(owner: A, effect: Birth, at: P, host: boolean, capKey: string): void;
  lightwell(kind: string, at: P): void;
  vent(effect: DeliveryVent, at: P, scale: number, duration: number, tier: number): void;
  cast(actor: A, instance: I | null, target: A | null, depth: number, spec: ProcCastSpec, aim?: P): void;
  riders(def: Def, actor: A, instance: I | null, target: A | null, depth: number): void;
}
