export interface MercenaryTreeSnapshot {
    readonly classId: string;
    readonly allocated: readonly string[];
    readonly vocations?: readonly string[];
}
export function trimMercenaryAllocations(snapshot: MercenaryTreeSnapshot, budget: number, classStart: (id: string) => string, neighbors: (key: string) => readonly string[] | undefined): Set<string> {
    const source = new Set(snapshot.allocated), pending = [classStart(snapshot.classId), ...(snapshot.vocations ?? []).map(v => 'voc_' + v + '_root')].filter(id => source.has(id));
    const kept = new Set(pending);
    let spent = 0;
    for (let cursor = 0; cursor < pending.length && spent < budget; cursor++) {
        for (const id of neighbors(pending[cursor]) ?? []) {
            if (spent >= budget)
                break;
            if (!source.has(id) || kept.has(id))
                continue;
            kept.add(id);
            pending.push(id);
            spent++;
        }
    }
    return kept;
}
export function normalizedMercenarySkill(level: number, cap: number, ratio: number): number {
    return Math.max(1, Math.min(cap, Math.round(level * ratio)));
}
export function createMercenaryIdentity<Def extends {
    readonly name: string;
}, Attrs extends object, Skill>(classDef: Def, snapshot: {
    readonly bar: readonly (Skill | null)[];
    readonly baseAttrs: Attrs;
}) {
    return { classDef, opening: [...snapshot.bar], stances: {}, name: classDef.name, baseAttrs: { ...snapshot.baseAttrs }, attrs: { ...snapshot.baseAttrs } };
}
export function restoreMercenaryCompany<M extends {
    readonly snapshot?: unknown;
}>(save: {
    readonly mercenaries?: readonly (M | null | undefined)[];
    readonly mercenary?: M;
}, restore: (member: M) => void): void {
    const members = save.mercenaries ?? (save.mercenary?.snapshot ? [save.mercenary] : []);
    for (const member of members)
        if (member?.snapshot)
            restore(member);
}
