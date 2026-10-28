import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const baselineCoreSha256 = '7378bdfe0278ab25b95f255398fae7bcedddd79fa0ef05192a69d7001c61f55b';

// Experimental source overlay. The accepted production source is not edited.
export function indexedItemCore(bytes) {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), baselineCoreSha256);
  const original = bytes.toString('utf8'), eol = original.includes('\r\n') ? '\r\n' : '\n';
  const source = original.replaceAll('\r\n', '\n');
  const start = source.indexOf('function affixPoolsFor('), end = source.indexOf('\nfunction improveAffixQuality(', start);
  assert(start > 0 && end > start);
  assert.equal(source.indexOf('function affixPoolsFor(', start + 1), -1);
  const replacement = `// Built only when an owner first needs an affix pool. Membership depends on
// immutable definitions; the index does not consume random or identity state.
let affixTagIndex: Map<string, number[]> | undefined;
let untaggedAffixes: number[] = [];
function affixPoolsFor(base: ItemBaseDef): { prefix: AffixDef[]; suffix: AffixDef[] } {
  let pools = affixPoolCache.get(base.id);
  if (pools) return pools;
  if (!affixTagIndex) {
    const index = new Map<string, number[]>(), untagged: number[] = [];
    for (let at = 0; at < ITEM_AFFIX_LIST.length; at++) {
      const tags = ITEM_AFFIX_LIST[at].tags;
      if (!tags) { untagged.push(at); continue; }
      for (const tag of tags) {
        let rows = index.get(tag);
        if (!rows) { rows = []; index.set(tag, rows); }
        rows.push(at);
      }
    }
    // Publish only after construction succeeds. Empty tag arrays stay excluded.
    affixTagIndex = index; untaggedAffixes = untagged;
  }
  const baseTags = new Set([...base.tags, base.category]);
  const matches = new Set<number>();
  for (const tag of baseTags) for (const at of affixTagIndex.get(tag) ?? []) matches.add(at);
  if (base.affixPool !== 'explicit') for (const at of untaggedAffixes) matches.add(at);
  pools = { prefix: [], suffix: [] };
  // Authored registry order controls weighted sums and RNG outcomes. Query/tag
  // order must not change it, and an affix naming several tags appears once.
  for (const at of [...matches].sort((a, b) => a - b)) {
    const affix = ITEM_AFFIX_LIST[at];
    if (affix.excludeTags && affix.excludeTags.some(tag => baseTags.has(tag))) continue;
    if (affix.kind === 'prefix') pools.prefix.push(affix);
    else if (affix.kind === 'suffix') pools.suffix.push(affix);
  }
  // Each base retains distinct arrays: weighted-pool caches also depend on its
  // affinity, even when another base has identical tag membership.
  affixPoolCache.set(base.id, pools);
  return pools;
}
`;
  return (source.slice(0, start) + replacement + source.slice(end)).replaceAll('\n', eol);
}
