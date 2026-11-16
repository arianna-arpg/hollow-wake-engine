import type {InstantRestorationEffect} from './resource-restoration.js';
import type {SkillHealingEffect, SkillStreamEffect} from './skill-recovery.js';

export type CastSelfEffect<Cue> = SkillHealingEffect | SkillStreamEffect<Cue> | InstantRestorationEffect
  | {readonly type: 'status'; readonly status: string; readonly chance: number; readonly magnitude?: number; readonly durationOverride?: number}
  | {readonly type: 'absorb'; readonly amount: number; readonly duration: number}
  | {readonly type: 'ward'; readonly amount: number; readonly perCharge?: boolean; readonly onHit?: true}
  | {readonly type: 'cleanse'; readonly count?: number}
  | {readonly type: 'shed'; readonly status: string};
export interface CastSelfActor {
  applyStatus(id: string, magnitude: number, durationScale: number, sourceName: string): void;
  endStatus(id: string): void;
  gainWard(amount: number): number;
}
export interface CastSelfSkill<Tag> {readonly def: {readonly name: string; readonly tags: readonly Tag[]}}
export interface CastSelfFrame<A, I> {
  readonly actor: A;
  readonly skill: I;
  readonly delivery: string;
  readonly durationScale: number;
  readonly useMultiplier: number;
  readonly chargesSpent: number;
  /** One lazily sampled critical result per use, shared by all pour lanes.
   * Never reuse this frame for another cast or another actor. */
  pourCritical?: number;
}
export interface CastSelfPorts<A, I, Cue, Tag> {
  absorbAmount(actor: A, skill: I, amount: number): number;
  absorb(actor: A, amount: number, duration: number): void;
  restore(actor: A, effect: InstantRestorationEffect, options: {tags: readonly Tag[]}): void;
  critical(actor: A, skill: I): number;
  stream(target: A, caster: A, skill: I, effect: SkillStreamEffect<Cue>, spent: number, critical: number): void;
  heal(caster: A, skill: I, target: A, effect: SkillHealingEffect, multiplier: number): void;
  cleanse(actor: A, count: number): void;
}

/** Caster effect phase after delivery. These are original routing semantics,
 * not contact status rules: self status ignores hit chance, while shed applies
 * regardless of delivery. Recovery ports bind the SDK's recovery services. */
export class CastSelfEffects<A extends CastSelfActor, I extends CastSelfSkill<Tag>, Cue, Tag> {
  constructor(readonly ports: CastSelfPorts<A, I, Cue, Tag>) {}
  apply(frame: CastSelfFrame<A, I>, effect: CastSelfEffect<Cue>): void {
    const {actor, skill} = frame;
    if (effect.type === 'shed') {actor.endStatus(effect.status); return;}
    if (frame.delivery !== 'self') return;
    switch (effect.type) {
      case 'status': actor.applyStatus(effect.status, 0, frame.durationScale, skill.def.name); return;
      case 'absorb':
        this.ports.absorb(actor, this.ports.absorbAmount(actor, skill, effect.amount), effect.duration * frame.durationScale);
        return;
      case 'restore': this.ports.restore(actor, effect, {tags: skill.def.tags}); return;
      case 'ward': actor.gainWard(effect.amount * (effect.perCharge ? Math.max(1, frame.chargesSpent) : 1)); return;
      case 'restoreOverTime':
        frame.pourCritical ??= this.ports.critical(actor, skill);
        this.ports.stream(actor, actor, skill, effect, frame.chargesSpent, frame.pourCritical);
        return;
      case 'heal': this.ports.heal(actor, skill, actor, effect, frame.useMultiplier); return;
      case 'cleanse': this.ports.cleanse(actor, effect.count ?? 2); return;
    }
  }
}
