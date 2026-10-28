import type { AffixDef, ItemBaseDef } from './item-types.js';

/** Internal friend key; neither this symbol nor the index is a package entry. */
export const itemAffixIndex = Symbol('item-affix-index');

/** Immutable membership index. All query scratch and returned pools are local. */
export class ItemAffixIndex {
  readonly #affixes: readonly AffixDef[];
  readonly #tags: ReadonlyMap<string, Uint32Array>;
  readonly #untagged: Uint32Array;
  constructor(affixes: readonly AffixDef[]) {
    this.#affixes = affixes;
    const tags = new Map<string, number[]>(), untagged: number[] = [];
    for (let at = 0; at < affixes.length; at++) {
      const names = affixes[at].tags;
      if (!names) { untagged.push(at); continue; }
      for (const name of names) {
        let rows = tags.get(name);
        if (!rows) { rows = []; tags.set(name, rows); }
        rows.push(at);
      }
    }
    this.#tags = new Map([...tags].map(([name, rows]) => [name, Uint32Array.from(rows)]));
    this.#untagged = Uint32Array.from(untagged);
    Object.freeze(this);
  }
  pools(base: ItemBaseDef): { prefix: AffixDef[]; suffix: AffixDef[] } {
    const tags = new Set([...base.tags, base.category]), matches = new Set<number>();
    for (const tag of tags) for (const row of this.#tags.get(tag) ?? []) matches.add(row);
    if (base.affixPool !== 'explicit') for (const row of this.#untagged) matches.add(row);
    const prefix: AffixDef[] = [], suffix: AffixDef[] = [];
    // Tag order and duplicate matches cannot change authored registry order.
    for (const row of [...matches].sort((a, b) => a - b)) {
      const affix = this.#affixes[row];
      if (affix.excludeTags && affix.excludeTags.some(tag => tags.has(tag))) continue;
      if (affix.kind === 'prefix') prefix.push(affix);
      else if (affix.kind === 'suffix') suffix.push(affix);
    }
    // Never share result arrays across bases; weighted caches include affinity.
    return { prefix, suffix };
  }
}
