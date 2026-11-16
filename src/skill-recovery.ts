import type {RestorationStream, StreamResource} from './restoration-streams.js';

export interface RecoverySkill<Tag, Cue> {
  readonly def: {readonly id: string; readonly tags: readonly Tag[]; readonly feedingCue?: Cue | false};
}
export interface SkillHealingEffect {
  readonly type: 'heal';
  readonly amount?: number;
  readonly pctMax?: number;
  readonly excludeCaster?: boolean;
  readonly chain?: number;
}
export interface SkillStreamEffect<Cue> {
  readonly type: 'restoreOverTime';
  readonly resource: StreamResource;
  readonly amount: number;
  readonly duration: number;
  readonly amountPerLevel?: number;
  readonly amountPctMax?: number;
  readonly perCharge?: boolean;
  readonly lane?: 'surge' | 'settle';
  readonly feedingCue?: Cue | false;
}
export interface SkillRecoveryActor<Position, Tags, Modifier, Cue, Tag> {
  readonly dead: boolean;
  readonly downed?: boolean;
  readonly untargetable?: boolean;
  readonly construct?: unknown;
  readonly team: unknown;
  readonly pos: Position;
  life: number;
  absorb: number;
  absorbTimer: number;
  readonly restoreStreams: RestorationStream<Cue>[];
  readonly gainEvents: {readonly length: number; push(event: {kind: 'heal' | 'restore'; id: StreamResource; depth: 0; n: number; dur?: number; tags: readonly Tag[]}): number};
  readonly sheet: {get(stat: string, tags?: Tags, modifiers?: readonly Modifier[]): number};
  maxLife(): number;
  availableMaxMana(): number;
  maxEs(): number;
  healBy(amount: number): number;
  cleanseDebuffs(count: number): number;
}
export interface SkillRecoveryPorts<A, I, Position, Tags, Modifier> {
  /** Granted tags participate in critical/healing queries, but the original
   * stream amount/duration fold deliberately uses the unextended context. */
  tags(skill: I, includeGranted: boolean): Tags;
  modifiers(skill: I): readonly Modifier[];
  level(skill: I): number;
  healOverTime(skill: I): {factor: number; seconds: number} | undefined;
  random(): number;
  actors(): readonly A[];
  sameLayer(a: A, b: A): boolean;
  distance(a: Position, b: Position): number;
  absorbCue(actor: A): void;
  criticalCue(at: Position): void;
  healCue(actor: A, landed: number): void;
  cleanseCue(actor: A): void;
  chainCue(caster: A, skill: I, from: A, to: A): void;
  arrivalCue(caster: A, skill: I, target: A): void;
  /** General AI owns threat; this ordered signal carries the landed amount. */
  healedAlly(caster: A, target: A, landed: number): void;
}

/** Skill recovery formulas and recipient selection over current actor bodies.
 * Content and frame admission occur before this borrowed-state rule service.
 * Presentation/AI callbacks are synchronous; earlier writes survive throws. */
export class SkillRecovery<
  A extends SkillRecoveryActor<Position, Tags, Modifier, Cue, Tag>,
  I extends RecoverySkill<Tag, Cue>, Position, Tags, Modifier, Cue, Tag,
