import type { ContentPack, Modifier, SkillDefinition, SkillSelection, ItemDefinition } from './types.js';
import { StatRules, validateModifier } from './stat-rules.js';
import { copy, finite, freeze, integer, known, readonlySet } from './validation.js';

/** The first runtime has a deliberately bounded damage capability. New mechanics require explicit contracts. */
const arithmeticStats = new Set([
  'life', 'mana', 'accuracy', 'evasion', 'armor', 'damage', 'damageTaken',
  'castSpeed', 'attackSpeed', 'critChance', 'critMulti', 'critAvoid',
  'luckyChance', 'unluckyChance', 'damageSpread', 'armorPen', 'armorDamageFloor',
  'manaCost', 'manaUseCost', 'addedManaCost', 'addedLifeCost', 'costToLife', 'costToMana',
  'addedCooldown', 'cooldownRecovery', 'thorns', 'thornsToHit', 'maxManaDamage',
]);
function fields(value: object, allowed: string[], context: string): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${context} field is not supported: ${key}`);
}
export function supportsResolvedHitStat(stat: string, pack: ContentPack): boolean {
  if (arithmeticStats.has(stat) || Object.hasOwn(pack.attributes, stat)) return true;
  for (const type of pack.damageTypes) {
    const capital = type[0].toUpperCase() + type.slice(1);
    if ([`added${capital}`, `addedMin_${type}`, `addedMax_${type}`, `extraAs_${type}`, `${type}Res`, `${type}ResMax`, `${type}Pen`].includes(stat)) return true;
    for (const to of pack.damageTypes) if (stat === `convert_${type}_${to}`) return true;
  }
  return pack.trades.some(t => [t.from, t.to, t.rateStat, t.forgoStat].includes(stat));
}

export function validateContentItem(def: ItemDefinition, pack: ContentPack): void {
  fields(def, ['id','name','category','slots','mods'], 'Item');
  for (const value of [def.id, def.name, def.category]) if (typeof value !== 'string' || !value.length) throw new Error('Invalid compiled item identity');
  if (['__proto__','constructor','prototype'].includes(def.id)) throw new Error('Reserved item identity');
  if (!Array.isArray(def.slots) || !def.slots.length || def.slots.some(s => typeof s !== 'string' || !s.length || ['__proto__','constructor','prototype'].includes(s))) throw new Error('Invalid item slots');
  if (!Array.isArray(def.mods)) throw new Error('Invalid item modifiers');
  for (const m of def.mods) {
    validateModifier(m);
    if (m.tags !== undefined && (!Array.isArray(m.tags) || m.tags.some(t => typeof t !== 'string'))) throw new Error('Invalid item modifier tags');
    if (!supportsResolvedHitStat(m.stat, pack)) throw new Error(`Mechanic not in resolved-spell-hit/v1: ${m.stat}`);
    if (!Object.hasOwn(pack.attributes, m.stat)) known(pack.stats, m.stat, 'modifier stat');
    if (m.fromStat) known(pack.stats, m.fromStat, 'link source');
  }
}

export class Content {
  readonly pack: ContentPack;
  readonly rules: StatRules;
  constructor(input: ContentPack) {
    const pack = copy(input);
    if (pack.schemaVersion !== 1 || pack.capability !== 'resolved-spell-hit/v1') throw new Error('Unsupported content schema or capability');
    for (const registry of [pack.attributes, pack.classes, pack.items, pack.passives, pack.skills, pack.supports]) {
      for (const [id, definition] of Object.entries(registry)) {
        if (!id || ['__proto__', 'constructor', 'prototype'].includes(id)) throw new Error(`Reserved content id: ${id}`);
        if ('id' in definition && definition.id !== id) throw new Error(`Content id disagrees with registry key: ${id}`);
      }
    }
    if (pack.damageTypes.some(type => typeof type !== 'string' || !/^[a-z][a-z0-9_]*$/.test(type))) throw new Error('Invalid damage type');
    if (!pack.damageTypes.length || new Set(pack.damageTypes).size !== pack.damageTypes.length) throw new Error('Damage types must be nonempty and unique');
    finite(pack.defense.armorK, 'armorK');
    if (pack.defense.armorK <= 0) throw new Error('armorK must be positive');
    finite(pack.defense.resistanceHardCap, 'resistanceHardCap');
    finite(pack.defense.resistanceFloor, 'resistanceFloor');
    if (pack.defense.resistanceHardCap >= 1 || pack.defense.resistanceFloor > pack.defense.resistanceHardCap) throw new Error('Invalid resistance bounds');
    this.rules = new StatRules(pack.stats, pack.trades);
    const checkMods = (mods: Modifier[] | undefined, arithmetic = true): void => {
      for (const mod of mods ?? []) {
        validateModifier(mod);
        if (arithmetic && !supportsResolvedHitStat(mod.stat, pack)) throw new Error(`Mechanic not in resolved-spell-hit/v1: ${mod.stat}`);
        if (!Object.hasOwn(pack.attributes, mod.stat)) known(pack.stats, mod.stat, 'modifier stat');
        if (mod.fromStat) known(pack.stats, mod.fromStat, 'link source');
      }
    };
    for (const attr of Object.values(pack.attributes)) checkMods(attr.perPoint, false);
    for (const def of Object.values(pack.classes)) {
      fields(def, ['id', 'name', 'attributes', 'startNode', 'mods', 'levelMods'], 'Class');
      known(pack.passives, def.startNode, 'class start');
      for (const [id, value] of Object.entries(def.attributes)) { known(pack.attributes, id, 'attribute'); finite(value, id); }
      checkMods(def.mods); checkMods(def.levelMods);
    }
    for (const def of Object.values(pack.passives)) {
      fields(def, ['id', 'name', 'description', 'kind', 'x', 'y', 'attributes', 'attributesPct', 'mods', 'links'], 'Passive');
      checkMods(def.mods);
      for (const forbidden of ['choice', 'conduit', 'graft', 'grant', 'vocation']) {
        if (forbidden in def) throw new Error(`Passive mechanic is not extracted: ${forbidden}`);
      }
    }
    for (const def of Object.values(pack.items)) {
      validateContentItem(def, pack);
    }
    for (const def of Object.values(pack.supports)) {
      checkMods(def.mods); checkMods(def.perLevel);
      for (const key of Object.keys(def)) {
        if (!['id', 'name', 'requiresTags', 'excludeTags', 'mods', 'perLevel'].includes(key)) throw new Error(`Support mechanic is not extracted: ${key}`);
      }
    }
    for (const def of Object.values(pack.skills)) {
      fields(def, ['id', 'name', 'tags', 'castTag', 'manaCost', 'lifeCost', 'cooldown', 'useTime',
        'addedEffectiveness', 'baseDamage', 'requirements', 'innateMods', 'perLevel', 'treeLevel', 'nodes'], 'Skill');
      if (!['cast:instant', 'cast:timed'].includes(def.castTag)) throw new Error('Unsupported cast scope');
      if (!def.tags.includes('spell') || def.tags.includes('attack')) throw new Error('This milestone supports spell contact only');
      checkMods(def.innateMods); checkMods(def.perLevel);
      for (const [type, range] of Object.entries(def.baseDamage)) {
        if (!pack.damageTypes.includes(type)) throw new Error(`Unknown damage type: ${type}`);
        finite(range[0], 'range minimum'); finite(range[1], 'range maximum');
        if (range[0] < 0 || range[1] < range[0]) throw new Error('Invalid damage range');
      }
      for (const value of [def.manaCost, def.lifeCost ?? 0, def.cooldown, def.useTime]) if (finite(value, 'skill value') < 0) throw new Error('Negative skill value');
      if (def.addedEffectiveness !== undefined && finite(def.addedEffectiveness, 'addedEffectiveness') < 0) throw new Error('Negative effectiveness');
      for (const [id, value] of Object.entries(def.requirements ?? {})) {
        known(pack.attributes, id, 'requirement attribute');
        if (finite(value, id) < 0) throw new Error('Negative requirement');
      }
      for (const node of Object.values(def.nodes)) {
        fields(node, ['id', 'name', 'description', 'x', 'y', 'mods', 'links', 'excludes', 'ranks', 'empowermentPassive'], 'Skill node');
        checkMods(node.mods);
        for (const forbidden of ['over', 'graft', 'buffs', 'instanceEffects', 'aura']) if (forbidden in node) throw new Error(`Skill-tree mechanic is not extracted: ${forbidden}`);
      }
    }
    this.pack = freeze(pack);
    Object.freeze(this);
  }
  skill(selection: SkillSelection): ConfiguredSkill { return new ConfiguredSkill(this, selection); }
}

/** Compiled only on loadout changes. Per-hit code reuses these modifiers and contexts. */
export class ConfiguredSkill {
  readonly definition: SkillDefinition;
  readonly selection: SkillSelection;
  readonly mods: Modifier[];
  readonly tags: ReadonlySet<string>;
  readonly typeTags: Readonly<Record<string, ReadonlySet<string>>>;
  constructor(readonly content: Content, input: SkillSelection) {
    const selection = copy(input);
    fields(selection, ['id', 'level', 'sockets', 'treePoints', 'supports', 'nodes'], 'Skill selection');
    this.definition = known(content.pack.skills, selection.id, 'skill');
    integer(selection.level, 1, 'skill level');
    integer(selection.sockets, 0, 'socket count');
    integer(selection.treePoints, 0, 'tree points');
    const supports = selection.supports ?? [];
    if (supports.length > selection.sockets) throw new Error('Not enough sockets');
    const nodes = selection.nodes ?? [];
    if (nodes.length > selection.treePoints || new Set(nodes).size !== nodes.length) throw new Error('Invalid skill-tree point spend');
    if (nodes.length && selection.level < this.definition.treeLevel) throw new Error('Skill tree is locked at this level');
    const selected = new Set(nodes);
    const mods: Modifier[] = [...this.definition.innateMods ?? []];
    for (const id of nodes) {
      const node = known(this.definition.nodes, id, 'skill node');
      if (node.links?.length && !node.links.some(link => selected.has(link))) throw new Error(`Missing skill-tree prerequisite: ${id}`);
      if (node.excludes?.some(other => selected.has(other))) throw new Error(`Conflicting skill-tree node: ${id}`);
      mods.push(...node.mods ?? []);
    }
    const reached = new Set(nodes.filter(id => !this.definition.nodes[id].links?.length));
    for (let changed = true; changed;) {
      changed = false;
      for (const id of nodes) if (!reached.has(id) && this.definition.nodes[id].links?.some(link => reached.has(link))) {
        reached.add(id); changed = true;
      }
    }
    if (reached.size !== nodes.length) throw new Error('Skill-tree prerequisite cycle has no reachable root');
    if (selection.level > 1) for (const mod of this.definition.perLevel) mods.push({ ...mod, value: mod.value * (selection.level - 1) });
    for (const socket of supports) {
      integer(socket.level, 1, 'support level');
      const def = known(content.pack.supports, socket.id, 'support');
      if (def.excludeTags?.some(tag => this.definition.tags.includes(tag))
        || (def.requiresTags?.length && !def.requiresTags.some(tag => this.definition.tags.includes(tag)))) {
        throw new Error(`Support ${socket.id} does not fit ${selection.id}`);
      }
      mods.push(...def.mods);
      if (socket.level > 1) for (const mod of def.perLevel ?? []) mods.push({ ...mod, value: mod.value * (socket.level - 1) });
    }
    this.selection = freeze(selection);
    this.mods = freeze(copy(mods));
    this.tags = readonlySet([...this.definition.tags, this.definition.castTag]);
    this.typeTags = Object.fromEntries(content.pack.damageTypes.map(type => [type, readonlySet([...this.tags, type])]));
    Object.freeze(this.typeTags);
    Object.freeze(this);
  }
}
