import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const expected = {
  'item-core.ts': '50651f8c30ae3d69e60b2b3bd42d668b1673e628028fbd0806eb2a43971c0b99',
  'item-rules.ts': '25ab69ff6ac3e6df87c59629e33d823929d0b398b4c0dfb1b4ec6fd367be85ae',
  'item-host.ts': '45ac229e90538f64c0504c7ebc8be4d79e8886ae7b99e793149abf2d101a773d'
};
export function contentIndexedSource(file, bytes) {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected[file], file);
  const original = bytes.toString('utf8'), eol = original.includes('\r\n') ? '\r\n' : '\n';
  let source = original.replaceAll('\r\n', '\n');
  const once = (before, after) => {assert.equal(source.split(before).length, 2, before); source = source.replace(before, after);};
  if (file === 'item-core.ts') {
    once("import { Random } from './random.js';", "import { Random } from './random.js';\nimport { ItemAffixIndex } from './item-affix-index.js';");
    once('export function itemOperations(pack: ItemRulePack, nextItemUid: () => number) {', 'export function itemOperations(pack: ItemRulePack, nextItemUid: () => number, index?: ItemAffixIndex) {');
    once('const ITEM_AFFIX_LIST = Object.values(ITEM_AFFIXES), UNIQUE_LIST = Object.values(UNIQUES);', 'const UNIQUE_LIST = Object.values(UNIQUES);');
    const start = source.indexOf('function affixPoolsFor('), end = source.indexOf('\nfunction improveAffixQuality(', start);assert(start > 0 && end > start);
    source = source.slice(0, start) + `function affixPoolsFor(base: ItemBaseDef): { prefix: AffixDef[]; suffix: AffixDef[] } {
  let pools = affixPoolCache.get(base.id);
  if (pools) return pools;
  // ItemContent supplies a shared immutable index. Direct internal callers may
  // omit it and retain a lazy owner-local fallback.
  index ??= new ItemAffixIndex(Object.values(ITEM_AFFIXES));
  pools = index.pools(base);
  affixPoolCache.set(base.id, pools);
  return pools;
}
` + source.slice(end);
  } else if (file === 'item-rules.ts') {
    once("import { itemOperations } from './item-core.js';", "import { itemOperations } from './item-core.js';\nimport { ItemAffixIndex, itemAffixIndex } from './item-affix-index.js';");
    once('  readonly pack: ItemRulePack;', '  readonly pack: ItemRulePack;\n  readonly [itemAffixIndex]: ItemAffixIndex;');
    once('    this.pack = freeze(owned);', '    this.pack = freeze(owned);\n    this[itemAffixIndex] = new ItemAffixIndex(Object.values(this.pack.affixes));');
    once('this.#ops = itemOperations(this.content.pack, () => this.#nextUid++);', 'this.#ops = itemOperations(this.content.pack, () => this.#nextUid++, this.content[itemAffixIndex]);');
  } else {
    once("import { ItemContent } from './item-rules.js';", "import { ItemContent } from './item-rules.js';\nimport { itemAffixIndex } from './item-affix-index.js';");
    once("const ops = itemOperations(content.pack, () => integer(nextUid(), 1, 'Host item uid'));", "const ops = itemOperations(content.pack, () => integer(nextUid(), 1, 'Host item uid'), content[itemAffixIndex]);");
  }
  return source.replaceAll('\n', eol);
}
