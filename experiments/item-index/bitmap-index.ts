import type { AffixDef, ItemBaseDef } from './item-types.js';

/** Internal friend key; neither this symbol nor the index is a package entry. */
export const itemAffixIndex = Symbol('item-affix-index');

/** Immutable postings; bounded query scratch preserves registry order directly. */
export class ItemAffixIndex {
  readonly #affixes: readonly AffixDef[];
  readonly #tags: ReadonlyMap<string, Uint32Array>;
  readonly #untagged: Uint32Array;
  readonly #words: number;
  constructor(affixes: readonly AffixDef[]) {
    this.#affixes = affixes;
    this.#words = Math.ceil(affixes.length / 32);
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
    const tags = new Set([...base.tags, base.category]), matches = new Uint32Array(this.#words);
    for (const tag of tags) {
      const rows = this.#tags.get(tag);
      if (!rows) continue;
      for (let at = 0; at < rows.length; at++) {
        const row = rows[at];
        matches[row >>> 5] |= 1 << (row & 31);
      }
    }
    if (base.affixPool !== 'explicit') for (let at = 0; at < this.#untagged.length; at++) {
      const row = this.#untagged[at];
      matches[row >>> 5] |= 1 << (row & 31);
    }
    const prefix: AffixDef[] = [], suffix: AffixDef[] = [];
    for (let word = 0; word < matches.length; word++) {
      let remaining = matches[word];
      while (remaining !== 0) {
        const row = word * 32 + 31 - Math.clz32(remaining & -remaining);
        remaining &= remaining - 1;
        const affix = this.#affixes[row];
        if (affix.excludeTags && affix.excludeTags.some(tag => tags.has(tag))) continue;
        if (affix.kind === 'prefix') prefix.push(affix);
        else if (affix.kind === 'suffix') suffix.push(affix);
      }
    }
    // Returned pools and weighted caches remain separate for each base/owner.
    return { prefix, suffix };
  }
}
