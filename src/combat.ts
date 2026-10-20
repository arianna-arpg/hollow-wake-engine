import { Character } from './character.js';
import { Content, ConfiguredSkill } from './content.js';
import { Random } from './random.js';
import { StatSheet } from './stats.js';
import type { CharacterBuild, ContentPack, HitReceipt, RandomState, SkillSelection, TargetSpec } from './types.js';
import { copy, finite } from './validation.js';

interface AttackPlan {
  revision: number;
  ranges: Uint8Array;
  lo: Float64Array;
  hi: Float64Array;
  added: Float64Array;
  multipliers: Float64Array;
  conversions: Float64Array;
  extras: Float64Array;
  penetrations: Float64Array;
  armorPen: number;
  armorFloor: number;
  thorns: number;
  dominion: number;
  lucky: number;
  unlucky: number;
  critChance: number;
  critMulti: number;
  manaCost: number;
  lifeCost: number;
  cooldown: number;
}
export interface DamagePreview {
  bands: Record<string, { lo: number; hi: number }>;
  total: { lo: number; hi: number };
  critChance: number;
  critMulti: number;
}

/** A plain defender for the declared contact capability; no hidden World or browser state. */
export class Target {
  readonly sheet: StatSheet;
  private currentLife: number;
  private revision = -1;
  private resistance: Float64Array;
  private armor = 0;
  private taken = 1;
  private avoid = 0;
  constructor(readonly content: Content, input: TargetSpec) {
    finite(input.life, 'target life');
    if (input.life <= 0) throw new Error('Target life must be positive');
    for (const mod of input.mods ?? []) {
      const allowed = ['armor', 'damageTaken', 'critAvoid',
        ...content.pack.damageTypes.flatMap(type => [`${type}Res`, `${type}ResMax`])];
      if (!allowed.includes(mod.stat) || mod.kind === 'link' || mod.tags?.length || mod.when || mod.gauge) {
        throw new Error(`Unsupported target defense: ${mod.stat}`);
      }
    }
    this.sheet = new StatSheet(content.rules);
    this.sheet.setBase('life', input.life);
    this.sheet.setSource('defense', input.mods ?? []);
    this.currentLife = input.life;
    this.resistance = new Float64Array(content.pack.damageTypes.length);
  }
  get life(): number { return this.currentLife; }
  get critAvoid(): number { this.refresh(); return this.avoid; }
  snapshot(): { life: number; spec: TargetSpec } {
    return { life: this.life, spec: { life: this.sheet.get('life'), mods: copy(this.sheet.getSourceMods('defense') ?? []) } };
  }
  static restore(content: Content, snapshot: ReturnType<Target['snapshot']>): Target {
    const target = new Target(content, snapshot.spec);
    finite(snapshot.life, 'current life');
    if (snapshot.life > snapshot.spec.life) throw new Error('Target life exceeds maximum');
    target.currentLife = snapshot.life;
    return target;
  }
  /** Internal arithmetic boundary. No callbacks occur while the engine reuses its scratch buffer. */
  receive(amounts: Float64Array, plan: AttackPlan): number {
    this.refresh();
    const { damageTypes, defense } = this.content.pack;
    let total = 0;
    for (let i = 0; i < damageTypes.length; i++) {
      let damage = amounts[i];
      if (damage <= 0) continue;
      if (damageTypes[i] === 'physical') {
        const armor = Math.max(0, this.armor * (1 - plan.armorPen));
        damage *= Math.max(plan.armorFloor, defense.armorK * damage / (armor + defense.armorK * damage));
      } else {
        let res = this.resistance[i];
        if (plan.penetrations[i] > 0) res = Math.max(defense.resistanceFloor, res - plan.penetrations[i]);
        damage *= 1 - res;
      }
      total += damage;
    }
    total *= this.taken;
    this.currentLife -= total; // Preserve original overkill arithmetic; callers decide death presentation.
    return total;
  }
  private refresh(): void {
    if (this.revision === this.sheet.revision) return;
    const pack = this.content.pack;
    for (let i = 0; i < pack.damageTypes.length; i++) {
      const type = pack.damageTypes[i];
      this.resistance[i] = type === 'physical' ? 0 : Math.min(
        this.sheet.get(`${type}Res`),
        this.sheet.get(`${type}ResMax`), pack.defense.resistanceHardCap);
    }
    this.armor = this.sheet.get('armor');
    this.taken = this.sheet.get('damageTaken');
    this.avoid = this.sheet.get('critAvoid');
    this.revision = this.sheet.revision;
  }
}

/**
 * Synchronous contact-resolution kernel. The host supplies an already valid spell contact.
 * It does not advance time, debit casting costs, move projectiles, or run deferred effects.
 */
