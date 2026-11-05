export interface GateLedger {
    readonly ledger: Readonly<Record<string, number>>;
}
export interface GateAccount extends GateLedger {
    readonly features: {
        has(id: string): boolean;
    };
}
/** Level-key encoders append the numeric level after a stable prefix.
 * Encoding zero ends in one zero digit, allowing progress to read the prefix.
 * The host supplies synchronous key encoders and current class names. */
export interface GateContext {
    reachedLevelKey(level: number): string;
    classLevelLedgerKey(classId: string, level: number): string;
    vocationUnlockKey(id: string): string;
    questDoneKey(id: string): string;
    readonly vocationPrefix: string;
    readonly questDonePrefix: string;
    readonly questsCompletedKey: string;
    className(classId: string): string | undefined;
}
/** One avenue. Exactly one of the WHAT fields should be set per row
 *  (ledger / ledgerPrefix / unlock / feature / level / vocation / quest);
 *  `n` scales the counted forms, `label` overrides the spoken line. */
export interface GateRow {
    /** account.ledger[key] ≥ n (n defaults 1). */
    readonly ledger?: string;
    /** ANY account.ledger key starting with this prefix holds ≥ n — the
     *  "one applicable X" form (a gem seen `need`+ times, any vocation done). */
    readonly ledgerPrefix?: string;
    /** Threshold for the counted forms above (default 1). */
    readonly n?: number;
    /** Another CATALOG unlock owned (by id) — resolved through the closure the
     *  caller passes, so this leaf never imports the catalog. */
    readonly unlock?: string;
    /** An account feature flag owned (FEATURE.*). */
    readonly feature?: string;
    /** Sugar: any character has REACHED this level — reads context.reachedLevelKey(n);
     *  the catalog derivation (gateLevelNeeds) guarantees the stamp exists. */
    readonly level?: number;
    /** Sugar: a character of THIS class has reached this level — reads
     *  context.classLevelLedgerKey(classId, level) (the per-class play milestones,
     *  stamped by the XP sweep for whatever class is being PLAYED; the catalog
     *  derivation gateClassLevelNeeds registers the level, so authoring one
     *  here IS registering its stamp). THE OBJECTIVE WEB's play thresholds
     *  and THE MASTERY LADDER's rungs both speak it. */
    readonly classLevel?: {
        readonly classId: string;
        readonly level: number;
    };
    /** Sugar: a vocation completed — true = ANY (prefix scan over
     *  context.vocationPrefix), or one specific vocation id. */
    readonly vocation?: true | string;
    /** Sugar: a quest turned in — true = ANY (quest_done:* prefix, with the
     *  lifetime quests_completed counter honored for accounts whose deeds
     *  predate the per-quest keys), or one specific quest id. */
    readonly quest?: true | string;
    /** The spoken avenue line (else derived per kind). One spelling: the Vault
     *  card, the tooltip, and any probe print THIS. */
    readonly label?: string;
}
/** Does the account hold any ledger key under `prefix` at ≥ n? */
export function ledgerPrefixHeld(a: GateLedger, prefix: string, n = 1): boolean {
    for (const k in a.ledger) {
        if (k.startsWith(prefix) && (a.ledger[k] ?? 0) >= n)
            return true;
    }
    return false;
}
/** Is this one avenue held? `ownedUnlock` resolves `unlock` rows (pass the
 *  catalog's own ownership predicate; a bare `() => false` is honest where no
 *  catalog is in scope). */
export function gateRowMet(a: GateAccount, row: GateRow, ownedUnlock: (id: string) => boolean, context: GateContext): boolean {
    const n = row.n ?? 1;
    if (row.ledger !== undefined)
        return (a.ledger[row.ledger] ?? 0) >= n;
    if (row.ledgerPrefix !== undefined)
        return ledgerPrefixHeld(a, row.ledgerPrefix, n);
    if (row.unlock !== undefined)
        return ownedUnlock(row.unlock);
    if (row.feature !== undefined)
        return a.features.has(row.feature);
    if (row.level !== undefined)
        return (a.ledger[context.reachedLevelKey(row.level)] ?? 0) >= 1;
    if (row.classLevel !== undefined) {
        return (a.ledger[context.classLevelLedgerKey(row.classLevel.classId, row.classLevel.level)] ?? 0) >= 1;
    }
    if (row.vocation !== undefined) {
        return row.vocation === true
            ? ledgerPrefixHeld(a, context.vocationPrefix)
            : (a.ledger[context.vocationUnlockKey(row.vocation)] ?? 0) >= 1;
    }
    if (row.quest !== undefined) {
        if (row.quest !== true)
            return (a.ledger[context.questDoneKey(row.quest)] ?? 0) >= 1;
        // ANY quest: the per-quest presence keys, OR the lifetime counter (the
        // pre-gatework spelling — old accounts' finished quests still speak).
        return ledgerPrefixHeld(a, context.questDonePrefix)
            || (a.ledger[context.questsCompletedKey] ?? 0) >= 1;
    }
    return true; // an empty row gates nothing
}
/** The avenue's spoken line. */
export function gateRowLabel(row: GateRow, context: Pick<GateContext, 'className'>): string {
    if (row.label)
        return row.label;
    const n = row.n ?? 1;
    if (row.level !== undefined)
        return `reach level ${row.level}`;
    if (row.classLevel !== undefined) {
        const className = context.className(row.classLevel.classId);
        return `reach level ${row.classLevel.level} as the ${className ?? row.classLevel.classId}`;
    }
    if (row.vocation !== undefined) {
        return row.vocation === true ? 'complete a vocation' : `complete the ${row.vocation} vocation`;
    }
    if (row.quest !== undefined)
        return row.quest === true ? 'complete a quest' : `complete "${row.quest}"`;
    if (row.feature !== undefined)
        return `own ${row.feature.replace(/_/g, ' ')}`;
    if (row.unlock !== undefined)
        return `own ${row.unlock.replace(/_/g, ' ')}`;
    if (row.ledgerPrefix !== undefined)
        return `${row.ledgerPrefix.replace(/[_:]+$/, '').replace(/_/g, ' ')} ×${n}`;
    if (row.ledger !== undefined)
        return n > 1 ? `${row.ledger.replace(/_/g, ' ')} ×${n}` : row.ledger.replace(/_/g, ' ');
    return '';
}
/** A whole gate: 'any' = one held row opens it (the family law; an EMPTY list
 *  is open), 'all' = every row must hold. */
