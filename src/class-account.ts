export interface SavedClassAccess {
    readonly unlockedClasses?: readonly string[];
    readonly pendingClassUnlocks?: readonly unknown[];
    readonly unlockedClassTiers?: readonly unknown[];
}
export interface ClassAccessState {
    readonly unlockedClasses: Set<string>;
    readonly pendingClassUnlocks: Set<string>;
    readonly unlockedClassTiers: Set<string>;
}
export function createClassAccess(starters: readonly string[]): ClassAccessState {
    return { unlockedClasses: new Set(starters), pendingClassUnlocks: new Set<string>(), unlockedClassTiers: new Set<string>() };
}
/** Restore the account's discovery and pending-selection sets. Unknown
 * discoveries survive, while pending entries require a current owned class. */
export function restoreClassAccess(saved: SavedClassAccess, starters: readonly string[], classes: readonly {
    readonly id: string;
}[]): ClassAccessState {
    const unlockedClasses = new Set([...starters, ...(saved.unlockedClasses ?? [])]);
    const pendingClassUnlocks = new Set((saved.pendingClassUnlocks ?? []).filter((id): id is string => typeof id === 'string' && !starters.includes(id) && classes.some(c => c.id === id) && (saved.unlockedClasses ?? []).includes(id)));
    const unlockedClassTiers = new Set((saved.unlockedClassTiers ?? []).filter((id): id is string => typeof id === 'string'));
    return { unlockedClasses, pendingClassUnlocks, unlockedClassTiers };
}
/** Preserve the recorded dictionary shape while dropping nonstring picks.
 * Both map levels are detached and accept own keys such as __proto__. */
export function restoreKitPicks(saved: unknown): Record<string, Record<string, string>> {
    return Object.fromEntries(Object.entries(saved ?? {})
        .filter(([, value]) => value && typeof value === 'object')
        .map(([id, value]) => [id, Object.fromEntries(Object.entries(value as object)
            .filter(([, skill]) => typeof skill === 'string'))]));
}
export interface SavedGemPools {
    readonly unlockedSkills?: readonly string[];
    readonly explicitSkillUnlocks?: readonly string[];
    readonly unlockedSupports?: readonly string[];
}
export interface GemPoolState {
    readonly unlockedSkills: Set<string>;
    readonly explicitSkillUnlocks: Set<string>;
    readonly unlockedSupports: Set<string>;
}
export function createGemPools(starterSkills: readonly string[], starterSupports: readonly string[]): GemPoolState {
    return { unlockedSkills: new Set(starterSkills), explicitSkillUnlocks: new Set(starterSkills), unlockedSupports: new Set(starterSupports) };
}
export function restoreGemPools(saved: SavedGemPools, starterSkills: readonly string[], starterSupports: readonly string[]): GemPoolState {
    return { unlockedSkills: new Set([...starterSkills, ...(saved.unlockedSkills ?? [])]),
        explicitSkillUnlocks: new Set([...starterSkills, ...(saved.explicitSkillUnlocks ?? [])]),
        unlockedSupports: new Set([...starterSupports, ...(saved.unlockedSupports ?? [])]) };
}
/** Collection lists are detached. The kit dictionary is a shallow borrowed
 * value, matching the host's synchronous serialize-then-write contract. */
export function serializeClassAccess(state: {
    readonly unlockedClasses: Iterable<string>;
    readonly pendingClassUnlocks: Iterable<string>;
    readonly unlockedClassTiers: Iterable<string>;
    readonly kitPicks: Record<string, Record<string, string>>;
}) {
    return { unlockedClasses: [...state.unlockedClasses], pendingClassUnlocks: [...state.pendingClassUnlocks],
        unlockedClassTiers: [...state.unlockedClassTiers], kitPicks: state.kitPicks };
}
export function serializeGemPools(state: {
    readonly unlockedSkills: Iterable<string>;
    readonly explicitSkillUnlocks: Iterable<string>;
    readonly unlockedSupports: Iterable<string>;
}) {
    return { unlockedSkills: [...state.unlockedSkills], explicitSkillUnlocks: [...state.explicitSkillUnlocks], unlockedSupports: [...state.unlockedSupports] };
}