> {
  constructor(readonly ports: SkillRecoveryPorts<A, I, Position, Tags, Modifier>) {}

  absorb(target: A, amount: number, duration: number): void {
    target.absorb = Math.max(target.absorb, amount);
    target.absorbTimer = Math.max(target.absorbTimer, duration);
    this.ports.absorbCue(target);
  }

  critical(caster: A, skill: I, at?: Position): number {
    const tags = this.ports.tags(skill, true), extra = this.ports.modifiers(skill);
    // Even a zero probability consumes the original single random draw.
    const probability = caster.sheet.get('critChance', tags, extra);
    if (!(this.ports.random() < probability)) return 1;
    const mult = caster.sheet.get('critMulti', tags, extra);
    if (at) this.ports.criticalCue(at);
    return mult;
  }

  stream(target: A, caster: A, skill: I, effect: SkillStreamEffect<Cue>, chargesSpent: number, critical?: number): void {
    const tags = this.ports.tags(skill, false), extra = this.ports.modifiers(skill);
    const maxPool = effect.resource === 'life' ? target.maxLife()
      : effect.resource === 'mana' ? target.availableMaxMana() : target.maxEs();
    const pct = (effect.amountPctMax ?? 0)
      + (effect.lane !== 'surge' ? caster.sheet.get('restorePctMax', tags, extra) : 0)
      + (effect.lane ? caster.sheet.get('pourPct_' + effect.lane, tags, extra) : 0);
    const base = effect.amount + (effect.amountPerLevel ?? 0) * Math.max(0, this.ports.level(skill) - 1) + pct * maxPool;
    const total = base * (effect.perCharge ? Math.max(1, chargesSpent) : 1)
      * caster.sheet.get('restorePower', tags, extra)
      * (effect.lane ? caster.sheet.get('pourPower_' + effect.lane, tags, extra) : 1)
      * (critical ?? this.critical(caster, skill, target.pos));
    if (total <= 0) return;
    const duration = Math.max(0.2, effect.duration * caster.sheet.get('effectDuration', tags, extra));
    target.restoreStreams.push({resource: effect.resource, perSec: total / duration, remaining: total,
      feedingCue: effect.feedingCue ?? skill.def.feedingCue});
    if (target.gainEvents.length < 64) target.gainEvents.push({kind: 'restore', id: effect.resource, depth: 0, n: total, dur: duration, tags: skill.def.tags});
  }

  heal(caster: A, skill: I, target: A, effect: SkillHealingEffect, mult = 1, quiet = false): number {
    if (target.dead || target.downed || (effect.excludeCaster && target === caster)) return 0;
    const tags = this.ports.tags(skill, true), extra = this.ports.modifiers(skill);
    const raw = ((effect.amount ?? 0) + (effect.pctMax ?? 0) * target.maxLife())
      * caster.sheet.get('healPower', tags, extra) * mult
      * this.critical(caster, skill, quiet ? undefined : target.pos);
    if (raw <= 0) return 0;
    const overTime = this.ports.healOverTime(skill);
    if (overTime) {
      const total = raw * overTime.factor;
      target.restoreStreams.push({resource: 'life', perSec: total / overTime.seconds, remaining: total, feedingCue: skill.def.feedingCue});
      return 0;
    }
    const landed = target.healBy(raw);
    if (landed > 0 && target.gainEvents.length < 64) target.gainEvents.push({kind: 'heal', id: 'life', depth: 0, n: landed, tags: skill.def.tags});
    const spill = raw * target.sheet.get('healTaken') - landed;
    if (spill > 0.5) {
      const overmend = caster.sheet.get('overheal', tags, extra);
      if (overmend > 0) this.absorb(target, Math.min(target.maxLife() * 0.5, spill * overmend), 6);
    }
    if (!quiet && landed >= 1) this.ports.healCue(target, landed);
    if (landed > 0 && caster !== target) this.ports.healedAlly(caster, target, landed);
    return landed;
  }

  chain(caster: A, skill: I, target: A, effect: SkillHealingEffect, mult = 1, quiet = false): void {
    this.heal(caster, skill, target, effect, mult, quiet);
    const tags = this.ports.tags(skill, true), extra = this.ports.modifiers(skill);
    let hops = (effect.chain ?? 0) + Math.round(caster.sheet.get('chainCount', tags, extra));
    const visited = new Set<A>([target]);
    let from = target, scale = mult;
    while (hops-- > 0) {
      let next: A | null = null, worst = 0.999;
      for (const actor of this.ports.actors()) {
        if (actor.dead || actor.downed || actor.untargetable || actor.construct || visited.has(actor)) continue;
        if (effect.excludeCaster && actor === caster) continue;
        if (actor.team !== caster.team || !this.ports.sameLayer(actor, from)) continue;
        if (this.ports.distance(from.pos, actor.pos) > 220) continue;
        const fraction = actor.life / Math.max(1, actor.maxLife());
        if (fraction < worst) {worst = fraction; next = actor;}
      }
      if (!next) break;
      scale *= 0.75;
      this.ports.chainCue(caster, skill, from, next);
      this.heal(caster, skill, next, effect, scale, quiet);
      this.ports.arrivalCue(caster, skill, next);
      visited.add(next);
      from = next;
    }
  }

  cleanse(target: A, count = 2): number {
    const stripped = target.cleanseDebuffs(count);
    if (stripped > 0) this.ports.cleanseCue(target);
    return stripped;
  }
}
