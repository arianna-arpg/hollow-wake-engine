import { copy, freeze, integer, finite } from './validation.js';
import { passivePointsAtLevel } from './character-progression.js';
import type { ClassRewardBundle } from './class-rewards.js';
export interface CharacterContinuityPack {
    readonly schemaVersion: 1;
    readonly capability: 'character-continuity/v1';
    readonly contentId: string;
    readonly classes: readonly string[];
    readonly starterClasses: readonly string[];
    readonly starterSkills: readonly string[];
    readonly starterSupports: readonly string[];
    readonly rewards: readonly ClassRewardBundle[];
    readonly legacy: { readonly enabled: boolean; readonly target?: string; readonly rows: readonly { readonly id: string; readonly kind: 'skill' | 'support' }[] };
    readonly mercenary: {
        readonly anchor: 'charLevel' | 'zoneLevel';
        readonly trackLevel: boolean;
        readonly respectGearLevelReq: boolean;
        readonly gemLevel: {
            readonly divisor: number;
            readonly offset: number;
            readonly minimum: number;
        };
        readonly passiveBudget: {
            readonly starting: number;
            readonly perLevel: number;
        };
    };
}
function stringIds(ids: readonly string[], context: string): Set<string> {
    if (!Array.isArray(ids))
        throw new Error(context + ' must be an array');
    const values = new Set<string>();
    for (const id of ids) {
        if (typeof id !== 'string' || !id || values.has(id))
            throw new Error('Invalid or duplicate ' + context);
        values.add(id);
    }
    return values;
}
/** Validate once and retain an owned immutable content pack. Mutable account
 * sets, current characters, progress and save storage belong to the host. */
export class CharacterContinuityContent {
    readonly pack: CharacterContinuityPack;
    constructor(input: CharacterContinuityPack) {
        if (input?.schemaVersion !== 1 || input?.capability !== 'character-continuity/v1' || typeof input.contentId !== 'string' || !input.contentId)
            throw new Error('Invalid character continuity content');
        const pack = copy(input), classes = stringIds(pack.classes, 'class ID');
        const starters = stringIds(pack.starterClasses, 'starter class ID');
        for (const id of starters)
            if (!classes.has(id))
                throw new Error('Unknown starter class ' + id);
        stringIds(pack.starterSkills, 'starter skill ID');
        stringIds(pack.starterSupports, 'starter support ID');
        if (!Array.isArray(pack.rewards))
            throw new Error('Class rewards must be an array');
        const awarded = new Set<string>();
        for (const row of pack.rewards) {
            if (!classes.has(row.classId) || awarded.has(row.classId))
                throw new Error('Unknown or duplicate reward class ' + row.classId);
            awarded.add(row.classId);
            stringIds(row.skillIds, 'class skill ID');
            stringIds(row.supportIds ?? [], 'class support ID');
        }
        const legacy = pack.legacy;
        if (!legacy || typeof legacy.enabled !== 'boolean' || !Array.isArray(legacy.rows)) throw new Error('Invalid legacy investment data');
        if (legacy.target !== undefined && (typeof legacy.target !== 'string' || !legacy.target)) throw new Error('Invalid legacy investment target');
        const retired = stringIds(legacy.rows.map(row => row.id), 'legacy investment ID');
        if (legacy.rows.some(row => row.kind !== 'skill' && row.kind !== 'support') || (legacy.target !== undefined && retired.has(legacy.target))) throw new Error('Conflicting legacy investment data');
        const policy = pack.mercenary;
        if (!policy || !['charLevel', 'zoneLevel'].includes(policy.anchor) || typeof policy.trackLevel !== 'boolean' || typeof policy.respectGearLevelReq !== 'boolean')
            throw new Error('Invalid mercenary policy');
        if (finite(policy.gemLevel?.divisor, 'Gem-level divisor') <= 0)
            throw new Error('Gem-level divisor must be positive');
        integer(policy.gemLevel.offset, 0, 'Gem-level offset');
        integer(policy.gemLevel.minimum, 1, 'Minimum gem level');
        integer(policy.passiveBudget?.starting, 0, 'Starting passive budget');
        integer(policy.passiveBudget.perLevel, 0, 'Passive points per level');
        this.pack = freeze(pack);
    }
    gemLevelCap(level: number): number {
        integer(level, 1, 'Mercenary level');
        const rule = this.pack.mercenary.gemLevel;
        return integer(Math.max(rule.minimum, Math.ceil(level / rule.divisor) + rule.offset), 1, 'Mercenary gem cap');
    }
    passiveBudget(level: number): number {
        const rule = this.pack.mercenary.passiveBudget;
        return passivePointsAtLevel(level, rule.starting, rule.perLevel);
    }
}
