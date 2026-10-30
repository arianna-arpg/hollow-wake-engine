// Derived from Hollow Wake StatSheet; provenance is pinned in baseline/source-lock.json.
// Refactors: instance rules, indexed trades, owned modifier arrays, collision-free cache keys.
import { StatRules, modReadsVictim, validateModifier, type Modifier, type SkillTag, type ConditionId, type ArmedFamily } from './stat-rules.js';
import { copy, finite, freeze, integer } from './validation.js';
import { TagContextCache } from './tag-context-cache.js';

const encodeContext = (tags: readonly string[]) => JSON.stringify(tags);

export class StatSheet {
    constructor(private readonly rules: StatRules, private readonly maxCacheEntries = 256, private readonly maxContextCacheEntries = 16) {
        integer(maxCacheEntries, 0, 'stat cache bound');
        integer(maxContextCacheEntries, 0, 'stat context cache bound');
    }
    private generation = 0;
    get revision(): number { return this.generation; }
    get cacheEntries(): number { return this.cache.size; }
    get contextCacheEntries(): number { return this.contextKeys?.size ?? 0; }
    private contextKeys: TagContextCache<string> | undefined;
    private sources = new Map<string, Modifier[]>();
    private modsByStat: Map<string, Modifier[]> | null = null;
    private baseOverrides = new Map<string, number>();
    private cache = new Map<string, number>();
    private conditions = new Set<ConditionId>();
    private conditionKey = '';
    private gauges = new Map<string, number>();
    private gaugeKey = '';
    private whenRefs: Set<ConditionId> | null = null;
    private taggedStats: Set<string> | null = null;
    private vsMods: boolean | null = null;
    private gaugeRefs: Set<string> | null = null;
    private armedFams: Map<string, ArmedFamily> | null = null;
    private invalidate(): void {
        this.generation++;
        this.cache.clear();
        this.armedFams = null;
    }
    setConditions(active: ConditionId[]): void {
        const key = JSON.stringify([...new Set(active)].sort());
        if (key === this.conditionKey)
            return;
        this.conditionKey = key;
        this.conditions = new Set(active);
        this.invalidate();
    }
    hasCondition(id: ConditionId): boolean { return this.conditions.has(id); }
    usesCondition(id: ConditionId): boolean {
        if (!this.whenRefs) {
            const refs = new Set<ConditionId>();
            for (const mods of this.sources.values()) {
                for (const m of mods)
                    if (m.when)
                        refs.add(m.when);
            }
            this.whenRefs = refs;
        }
        return this.whenRefs.has(id);
    }
    setGauges(entries: [
        string,
        number
    ][]): void {
        for (const [id, value] of entries) finite(value, id);
        if (new Set(entries.map(([id]) => id)).size !== entries.length) throw new Error('Duplicate gauge id');
        const key = JSON.stringify(entries.slice().sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
        if (key === this.gaugeKey)
            return;
        this.gaugeKey = key;
        this.gauges = new Map(entries);
        this.invalidate();
    }
    gauge(id: string): number { return this.gauges.get(id) ?? 0; }
    setSource(name: string, mods: Modifier[]): void {
        for (const mod of mods) validateModifier(mod);
        this.sources.set(name, freeze(copy(mods)));
        this.modsByStat = null;
        this.invalidate();
        this.whenRefs = null;
        this.taggedStats = null;
        this.vsMods = null;
        this.gaugeRefs = null;
    }
    removeSource(name: string): void {
        if (this.sources.delete(name)) {
            this.modsByStat = null;
            this.invalidate();
            this.whenRefs = null;
            this.taggedStats = null;
            this.vsMods = null;
            this.gaugeRefs = null;
        }
    }
    hasVsMods(): boolean {
        if (this.vsMods === null) {
            let any = false;
            for (const mods of this.sources.values()) {
                for (const m of mods)
                    if (modReadsVictim(m)) {
                        any = true;
                        break;
                    }
                if (any)
                    break;
            }
            this.vsMods = any;
        }
        return this.vsMods;
    }
    usesGauge(id: string): boolean {
        if (!this.gaugeRefs) {
            const refs = new Set<string>();
            for (const mods of this.sources.values()) {
                for (const m of mods)
                    if (m.gauge)
                        refs.add(m.gauge);
            }
            this.gaugeRefs = refs;
        }
        return this.gaugeRefs.has(id);
    }
    hasTaggedMods(stat: string): boolean {
        if (!this.taggedStats) {
            const s = new Set<string>();
            for (const mods of this.sources.values()) {
                for (const m of mods)
                    if (m.tags?.length)
                        s.add(m.stat);
            }
            this.taggedStats = s;
        }
        return this.taggedStats.has(stat);
    }
    hasSource(name: string): boolean { return this.sources.has(name); }
    sourceNames(): string[] { return [...this.sources.keys()]; }
    getSourceMods(name: string): Modifier[] | undefined { const mods = this.sources.get(name); return mods ? copy(mods) : undefined; }
    private sourceModsFor(stat: string): readonly Modifier[] | undefined {
        if (!this.modsByStat) {
            const index = new Map<string, Modifier[]>();
            for (const mods of this.sources.values())
                for (const m of mods) {
                    const id = m.stat;
                    let bucket = index.get(id);
                    if (!bucket)
                        index.set(id, bucket = []);
                    bucket.push(m);
                }
            this.modsByStat = index;
        }
        return this.modsByStat.get(stat);
    }
    setBase(stat: string, value: number): void {
        finite(value, stat);
        this.baseOverrides.set(stat, value);
        this.invalidate();
    }
    armedFamily(prefix: string, ids: readonly string[], extra?: readonly Modifier[]): readonly string[] {
        const fams = (this.armedFams ??= new Map());
        let fam = fams.get(prefix);
        if (!fam || fam.registry !== ids || fam.registryLength !== ids.length) {
            const named = new Set<string>();
            for (const mods of this.sources.values()) {
                for (const m of mods)
                    if (m.stat.startsWith(prefix))
                        named.add(m.stat);
            }
            for (const [stat, v] of this.baseOverrides) {
                if (v > 0 && stat.startsWith(prefix))
                    named.add(stat);
            }
            const list = Object.freeze(ids.filter(id => named.has(prefix + id) || this.rules.staticallyArmed(prefix + id)));
            fam = { registry: ids, registryLength: ids.length, ids: list, set: new Set(list) };
            fams.set(prefix, fam);
        }
        if (!extra || !extra.length)
            return fam.ids;
        const sheetArmed = fam.set;
        let added: Set<string> | undefined;
        for (const m of extra) {
            if (!m.stat.startsWith(prefix))
                continue;
            const id = m.stat.slice(prefix.length);
            if (!sheetArmed.has(id))
                (added ??= new Set()).add(id);
        }
        if (!added)
            return fam.ids;
        const fresh = added;
        return ids.filter(id => sheetArmed.has(id) || fresh.has(id));
    }
    get(stat: string, contextTags?: ReadonlySet<SkillTag>, extra?: readonly Modifier[], baseValue?: number): number {
        return this.compute(stat, contextTags, extra, baseValue, false);
    }
    private compute(stat: string, contextTags?: ReadonlySet<SkillTag>, extra?: readonly Modifier[], baseValue?: number, noLinks = false): number {
        const cacheable = this.maxCacheEntries > 0 && (!extra || !extra.length) && baseValue === undefined;
        let key = '';
        if (cacheable) {
            const context = contextTags && contextTags.size
                ? (this.contextKeys ??= new TagContextCache(encodeContext, this.maxContextCacheEntries)).get(contextTags)
                : '[]';
            // Length-prefixed stat id and canonical JSON tags cannot alias even
            // when ids contain separators, quotes or surrogate pairs.
            key = (noLinks ? '1:' : '0:') + stat.length + ':' + stat + context;
            const cached = this.cache.get(key);
            if (cached !== undefined)
                return cached;
        }
        const def = this.rules.definitions[stat];
        let base = baseValue ?? this.baseOverrides.get(stat) ?? def?.base ?? 0;
        let flat = 0, increased = 0, moreMult = 1;
        let override: number | undefined;
        let links: Modifier[] | undefined;
        const sourceMods = this.sourceModsFor(stat);
        for (let phase = 0; phase < 2; phase++) {
            const mods = phase === 0 ? sourceMods : extra;
            if (!mods)
                continue;
            modifier: for (const m of mods) {
                if (m.stat !== stat)
                    continue;
                if (m.when && !this.conditions.has(m.when))
                    continue;
                if (m.tags && m.tags.length) {
                    if (!contextTags)
                        continue;
                    for (const t of m.tags)
                        if (!contextTags.has(t))
                            continue modifier;
                }
                let v = m.value;
                if (m.gauge) {
                    const g = this.gauges.get(m.gauge) ?? 0;
                    if (m.gaugeAt !== undefined) {
                        if (g < m.gaugeAt)
                            continue;
                    }
                    else {
                        if (g === 0)
                            continue;
                        v *= g;
                    }
                }
                switch (m.kind) {
                    case 'flat':
                        flat += v;
                        break;
                    case 'increased':
                        increased += v;
                        break;
                    case 'more':
                        moreMult *= 1 + v;
                        break;
                    case 'override':
                        override = v;
                        break;
                    case 'link':
                        if (!noLinks && m.fromStat)
                            (links ??= []).push({ ...m, value: v });
                        break;
                }
            }
        }
        if (links) {
            for (const l of links) {
                flat += l.value * this.compute(l.fromStat!, contextTags, extra, undefined, true);
            }
        }
        if (!noLinks) {
            for (const t of this.rules.incoming[stat] ?? []) {
                if (t.to !== stat)
                    continue;
                const rate = this.compute(t.rateStat, contextTags, extra);
                if (rate <= 0)
                    continue;
                flat += rate * this.compute(t.from, contextTags, extra, undefined, true);
            }
        }
        let value = override !== undefined ? override : (base + flat) * (1 + increased) * moreMult;
        if (!noLinks) {
            for (const t of this.rules.outgoing[stat] ?? []) {
                if (t.from !== stat)
                    continue;
                const forgone = this.compute(t.forgoStat, contextTags, extra);
                if (forgone > 0)
                    value *= Math.max(0, 1 - Math.min(1, forgone));
            }
        }
        if (def) {
            if (def.min !== undefined)
                value = Math.max(def.min, value);
            if (def.max !== undefined)
                value = Math.min(def.max, value);
        }
        finite(value, `resolved stat ${stat}`);
        if (cacheable && this.cache.size >= this.maxCacheEntries) this.cache.clear();
        if (cacheable)
            this.cache.set(key, value);
        return value;
    }
}