export class Engine {
  readonly content: Content;
  private random: Random;
  private plans = new WeakMap<StatSheet, WeakMap<ConfiguredSkill, AttackPlan>>();
  private scratch: Float64Array;
  private builds = 0;
  constructor(content: Content | ContentPack, seed = 1) {
    this.content = content instanceof Content ? content : new Content(content);
    this.random = new Random(seed);
    this.scratch = new Float64Array(this.content.pack.damageTypes.length);
  }
  character(build: CharacterBuild): Character { return new Character(this.content, build); }
  skill(selection: SkillSelection): ConfiguredSkill { return this.content.skill(selection); }
  target(spec: TargetSpec): Target { return new Target(this.content, spec); }
  get planBuilds(): number { return this.builds; }
  randomSnapshot(): RandomState { return this.random.snapshot(); }
  restoreRandom(state: RandomState): void { this.random = Random.restore(state); }
  costs(character: Character, skill: ConfiguredSkill): { mana: number; life: number; cooldown: number } {
    const plan = this.plan(character, skill);
    return { mana: plan.manaCost, life: plan.lifeCost, cooldown: plan.cooldown };
  }
  preview(character: Character, skill: ConfiguredSkill): DamagePreview {
    const plan = this.plan(character, skill);
    this.fold(plan, 0);
    const lo = this.scratch.slice();
    this.fold(plan, 1);
    const bands: DamagePreview['bands'] = {};
    const total = { lo: 0, hi: 0 };
    for (let i = 0; i < lo.length; i++) {
      const hi = this.scratch[i];
      if (lo[i] <= 0 && hi <= 0) continue;
      bands[this.content.pack.damageTypes[i]] = { lo: lo[i], hi };
      total.lo += lo[i]; total.hi += hi;
    }
    return { bands, total, critChance: plan.critChance, critMulti: plan.critMulti };
  }
  resolveHit(character: Character, skill: ConfiguredSkill, target: Target): HitReceipt {
    if (target.content !== this.content || target.life <= 0) throw new Error('Invalid or dead target');
    const plan = this.plan(character, skill);
    const start = this.random.draws;
    const lucky = this.random.next() < plan.lucky;
    const unlucky = this.random.next() < plan.unlucky;
    const rollT = this.fold(plan, 2, lucky === unlucky ? 0 : lucky ? 1 : -1);
    let crit = false;
    if (this.scratch.some(value => value > 0)) {
      crit = this.random.next() < plan.critChance;
      if (crit) for (let i = 0; i < this.scratch.length; i++) this.scratch[i] *= plan.critMulti;
    }
    const outgoing = this.amounts();
    // The reference samples passive block even at zero. Preserve stream ordering for this capability.
    this.random.next();
    if (crit && this.random.next() < target.critAvoid) {
      if (plan.critMulti > 1) for (let i = 0; i < this.scratch.length; i++) this.scratch[i] /= plan.critMulti;
      crit = false;
    }
    const damage = target.receive(this.scratch, plan);
    return { outgoing, crit, rollT, damage, life: target.life, randomDraws: this.random.draws - start };
  }
  private amounts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (let i = 0; i < this.scratch.length; i++) if (this.scratch[i] > 0) out[this.content.pack.damageTypes[i]] = this.scratch[i];
    return out;
  }
  private fold(plan: AttackPlan, pick: 0 | 1 | 2, luck = 0): number | undefined {
    const a = this.scratch;
    a.fill(0);
    let weight = 0, weighted = 0;
    for (let i = 0; i < a.length; i++) {
      let base = 0;
      if (plan.ranges[i]) {
        const lo = plan.lo[i], hi = plan.hi[i];
        if (pick < 2) base = pick ? hi : lo;
        else {
          base = lo + this.random.next() * (hi - lo);
          if (luck) {
            const second = lo + this.random.next() * (hi - lo);
            base = luck > 0 ? Math.max(base, second) : Math.min(base, second);
          }
          if (hi > lo) {
            const mid = (lo + hi) / 2;
            weighted += ((base - lo) / (hi - lo)) * mid;
            weight += mid;
          }
        }
      }
      const amount = (base + plan.added[i]) * plan.multipliers[i];
      if (amount > 0) a[i] = amount;
    }
    const physical = this.content.pack.damageTypes.indexOf('physical');
    if (physical >= 0 && plan.thorns > 0) a[physical] += plan.thorns;
    if (plan.dominion > 0) {
      let total = 0;
      for (const amount of a) total += amount;
      if (total > 0) {
        const scale = (total + plan.dominion) / total;
        for (let i = 0; i < a.length; i++) a[i] *= scale;
      }
    }
    // Conversion order is authored damage-type order, including the original sequential chaining.
    for (let from = 0; from < a.length; from++) {
      const amount = a[from];
      if (!amount) continue;
      let remaining = 1;
      for (let to = 0; to < a.length; to++) {
        if (to === from || remaining <= 0) continue;
        const fraction = plan.conversions[from * a.length + to];
        if (fraction <= 0) continue;
        const taken = Math.min(remaining, fraction);
        remaining -= taken;
        a[to] += amount * taken;
      }
      if (remaining < 1) a[from] = remaining <= 0.0001 ? 0 : amount * remaining;
    }
    let total = 0;
    for (const amount of a) total += amount;
    if (total > 0) for (let i = 0; i < a.length; i++) if (plan.extras[i] > 0) a[i] += total * plan.extras[i];
    return weight > 0 ? weighted / weight : undefined;
  }
  private plan(character: Character, skill: ConfiguredSkill): AttackPlan {
    if (character.content !== this.content) throw new Error('Character belongs to different content');
    let bySkill = this.plans.get(character.sheet);
    if (!bySkill) this.plans.set(character.sheet, bySkill = new WeakMap());
    const cached = bySkill.get(skill);
    if (cached?.revision === character.sheet.revision) return cached;
    character.validateSkill(skill);
    const sheet = character.sheet, def = skill.definition, tags = skill.tags, extra = skill.mods;
    const types = this.content.pack.damageTypes;
    const n = types.length, array = () => new Float64Array(n);
    const get = (id: string, context: ReadonlySet<string> = tags) => sheet.get(id, context, extra);
    const plan: AttackPlan = {
      revision: sheet.revision, ranges: new Uint8Array(n),
      lo: array(), hi: array(), added: array(), multipliers: array(),
      conversions: new Float64Array(n * n), extras: array(), penetrations: array(),
      armorPen: get('armorPen'), armorFloor: get('armorDamageFloor'),
      thorns: 0, dominion: get('maxManaDamage') * sheet.get('mana'),
      lucky: get('luckyChance'), unlucky: get('unluckyChance'),
      critChance: get('critChance'), critMulti: get('critMulti'),
      manaCost: 0, lifeCost: 0, cooldown: 0,
    };
    for (let i = 0; i < n; i++) {
      const type = types[i], ctx = skill.typeTags[type];
      const effectiveness = def.addedEffectiveness ?? 1;
      const range = def.baseDamage[type];
      const minAdd = get(`addedMin_${type}`, ctx) * effectiveness;
      const maxAdd = get(`addedMax_${type}`, ctx) * effectiveness;
      if (range || minAdd > 0 || maxAdd > 0) {
        plan.ranges[i] = 1;
        let lo = (range?.[0] ?? 0) + minAdd, hi = Math.max(lo, (range?.[1] ?? 0) + maxAdd);
        const spread = get('damageSpread', ctx);
        if (spread !== 0 && hi > lo) {
          const mid = (lo + hi) / 2, half = (hi - lo) / 2 * Math.max(0, 1 + spread);
          lo = Math.max(0, mid - half); hi = mid + half;
        }
        plan.lo[i] = lo; plan.hi[i] = hi;
      }
      plan.added[i] = get(`added${type[0].toUpperCase()}${type.slice(1)}`, ctx) * effectiveness;
      plan.multipliers[i] = get('damage', ctx);
      plan.extras[i] = get(`extraAs_${type}`);
      plan.penetrations[i] = get(`${type}Pen`);
      for (let to = 0; to < n; to++) if (to !== i) plan.conversions[i * n + to] = get(`convert_${type}_${types[to]}`);
    }
    const spikes = get('thornsToHit');
    if (spikes > 0 && sheet.get('thorns') > 0) plan.thorns = sheet.get('thorns') * spikes * get('damage', skill.typeTags.physical);
    const baseMana = def.manaCost + get('addedManaCost'), baseLife = (def.lifeCost ?? 0) + get('addedLifeCost');
    if (baseMana > 0 || baseLife > 0) {
      const mult = get('manaCost'), toLife = get('costToLife'), toMana = get('costToMana');
      const mana = (baseMana * mult * (1 - toLife) + baseLife * mult * toMana) * get('manaUseCost');
      const life = baseLife * mult * (1 - toMana) + baseMana * mult * toLife;
      plan.manaCost = mana > 0 ? Math.ceil(mana) : 0;
      plan.lifeCost = life > 0 ? Math.ceil(life) : 0;
    }
    const cooldown = def.cooldown + get('addedCooldown');
    plan.cooldown = cooldown <= 0 ? 0 : cooldown / Math.max(0.1, get('cooldownRecovery') / sheet.get('cooldownRecovery'));
    bySkill.set(skill, plan);
    this.builds++;
    return plan;
  }
}
