import type {BuffDefinition, BuffModifier} from './buffs.js';

export interface CastBuff<M extends BuffModifier, Tag extends string> extends BuffDefinition<M, Tag> {
  readonly affects?: 'caster' | 'allies' | 'minions';
  readonly radius?: number;
  readonly powerStacks?: number;
  readonly powerScaled?: boolean;
}
export interface BuffSkill<I, Tag> {
  readonly def: {readonly tags: readonly Tag[]; readonly gauge?: unknown};
  readonly state?: {readonly gaugePower?: number};
  readonly followUpHost?: I;
}
export interface CastBuffActor<A, Tags, M, D> {
  readonly team: unknown;
  readonly dead: boolean;
  readonly downed?: boolean;
  readonly construct?: unknown;
  readonly tier: number;
  readonly owner?: A | null;
  readonly pos: {readonly x: number; readonly y: number};
  readonly radius: number;
  readonly buffs: ReadonlyMap<string, {readonly def: D}>;
  readonly sheet: {get(stat: string, tags: Tags, modifiers: readonly M[]): number};
  isMinion(): boolean;
}
export interface CastBuffPorts<A, I, Tags, M, D, Tag> {
  actors(): readonly A[];
  tags(skill: I, granted: boolean): Tags;
  tagList(tags: Tags): Tag[];
  modifiers(skill: I): readonly M[];
  hasTreeBuffs(skill: I): boolean;
  grant(actor: A, effect: D, duration: number, depth: 0, tags: readonly Tag[]): void;
  remove(actor: A, id: string): void;
  arrival(caster: A, skill: I, target: A): void;
}

/** Composes authored recipient/scaling policy with BuffRuntime. Private weak
 * associations allow a live build change to retire only buffs captured by the
 * old skill allocation, without requiring a save/account owner. */
export class CastBuffs<
  A extends CastBuffActor<A, Tags, M, D>, I extends BuffSkill<I, Tag>, Tags,
  M extends BuffModifier, D extends CastBuff<M, Tag>, Tag extends string,
> {
  readonly #sources = new WeakMap<D, {caster: A; skill: I}>();
  constructor(readonly ports: CastBuffPorts<A, I, Tags, M, D, Tag>) {}

  /** Post-cast cycle buffs use the same exact-instance retirement ledger. */
  associate(effect: D, caster: A, skill: I): void { this.#sources.set(effect, {caster, skill}); }

  grant(caster: A, target: A, skill: I, effect: D, duration: number): void {
    const followUpHost = skill.followUpHost;
    skill = followUpHost ?? skill;
    if (!followUpHost && !this.ports.hasTreeBuffs(skill)) {
      this.ports.grant(target, effect, duration, 0, skill.def.tags);
    } else {
      const tagged = {...effect};
      this.#sources.set(tagged, {caster, skill});
      this.ports.grant(target, tagged, duration, 0, this.ports.tagList(this.ports.tags(skill, false)));
    }
    if (target.buffs.has(effect.id)) this.ports.arrival(caster, skill, target);
  }

  apply(caster: A, skill: I, effect: D, duration: number, multiplier = 1): void {
    const power = skill.def.gauge ? skill.state?.gaugePower ?? 1 : 1;
    const stacked = effect.powerStacks !== undefined ? {...effect, stacksOnApply: Math.max(1, Math.round(effect.powerStacks * power))} : effect;
    const scaled = stacked.powerScaled && multiplier !== 1
      ? {...stacked, mods: stacked.mods.map(mod => ({...mod, value: mod.value * multiplier}))} : stacked;
    if (effect.affects === 'allies') {
      const radius = (effect.radius ?? 0) * caster.sheet.get('aoeRadius', this.ports.tags(skill, false), this.ports.modifiers(skill));
      for (const ally of this.ports.actors()) {
        if (ally.team === caster.team && !ally.dead && !ally.downed && !ally.construct && ally.tier === caster.tier
          && Math.hypot(ally.pos.x - caster.pos.x, ally.pos.y - caster.pos.y) <= radius + ally.radius)
          this.grant(caster, ally, skill, scaled, duration);
      }
    } else if (effect.affects === 'minions') {
      for (const actor of this.ports.actors()) {
        if (actor.owner === caster && !actor.dead && actor.isMinion() && !actor.construct)
          this.grant(caster, actor, skill, scaled, duration);
      }
      const share = caster.sheet.get('offeringShare', this.ports.tags(skill, true), this.ports.modifiers(skill));
      if (share > 0) this.grant(caster, caster, skill, {...scaled, id: scaled.id + '_shared', affects: 'caster',
        mods: scaled.mods.map(mod => ({...mod, value: mod.value * share}))}, duration);
    } else this.grant(caster, caster, skill, scaled, duration);
  }

  /** Live map iteration matches the original rebuild phase. */
  retire(caster: A, skill: I): void {
    for (const actor of this.ports.actors()) for (const [id, buff] of actor.buffs) {
      const source = this.#sources.get(buff.def);
      if (source?.caster === caster && source.skill === skill) this.ports.remove(actor, id);
    }
  }
}
