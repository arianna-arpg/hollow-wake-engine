import {copy,freeze,finite,readonlySet} from './validation.js';
import type {SupportDefinition,SupportModifier,SupportPolicy,SupportStatus} from './support-rules.js';

export const SUPPORT_MECHANISM_NAMES = Object.freeze(['periodicConstruct','cooldown','engagement','affliction','strikes','flight','displaces','bankless','guard','surface','construct','status','pour','landing']);
export interface SupportContentPack<D extends SupportDefinition = SupportDefinition> {
  schemaVersion: 1; capability: 'support-rules/v1'; contentId: string;
  /** Accepted modifier vocabulary, not a declaration of stat base values or
   * effect readers. dynamicStatIds records source ids outside its stat registry. */
  statIds: string[]; dynamicStatIds?: string[]; supports: D[]; statuses: ({id: string} & SupportStatus)[];
  ailmentTuning: Record<string, {identityThreshold: number; incidentalScale: number}>;
  policy: {seatBoundFields: string[]; globalStats: string[]; costStats: string[];
    strikeFields: string[]; surfaceStats: string[]; childFlightStats: string[]; defaultLeveling: SupportModifier[]};
}
function strings(input: unknown, label: string, unique = false): asserts input is string[] {
  if (!Array.isArray(input) || input.length > 65536 || input.some(id => typeof id !== 'string' || !id) || (unique && new Set(input).size !== input.length)) throw new Error(`Invalid support ${label}`);
}
/** Owns data needed by support admission and numeric folding. Other payload
 * fields remain immutable authoring data, not implemented effect executors.
 * Validation happens once; queries use indexed definitions and read-only sets. */
