import { copy, finite, freeze, integer } from './validation.js';
import { buildMemoryCatalog } from './memory-rewards.js';
import type {
  MemoryCandidate, MemoryRewardConfig, MemoryRewardContext, MemoryRewardDefinition, MemorySkillRow, MemorySupportRow,
} from './memory-rewards.js';

export interface MemoryContentDefinition extends MemoryRewardDefinition {
  readonly label: string;
  readonly description: string;
  readonly cost: number;
}

export interface MemoryRewardPack {
  readonly schemaVersion: 1;
  readonly capability: 'memory-rewards/v1';
  readonly contentId: string;
  readonly keys: {
    readonly unlockAllFeature: string;
    readonly milestonePrefix: string;
    readonly awakeningStage: number;
    readonly gemDropPrefix: string;
  };
  readonly config: MemoryRewardConfig;
  readonly definitions: readonly MemoryContentDefinition[];
  readonly skills: readonly MemorySkillRow[];
  readonly supports: readonly MemorySupportRow[];
}

function identifier(value: unknown, description: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(description + ' must be a nonempty string');
}

function boolean(value: unknown, description: string): asserts value is boolean {
  if (typeof value !== 'boolean') throw new Error(description + ' must be boolean');
}

function validateConfig(config: MemoryRewardConfig): void {
  if (!config || typeof config !== 'object') throw new Error('Missing memory reward configuration');
  boolean(config.debugCodexBypassesSecondary, 'Debug awakening bypass');
  if (config.weighting !== 'uniform' && config.weighting !== 'drop') throw new Error('Invalid memory weighting');
  if (!Array.isArray(config.excluded) || config.excluded.some(key => typeof key !== 'string')) {
    throw new Error('Memory exclusions must be string keys');
  }
  if (!config.weightOverrides || typeof config.weightOverrides !== 'object' || Array.isArray(config.weightOverrides)) {
    throw new Error('Memory weight overrides must be a record');
  }
  for (const weight of Object.values(config.weightOverrides)) finite(weight, 'Memory weight override');
  const secondary = config.secondary;
  if (!secondary || typeof secondary !== 'object') throw new Error('Missing secondary memory configuration');
  boolean(secondary.legendaryFinds, 'Legendary awakening');
  boolean(secondary.vault, 'Vault awakening');
  if (!Array.isArray(secondary.kinds) || secondary.kinds.some(kind => kind !== 'skill' && kind !== 'support')) {
    throw new Error('Invalid secondary memory kinds');
  }
  if (!secondary.mechanics || typeof secondary.mechanics !== 'object' || Array.isArray(secondary.mechanics)) {
    throw new Error('Secondary mechanics must be a record');
  }
  for (const mechanic of ['tree', 'commission', 'prestige'] as const) boolean(secondary.mechanics[mechanic], mechanic + ' gate');
  if (Object.keys(secondary.mechanics).some(key => key !== 'tree' && key !== 'commission' && key !== 'prestige')) {
    throw new Error('Unknown secondary memory mechanic');
  }
}

/** Owns immutable authored columns, an ordered drop catalogue and lookup indexes.
 * Accounts and random sources remain independent inputs to the reward functions. */
export class MemoryRewardContent implements MemoryRewardContext {
  readonly pack: MemoryRewardPack;
  readonly config: MemoryRewardConfig;
  readonly unlockAllFeature: string;
  readonly #catalogue: readonly MemoryCandidate[];
  readonly #awakenableSkills = new Set<string>();
  readonly #definitions = new Map<string, MemoryContentDefinition>();

  constructor(input: MemoryRewardPack) {
    if (input?.schemaVersion !== 1 || input?.capability !== 'memory-rewards/v1') {
      throw new Error('Unsupported memory reward content');
    }
    identifier(input.contentId, 'Content ID');
    const pack = copy(input);
    if (!pack.keys || typeof pack.keys !== 'object') throw new Error('Missing memory reward keys');
    for (const key of ['unlockAllFeature', 'milestonePrefix', 'gemDropPrefix'] as const) identifier(pack.keys[key], 'Memory key ' + key);
    integer(pack.keys.awakeningStage, 0, 'Awakening stage');
    validateConfig(pack.config);
    if (!Array.isArray(pack.skills) || !Array.isArray(pack.supports) || !Array.isArray(pack.definitions)) {
      throw new Error('Memory definitions and catalogue columns must be arrays');
    }
    const skillIds = new Set<string>();
    for (const row of pack.skills) {
      identifier(row?.id, 'Skill ID');
      if (typeof row.name !== 'string' || skillIds.has(row.id)) throw new Error('Invalid or duplicate memory skill ' + row.id);
      skillIds.add(row.id);
      if (row.noDrop !== undefined) boolean(row.noDrop, 'Skill no-drop flag');
      if (row.dropWeight !== undefined) finite(row.dropWeight, 'Skill drop weight');
      if (!row.noDrop) this.#awakenableSkills.add(row.id);
    }
    const supportIds = new Set<string>();
    for (const row of pack.supports) {
      identifier(row?.id, 'Support ID');
      if (typeof row.name !== 'string' || supportIds.has(row.id)) throw new Error('Invalid or duplicate memory support ' + row.id);
      supportIds.add(row.id);
      finite(row.weight, 'Support drop weight');
    }
    const catalogue = buildMemoryCatalog(pack.skills, pack.supports);
    for (const definition of pack.definitions) {
      identifier(definition?.id, 'Memory reward ID');
      if (this.#definitions.has(definition.id)) throw new Error('Duplicate memory reward ' + definition.id);
      if (definition.tier !== 'discovery' && definition.tier !== 'secondary') throw new Error('Invalid memory reward tier');
      if (typeof definition.label !== 'string' || typeof definition.description !== 'string') throw new Error('Invalid memory reward text');
      integer(definition.cost, 0, 'Memory reward cost');
      if (!definition.weights || typeof definition.weights !== 'object' || Array.isArray(definition.weights)) {
        throw new Error('Memory category weights must be a record');
      }
      for (const kind of ['skill', 'support'] as const) finite(definition.weights[kind], kind + ' reward weight');
      let total = 0;
      for (const row of catalogue) {
        const key = row.kind + ':' + row.id;
        if (pack.config.excluded.includes(key)) continue;
        const weight = definition.weights[row.kind]
          * (pack.config.weighting === 'drop' ? row.weight : 1)
          * (pack.config.weightOverrides[key] ?? 1);
        if (!Number.isFinite(weight)) throw new Error('Memory reward weight overflow');
        if (weight > 0) total += weight;
      }
      if (!Number.isFinite(total)) throw new Error('Memory reward total overflow');
      this.#definitions.set(definition.id, definition);
    }
    this.pack = freeze(pack);
    this.config = this.pack.config;
    this.unlockAllFeature = this.pack.keys.unlockAllFeature;
    this.#catalogue = freeze(catalogue);
    Object.freeze(this);
  }

  catalogue(): readonly MemoryCandidate[] { return this.#catalogue; }

  definition(id: string): MemoryContentDefinition | undefined { return this.#definitions.get(id); }

  progressionOpen(ledger: Readonly<Record<string, number>>): boolean {
    const { awakeningStage, milestonePrefix } = this.pack.keys;
    return awakeningStage <= 0 || (ledger[milestonePrefix + awakeningStage] ?? 0) >= 1;
  }

  gemDropKey(id: string): string { return this.pack.keys.gemDropPrefix + id; }

  canAwakenSkill(id: string): boolean { return this.#awakenableSkills.has(id); }
}
