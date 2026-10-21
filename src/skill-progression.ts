import {copy, finite, freeze, integer} from './validation.js';
import type {SkillTreeEffect, SkillTreeGrantNode} from './skill-tree-grants.js';
import type {AbilityEssence, SkillMergeTuning} from './skill-actions.js';
import {compileSkillTree, sealedSkillNodes, skillTreePrerequisite, skillTreeSealName, skillTreeSpentCount,
  type CompiledSkillTree, type SkillTreeLayout, type SkillTreeNode, type SkillTreeSpec} from './skill-tree.js';

export interface AbilityTuning {
  bands: readonly number[]; supportMaxLevel: number;
  cost: {base: number; perStep: number; supportMul: number};
  empowerment: {reward: {kind: 'passivePoints'; pointsPerRank: number}};
}
export interface EmpoweredSkill {rarity?: string; empowermentRank?: number}
export interface SkillInvestment extends EmpoweredSkill {level: number; treeNodes?: readonly string[]}
export interface AbilityCost {tier: number; count: number}
export interface SkillPointBudget {ability: number; passive: number; abilityFree: number; passiveFree: number; total: number; free: number}
/** Lightweight reads over already validated, host-owned band/reward tuning. */
export function skillTierForLevel(level: number, bands: readonly number[]): number {
  integer(level, 0, 'Skill level');
  for (let index = 0; index < bands.length; index++) if (level <= bands[index]) return index + 1;
  return bands.length;
}
export function skillPointsAtLevel(level: number, bands: readonly number[]): number {
  integer(level, 0, 'Skill level'); let count = 0;
  for (const band of bands) if (level >= band) count++;
  return count;
}
export function skillEmpowermentPoints(state: EmpoweredSkill, pointsPerRank: number): number {
  const points = empowermentRank(state) * pointsPerRank;
  return Number.isSafeInteger(points) && points > 0 ? points : 0;
}
export function empowermentRank(copy: EmpoweredSkill): number {
  const rank = copy.empowermentRank;
  return copy.rarity === 'legendary' && Number.isSafeInteger(rank) && rank! > 0 ? rank! : 0;
}
export function empowermentNumeral(rank: number): string {
  if (!Number.isSafeInteger(rank) || rank <= 0) return '';
  if (rank >= 4000) return `(${empowermentNumeral(Math.floor(rank / 1000))})${empowermentNumeral(rank % 1000)}`;
  let out = '';
  for (const [value, glyph] of [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']] as const) {
    while (rank >= value) { out += glyph; rank -= value; }
  }
  return out;
}

/** Immutable numeric economy, reusable across skill instances and tree graphs. */
export class AbilityRules {
  readonly tuning: AbilityTuning;
  constructor(input: AbilityTuning) {
    const tuning = copy(input);
    if (!Array.isArray(tuning.bands) || !tuning.bands.length || tuning.bands.length > 256) throw new Error('Invalid skill level bands');
    let previous = 0;
    for (const band of tuning.bands) { integer(band, 1, 'Skill band'); if (band <= previous) throw new Error('Skill bands must increase'); previous = band; }
    integer(tuning.supportMaxLevel, 1, 'Support level cap');
    for (const value of [tuning.cost.base, tuning.cost.perStep, tuning.cost.supportMul]) if (finite(value, 'Ability cost tuning') < 0) throw new Error('Negative ability cost tuning');
    if (tuning.empowerment.reward.kind !== 'passivePoints') throw new Error('Unsupported empowerment reward');
    if (finite(tuning.empowerment.reward.pointsPerRank, 'Empowerment reward') < 0) throw new Error('Negative empowerment reward');
    this.tuning = freeze(tuning); Object.freeze(this);
  }
  get skillMaxLevel(): number { return this.tuning.bands[this.tuning.bands.length - 1]; }
  tierForLevel(level: number): number {
    return skillTierForLevel(level, this.tuning.bands);
  }
  pointsAtLevel(level: number): number {
    return skillPointsAtLevel(level, this.tuning.bands);
  }
  skillLevelCost(targetLevel: number): AbilityCost {
    const tier = this.tierForLevel(targetLevel), start = tier <= 1 ? 1 : this.tuning.bands[tier - 2];
    const step = Math.max(1, targetLevel - start), c = this.tuning.cost;
    return {tier, count: finite(c.base + c.perStep * step, 'Ability cost')};
  }
  supportLevelCost(targetLevel: number): AbilityCost {
    const c = this.skillLevelCost(targetLevel);
    return {tier: c.tier, count: finite(Math.ceil(c.count * this.tuning.cost.supportMul), 'Support ability cost')};
  }
  empowermentPoints(state: EmpoweredSkill): number {
    return skillEmpowermentPoints(state, this.tuning.empowerment.reward.pointsPerRank);
  }
}

export interface SkillTreeDefinition<N extends SkillTreeNode = SkillTreeNode> {id: string; tree?: SkillTreeSpec<N>}
/** Explicit borrowed-content mode for a host's stable compiled graph. No mutable
 * global cache or per-character state is retained. Recompile topology edits. */
export class SkillTreeRules<N extends SkillTreeNode = SkillTreeNode> {
  readonly #definition: SkillTreeDefinition<N>;
  readonly #graph: CompiledSkillTree<N> | undefined;
  readonly ability: AbilityRules;
  constructor(definition: SkillTreeDefinition<N>, ability: AbilityRules, graph?: CompiledSkillTree<N>, layout?: SkillTreeLayout) {
    if (typeof definition.id !== 'string' || !definition.id) throw new Error('Invalid skill identity');
    this.#definition = definition; this.ability = ability;
    this.#graph = graph ?? (definition.tree ? compileSkillTree(definition.tree, layout) : undefined);
    Object.freeze(this);
  }
  node(id: string): N | undefined { return this.#graph?.nodes.get(id)?.node; }
  passive(id: string): boolean {
    const node = this.node(id);
    return !!node && (node.empowermentPassive ?? this.#definition.tree?.neutral?.id === id);
  }
  hasPassive(): boolean { return this.#graph?.order.some(id => this.passive(id)) ?? false; }
  abilityNodes(state: SkillInvestment): string[] {
    let bonus = this.ability.empowermentPoints(state);
    return (state.treeNodes ?? []).filter(id => {if (bonus > 0 && this.passive(id)) { bonus--; return false; } return true;});
  }
  budget(state: SkillInvestment): SkillPointBudget {
    const ability = this.ability.pointsAtLevel(state.level), passive = this.ability.empowermentPoints(state);
    // Count without allocating a filtered copy on every preview/refusal.
    let bonus = passive, abilitySpent = 0, passiveSpent = 0;
    for (const id of state.treeNodes ?? []) {
      if (bonus > 0 && this.passive(id)) { bonus--; passiveSpent++; } else abilitySpent++;
    }
    const abilityFree = Math.max(0, ability - abilitySpent), passiveFree = Math.max(0, passive - passiveSpent);
    return {ability, passive, abilityFree, passiveFree, total: ability + passive, free: abilityFree + passiveFree};
  }
  nodeRanks(state: EmpoweredSkill, id: string): number {
    return (this.#graph?.nodes.get(id)?.ranks ?? 1) + (this.passive(id) ? this.ability.empowermentPoints(state) : 0);
  }
  open(state: Pick<SkillInvestment, 'level'>): boolean { return !!this.#definition.tree && state.level >= this.#definition.tree.level; }
  spentBranch(state: SkillInvestment): string | undefined {
    for (const id of state.treeNodes ?? []) { const limb = this.#graph?.nodes.get(id)?.limbId; if (limb !== undefined) return limb; }
    return undefined;
  }
  refusal(state: SkillInvestment, nodeId: string): string | null {
    const tree = this.#definition.tree, graph = this.#graph;
    if (!tree || !graph || !graph.nodes.has(nodeId)) return 'no such path';
    integer(state.level, 0, 'Skill level');
    if (state.level < tree.level) return `the path opens at level ${tree.level}`;
    const spent = state.treeNodes ?? [], sealed = sealedSkillNodes(graph, spent);
    if (sealed.has(nodeId)) return `${skillTreeSealName(graph, spent, nodeId, sealed)}'s path is sealed`;
    const missing = skillTreePrerequisite(graph, spent, nodeId);
    if (missing) return `${missing} comes first`;
    const budget = this.budget(state);
    if (budget.abilityFree === 0 && !(this.passive(nodeId) && budget.passiveFree > 0)) {
      if (budget.passiveFree > 0) return 'empowerment points can only deepen passive slots';
      const next = this.ability.tuning.bands.find(b => b > state.level);
      return next !== undefined ? `no Ability point free — the next comes at level ${next}` : 'every Ability point is spent';
    }
    return null;
  }
  /** Restoration intentionally does not apply the new-purchase opening level.
   * Omitting level validates structure/ranks without enforcing ordinary points. */
  restore(ids: readonly string[], level?: number, investment: EmpoweredSkill = {}, onDrop?: (id: string, reason: string) => void): string[] | undefined {
    if (level !== undefined) integer(level, 0, 'Restored skill level');
    const kept: string[] = [], state: SkillInvestment = {...investment, level: level ?? this.ability.skillMaxLevel, treeNodes: kept};
    for (const id of ids) {
      const node = this.#graph?.nodes.get(id);
      if (!node) { onDrop?.(id, 'no such node'); continue; }
      const have = skillTreeSpentCount(kept, id), ranks = this.nodeRanks(state, id);
      if (have >= ranks) { onDrop?.(id, ranks === 1 ? 'duplicate' : `beyond its ${ranks} ranks`); continue; }
      if (have === 0) {
        const sealed = sealedSkillNodes(this.#graph, kept);
        if (sealed.has(id)) { onDrop?.(id, `rival path — sealed by the lock (${skillTreeSealName(this.#graph, kept, id, sealed)})`); continue; }
        if (skillTreePrerequisite(this.#graph, kept, id) !== null) { onDrop?.(id, 'rung chain broken — a predecessor is missing'); continue; }
      }
      if (level !== undefined) {
        const budget = this.budget(state);
        if (budget.abilityFree === 0 && !(this.passive(id) && budget.passiveFree > 0)) { onDrop?.(id, `over budget at level ${level}`); continue; }
      }
      kept.push(id);
    }
    return kept.length ? kept : undefined;
  }
}

export interface SkillProgressionDefinition<N extends SkillTreeNode = SkillTreeGrantNode> extends SkillTreeDefinition<N> {
  name: string; maxLevel: number; color?: string; delivery?: {type: string}; effects?: SkillTreeEffect[]; channel?: object; castCycle?: object;
}
export interface SkillServiceContent {
  essences: AbilityEssence[];
  font: {merge: Partial<Record<string, number>>; convertUp: number; convertDown: number; reset: {count: number}};
  empowerment: SkillMergeTuning['empowerment'];
  rarities: {id: string; label: string; color: string; sockets: number}[];
}
export interface SkillProgressionPack<N extends SkillTreeNode = SkillTreeGrantNode> {
  schemaVersion: 1; capability: 'skill-progression/v1'; contentId: string;
  tuning: AbilityTuning; layout: SkillTreeLayout;
  skills: SkillProgressionDefinition<N>[]; supports: {id: string; name: string; maxLevel: number}[];
  services?: SkillServiceContent;
}
/** Owned immutable content mode. Graphs/rules are compiled once per content
 * instance, then shared by characters without shared mutable investment. */
export class SkillProgression<N extends SkillTreeNode = SkillTreeGrantNode> {
  readonly pack: SkillProgressionPack<N>;
  readonly ability: AbilityRules;
  readonly #skills = new Map<string, SkillProgressionDefinition<N>>();
  readonly #supports = new Map<string, {id: string; name: string; maxLevel: number}>();
  readonly #trees = new Map<string, SkillTreeRules<N>>();
  constructor(input: SkillProgressionPack<N>) {
    const pack = copy(input);
    if (pack.schemaVersion !== 1 || pack.capability !== 'skill-progression/v1' || typeof pack.contentId !== 'string' || !pack.contentId) throw new Error('Invalid skill progression pack');
    this.ability = new AbilityRules(pack.tuning);
    if (pack.services) {
      const s = pack.services, essenceIds = new Set<string>(), rarityIds = new Set<string>();
      if (!Array.isArray(s.essences) || s.essences.length !== pack.tuning.bands.length || !Array.isArray(s.rarities) || !s.rarities.length || s.rarities.length > 256) throw new Error('Invalid skill service registries');
      for (const [index, row] of s.essences.entries()) {
        if (typeof row.id !== 'string' || !row.id || essenceIds.has(row.id) || row.tier !== index + 1 || [row.label,row.color,row.glyph].some(v => typeof v !== 'string')) throw new Error('Invalid ability essence');
        essenceIds.add(row.id);
      }
      for (const row of s.rarities) {
        if (typeof row.id !== 'string' || !row.id || rarityIds.has(row.id) || typeof row.label !== 'string' || typeof row.color !== 'string') throw new Error('Invalid skill rarity');
        integer(row.sockets, 0, 'Rarity sockets'); rarityIds.add(row.id);
      }
      for (const [id, count] of Object.entries(s.font.merge)) {if (!rarityIds.has(id)) throw new Error('Unknown merge rarity'); integer(count!, 2, 'Merge copies');}
      integer(s.font.convertUp, 1, 'Upward conversion'); integer(s.font.convertDown, 1, 'Downward conversion'); integer(s.font.reset.count, 0, 'Reset count');
      const e = s.empowerment;
      if (typeof e.enabled !== 'boolean' || typeof e.preserveDonorRanks !== 'boolean') throw new Error('Invalid empowerment flags');
      integer(e.copiesPerMerge, 2, 'Empowerment copies'); integer(e.ranksPerMerge, 1, 'Empowerment rank gain'); if (e.maxRank !== null) integer(e.maxRank, 0, 'Empowerment rank cap');
    }
    if (!Array.isArray(pack.skills) || !Array.isArray(pack.supports) || pack.skills.length > 4096 || pack.supports.length > 4096) throw new Error('Invalid skill progression registries');
    for (const [rows, map] of [[pack.skills, this.#skills], [pack.supports, this.#supports]] as const) for (const row of rows) {
      if (!row || typeof row.id !== 'string' || !row.id || typeof row.name !== 'string' || map.has(row.id)) throw new Error('Invalid or duplicate skill/support identity');
      integer(row.maxLevel, 1, 'Ability level cap'); map.set(row.id, row);
    }
    this.pack = freeze(pack);
    for (const skill of pack.skills) this.#trees.set(skill.id, new SkillTreeRules(skill, this.ability, undefined, pack.layout));
    Object.freeze(this);
  }
  skill(id: string): SkillProgressionDefinition<N> { const row = this.#skills.get(id); if (!row) throw new Error(`Unknown skill: ${id}`); return row; }
  support(id: string): {id: string; name: string; maxLevel: number} { const row = this.#supports.get(id); if (!row) throw new Error(`Unknown support: ${id}`); return row; }
  tree(id: string): SkillTreeRules<N> { const row = this.#trees.get(id); if (!row) throw new Error(`Unknown skill: ${id}`); return row; }
}
