import { copy, freeze, integer } from './validation.js';
import type { GateContext, GateRow } from './progression-gates.js';

export interface GateRequirement {
  readonly id: string;
  readonly mode: 'any' | 'all';
  readonly rows: readonly GateRow[];
}

export interface ProgressionGatePack {
  readonly schemaVersion: 1;
  readonly capability: 'progression-gates/v1';
  readonly contentId: string;
  readonly keys: {
    readonly levelPrefix: string;
    readonly classPrefix: string;
    readonly classLevelSeparator: string;
    readonly vocationPrefix: string;
    readonly questDonePrefix: string;
    readonly questsCompletedKey: string;
  };
  readonly classes: readonly { readonly id: string; readonly name: string }[];
  readonly requirements: readonly GateRequirement[];
}

const rowFields = new Set([
  'ledger', 'ledgerPrefix', 'unlock', 'feature', 'level', 'classLevel',
  'vocation', 'quest', 'n', 'label',
]);
const countedFields = ['ledger', 'ledgerPrefix', 'unlock', 'feature'] as const;

function identifier(value: unknown, description: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(description + ' must be a nonempty string');
  }
}

function validateRow(row: GateRow): void {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error('A gate row must be an object');
  }
  let kinds = 0;
  for (const key of Object.keys(row)) {
    if (!rowFields.has(key)) throw new Error('Unknown gate row field ' + key);
    if (key !== 'n' && key !== 'label' && row[key as keyof GateRow] !== undefined) kinds++;
  }
  if (kinds > 1) throw new Error('An authored gate row must have at most one requirement');
  for (const field of countedFields) {
    if (row[field] !== undefined && typeof row[field] !== 'string') {
      throw new Error('Gate ' + field + ' must be a string');
    }
  }
  if (row.unlock !== undefined) identifier(row.unlock, 'Unlock ID');
  if (row.feature !== undefined) identifier(row.feature, 'Feature ID');
  if (row.n !== undefined && typeof row.n !== 'number') throw new Error('Gate count must be numeric');
  if (row.label !== undefined && typeof row.label !== 'string') throw new Error('Gate label must be a string');
  if (row.level !== undefined) integer(row.level, 1, 'Gate level');
  if (row.classLevel !== undefined) {
    const target = row.classLevel;
    if (!target || typeof target !== 'object' || Array.isArray(target)) {
      throw new Error('Class level must be an object');
    }
    if (Object.keys(target).some(key => key !== 'classId' && key !== 'level')) {
      throw new Error('Unknown class-level field');
    }
    identifier(target.classId, 'Class ID');
    integer(target.level, 1, 'Class gate level');
  }
  for (const field of ['vocation', 'quest'] as const) {
    if (row[field] !== undefined && row[field] !== true) identifier(row[field], field + ' ID');
  }
}

/** Validates and owns a detached, immutable content pack. Lookup maps are built
 * once. Account counters and ownership remain live inputs to the gate queries.
 * Requirement groups describe the authored rows, independent of purchase rules. */
export class ProgressionGateContent {
  readonly pack: ProgressionGatePack;
  readonly context: GateContext;
  readonly #requirements = new Map<string, GateRequirement>();

  constructor(input: ProgressionGatePack) {
    if (input?.schemaVersion !== 1 || input?.capability !== 'progression-gates/v1') {
      throw new Error('Unsupported progression gate content');
    }
    identifier(input.contentId, 'Content ID');
    const pack = copy(input);
    if (!pack.keys || typeof pack.keys !== 'object') throw new Error('Missing gate keys');
    for (const field of [
      'levelPrefix', 'classPrefix', 'classLevelSeparator', 'vocationPrefix',
      'questDonePrefix', 'questsCompletedKey',
    ] as const) identifier(pack.keys[field], 'Gate key ' + field);
    if (!Array.isArray(pack.classes) || !Array.isArray(pack.requirements)) {
      throw new Error('Gate classes and requirements must be arrays');
    }
    const names = new Map<string, string>();
    for (const definition of pack.classes) {
      identifier(definition?.id, 'Class ID');
      if (typeof definition.name !== 'string' || names.has(definition.id)) {
        throw new Error('Invalid or duplicate gate class ' + definition.id);
      }
      names.set(definition.id, definition.name);
    }
    for (const requirement of pack.requirements) {
      identifier(requirement?.id, 'Requirement ID');
      if (this.#requirements.has(requirement.id)) throw new Error('Duplicate requirement ' + requirement.id);
      if (requirement.mode !== 'any' && requirement.mode !== 'all') throw new Error('Invalid gate composition');
      if (!Array.isArray(requirement.rows)) throw new Error('Gate rows must be an array');
      for (const row of requirement.rows) validateRow(row);
      this.#requirements.set(requirement.id, requirement);
    }
    this.pack = freeze(pack);
    const keys = this.pack.keys;
    this.context = Object.freeze({
      reachedLevelKey: (level: number) => keys.levelPrefix + level,
      classLevelLedgerKey: (id: string, level: number) => keys.classPrefix + id + keys.classLevelSeparator + level,
      vocationUnlockKey: (id: string) => keys.vocationPrefix + id,
      questDoneKey: (id: string) => keys.questDonePrefix + id,
      vocationPrefix: keys.vocationPrefix,
      questDonePrefix: keys.questDonePrefix,
      questsCompletedKey: keys.questsCompletedKey,
      className: (id: string) => names.get(id),
    });
    Object.freeze(this);
  }

  /** Unknown IDs fail explicitly. An absent group must never open a gate. */
  requirement(id: string): GateRequirement {
    const requirement = this.#requirements.get(id);
    if (!requirement) throw new Error('Unknown gate requirement ' + id);
    return requirement;
  }
}