export function gateMet(a: GateAccount, rows: readonly GateRow[] | undefined, mode: 'any' | 'all', ownedUnlock: (id: string) => boolean, context: GateContext): boolean {
    if (!rows || rows.length === 0)
        return true;
    return mode === 'any'
        ? rows.some(r => gateRowMet(a, r, ownedUnlock, context))
        : rows.every(r => gateRowMet(a, r, ownedUnlock, context));
}
/** Every level the given rows gate on — the milestone-derivation feed (see
 *  header): whoever authors `level` avenues, the XP sweep learns to stamp
 *  their keys from THIS extraction, never from a hand-kept list. */
export function gateLevelNeeds(rows: readonly GateRow[] | undefined): number[] {
    return (rows ?? []).map(r => r.level).filter((n): n is number => typeof n === 'number');
}
/** Every PER-CLASS level the given rows gate on — the class-milestone twin
 *  of gateLevelNeeds (meta/unlocks.ts folds the catalog's needs into the
 *  per-class stamp list the XP sweep reads). */
export function gateClassLevelNeeds(rows: readonly GateRow[] | undefined): {
    readonly classId: string;
    readonly level: number;
}[] {
    return (rows ?? []).map(r => r.classLevel).filter((c): c is {
        readonly classId: string;
        readonly level: number;
    } => !!c);
}
/** The highest stamped milestone at or below `level` among ledger keys of
 *  the shape `prefix<N>` — the progress read behind the two level sugars
 *  (the sweep stamps every milestone ≤ the level reached, so the highest
 *  stamped one IS how far the play went, at milestone grain). */
function highestStampedLevel(a: GateLedger, prefix: string, level: number): number {
    let best = 0;
    for (const k in a.ledger) {
        if (!k.startsWith(prefix) || (a.ledger[k] ?? 0) < 1)
            continue;
        const n = Number(k.slice(prefix.length));
        if (Number.isInteger(n) && n <= level && n > best)
            best = n;
    }
    return best;
}
/** HOW FAR along one avenue the account stands, 0..1 (1 = held). The
 *  counted forms read held/n; the level sugars read the highest stamped
 *  milestone over the target (milestone grain — honest, never a guess);
 *  the binary forms are 0 or 1. THE OBJECTIVE WEB's reveal rule
 *  (meta/unlocks.ts classUnlockProgress) and its progress bars read this —
 *  one fold, every kind. */
export function gateRowProgress(a: GateAccount, row: GateRow, ownedUnlock: (id: string) => boolean, context: GateContext): number {
    if (gateRowMet(a, row, ownedUnlock, context))
        return 1;
    const n = Math.max(1, row.n ?? 1);
    const clamp = (v: number): number => Math.max(0, Math.min(1, v));
    if (row.ledger !== undefined)
        return clamp((a.ledger[row.ledger] ?? 0) / n);
    if (row.ledgerPrefix !== undefined) {
        let best = 0;
        for (const k in a.ledger) {
            if (k.startsWith(row.ledgerPrefix))
                best = Math.max(best, (a.ledger[k] ?? 0) / n);
        }
        return clamp(best);
    }
    if (row.level !== undefined) {
        return clamp(highestStampedLevel(a, context.reachedLevelKey(0).slice(0, -1), row.level) / row.level);
    }
    if (row.classLevel !== undefined) {
        const prefix = context.classLevelLedgerKey(row.classLevel.classId, 0).slice(0, -1);
        return clamp(highestStampedLevel(a, prefix, row.classLevel.level) / row.classLevel.level);
    }
    return 0; // unlock / feature / vocation / quest: binary, and unmet here
}