export class SupportContent<D extends SupportDefinition = SupportDefinition> {
  readonly pack: SupportContentPack<D>; readonly policy: SupportPolicy;
  readonly #supports = new Map<string,D>(); readonly #statuses = new Map<string,SupportStatus>();
  constructor(input: SupportContentPack<D>) {
    const pack = copy(input);
    if (!pack || pack.schemaVersion !== 1 || pack.capability !== 'support-rules/v1' || typeof pack.contentId !== 'string' || !pack.contentId) throw new Error('Invalid support content pack');
    strings(pack.statIds,'stat vocabulary',true); const stats = new Set(pack.statIds);
    if (pack.dynamicStatIds !== undefined) {strings(pack.dynamicStatIds,'dynamic stat ids',true); for (const id of pack.dynamicStatIds) if (!stats.has(id)) throw new Error('Dynamic stat missing from support vocabulary');}
    const modifiers = (rows: unknown, label: string): void => {
      if (!Array.isArray(rows) || rows.length > 65536) throw new Error(`Invalid ${label} modifiers`);
      for (const row of rows) {
        if (!row || !stats.has(row.stat) || !['flat','increased','more','override','link'].includes(row.kind)) throw new Error(`Invalid ${label} modifier`);
        finite(row.value,'Support modifier');
        if (row.kind === 'link' && !stats.has(row.fromStat)) throw new Error('Unknown support link source');
        if (row.tags !== undefined) strings(row.tags,'modifier tags');
        if (row.gauge !== undefined && (typeof row.gauge !== 'string' || !row.gauge)) throw new Error('Invalid support gauge');
        if (row.gaugeAt !== undefined) finite(row.gaugeAt,'Support gauge threshold');
        if (row.when !== undefined && (typeof row.when !== 'string' || !row.when)) throw new Error('Invalid support condition');
      }
    };
    const mechanisms = (names: unknown): void => {
      strings(names,'mechanisms');
      for (const name of names) if (!SUPPORT_MECHANISM_NAMES.includes(name.split(':',1)[0])) throw new Error(`Unknown support mechanism: ${name}`);
    };
    const policy = pack.policy;
    if (!policy) throw new Error('Missing support policy');
    for (const key of ['seatBoundFields','globalStats','costStats','strikeFields','surfaceStats','childFlightStats'] as const) strings(policy[key],key,true);
    for (const stat of [...policy.globalStats,...policy.costStats,...policy.surfaceStats,...policy.childFlightStats]) if (!stats.has(stat)) throw new Error(`Unknown support policy stat: ${stat}`);
    modifiers(policy.defaultLeveling,'Default leveling');
    if (!Array.isArray(pack.supports) || pack.supports.length > 4096 || !Array.isArray(pack.statuses) || pack.statuses.length > 4096) throw new Error('Invalid support registries');
    for (const support of pack.supports) {
      if (!support || typeof support.id !== 'string' || !support.id || this.#supports.has(support.id)) throw new Error('Invalid or duplicate support identity');
      for (const key of ['requiresTags','excludeTags','grantsTags'] as const) if (support[key] !== undefined) strings(support[key],key);
      if (support.requiresMechanisms !== undefined) mechanisms(support.requiresMechanisms);
      modifiers(support.mods,'Support'); if (support.perLevel !== undefined) modifiers(support.perLevel,'Per-level');
      for (const key of ['levelBonus','levelBonusPer'] as const) if (support[key] !== undefined) finite(support[key],'Support level bonus');
      if (support.resonance !== undefined && typeof support.resonance !== 'boolean') throw new Error('Invalid support resonance');
      if (support.rollBase) {
        const axes = support.rollBase.axes, ids = new Set<string>();
        if (!Array.isArray(axes) || axes.length > 256) throw new Error('Invalid support cut axes');
        for (const axis of axes) {
          if (!axis || typeof axis.id !== 'string' || !axis.id || ids.has(axis.id) || !Array.isArray(axis.rows) || !axis.rows.length || axis.rows.length > 4096) throw new Error('Invalid support cut axis');
          ids.add(axis.id); const rows = new Set<string>(); let total = 0;
          for (const row of axis.rows) {
            if (!row || typeof row.id !== 'string' || !row.id || rows.has(row.id)) throw new Error('Invalid support cut row');
            rows.add(row.id); total += Math.max(0,finite(row.weight,'Support row weight'));
            if (row.requiresMechanisms !== undefined) mechanisms(row.requiresMechanisms);
            if (row.mods !== undefined) modifiers(row.mods,'Rolled');
          }
          finite(total,'Support axis total weight');
        }
      }
      this.#supports.set(support.id,support);
    }
    for (const status of pack.statuses) {
      if (!status || typeof status.id !== 'string' || !status.id || this.#statuses.has(status.id)) throw new Error('Invalid or duplicate support status');
      if (status.dotType !== undefined && (typeof status.dotType !== 'string' || !status.dotType)) throw new Error('Invalid support dot type');
      if (status.powerInert !== undefined && typeof status.powerInert !== 'boolean') throw new Error('Invalid support status power flag');
      if (status.mods !== undefined) modifiers(status.mods,'Status');
      for (const key of ['interruptChance','scrambleChance'] as const) if (status[key] !== undefined) finite(status[key],'Support status chance');
      this.#statuses.set(status.id,status);
    }
    if (!pack.ailmentTuning || Array.isArray(pack.ailmentTuning) || typeof pack.ailmentTuning !== 'object') throw new Error('Invalid support ailment tuning');
    for (const [id,tuning] of Object.entries(pack.ailmentTuning)) {
      if (!this.#statuses.has(id) || !tuning) throw new Error('Unknown tuned support status');
      finite(tuning.identityThreshold,'Ailment threshold'); finite(tuning.incidentalScale,'Incidental ailment scale');
    }
    this.pack = freeze(pack);
    this.policy = Object.freeze({...policy,seatBoundFields:readonlySet(policy.seatBoundFields),globalStats:readonlySet(policy.globalStats),costStats:readonlySet(policy.costStats)});
    Object.freeze(this);
  }
  support(id: string): D {const support = this.#supports.get(id); if (!support) throw new Error(`Unknown support: ${id}`); return support;}
  status(id: string): SupportStatus | undefined {return this.#statuses.get(id);}
  tuneChance(id: string, authored: number): number {
    finite(authored,'Authored ailment chance');
    const tuning = Object.hasOwn(this.pack.ailmentTuning,id) ? this.pack.ailmentTuning[id] : undefined;
    return finite(!tuning || authored >= tuning.identityThreshold ? authored : authored * tuning.incidentalScale,'Tuned ailment chance');
  }
}
