import fs from 'node:fs';
import path from 'node:path';
import { bootSimEngine } from '../src/sim/arena';
import { mulberry32 } from '../src/sim/rng';
import { ITEM_BASES } from '../src/data/itembases';
import { UNIQUES } from '../src/data/uniques';
import { ITEM_AFFIXES } from '../src/data/itemaffixes';
import { rollItem, forgeItem, affixPoolsFor, nextItemUid, bumpItemUidFloor } from '../src/engine/itemgen';
bootSimEngine();
const cases: { kind: 'roll' | 'forge'; options: any }[] = [];
const add = (kind: 'roll' | 'forge', options: any) => cases.push({ kind, options });
for (const base of Object.values(ITEM_BASES)) for (const quality of [undefined, 0, .5, 1]) {
  const pools = affixPoolsFor(base), picks = [...pools.prefix.slice(0, 5), ...pools.suffix.slice(0, 5)];
  add('forge', { baseId: base.id, ilvl: 21, quality, rarity: 'rare', fillRandom: true,
    affixes: picks.map((a, i) => ({ id: a.id, tier: i % 3 === 0 ? 99 : undefined })), sockets: 99 });
  add('forge', { baseId: base.id, ilvl: 9, quality, rarity: 'common', superior: true, sockets: 2 });
}
for (const unique of Object.values(UNIQUES)) for (const quality of [undefined, .25, 1]) add('forge', { uniqueId: unique.id, ilvl: 40, quality });
for (const ilvl of [1, 5, 13, 21, 40]) for (const rarity of [undefined, 'common', 'magic', 'rare', 'unique']) {
  for (const category of [undefined, 'chest', 'relic', 'not-an-authored-category']) {
    add('roll', { ilvl, rarity, category });
    add('roll', { ilvl, rarity, category, rarityCeiling: 'magic' });
  }
}
for (const family of [...new Set(Object.values(ITEM_AFFIXES).map(a => a.family))].filter((_, i) => i % 37 === 0)) {
  add('roll', { ilvl: 21, withFamily: family, rarity: 'common', affixQuality: { bestTierCount: 2, rollFloor: .8 } });
  add('roll', { ilvl: 5, baseId: 'ring_lapis', withFamily: family, rarity: 'rare' });
}
for (const options of [{ ilvl: 1, baseId: 'missing' }, { ilvl: 1, uniqueId: 'missing' },
  { ilvl: 1, rarityWeights: { common: 0, magic: 0, rare: 0, unique: 0 } },
  { ilvl: 9, rarityWeights: { unique: 10000 }, rarityCeiling: 'rare' }]) add('roll', options);
for (const options of [{ ilvl: 1 }, { ilvl: 1, baseId: 'missing' }, { ilvl: 1, uniqueId: 'missing' }]) add('forge', options);
bumpItemUidFloor(2000000);
const rows = cases.map(({ kind, options }, index) => {
  const seed = 49821 + index, rng = mulberry32(seed), initialUid = nextItemUid() + 1; let draws = 0;
  const actual = (kind === 'roll' ? rollItem : forgeItem)({ ...options, rng: () => { draws++; return rng(); } });
  return { kind, options, seed, initialUid, expected: actual, draws, nextUid: nextItemUid() };
});
fs.mkdirSync(process.argv[2], { recursive: true });
fs.writeFileSync(path.join(process.argv[2], 'mint-options.json'), JSON.stringify({ schemaVersion: 1, rows }) + '\n');
const streamSeed = 35149, streamRandom = mulberry32(streamSeed), initialUid = nextItemUid() + 1;
let streamDraws = 0, nextUid = initialUid;
const streamRows = Array.from({ length: 1500 }, (_, index) => {
  const c = cases[(index * 37) % cases.length];
  const expected = (c.kind === 'roll' ? rollItem : forgeItem)({ ...c.options, rng: () => { streamDraws++; return streamRandom(); } });
  if (expected) nextUid++;
  return { ...c, expected, draws: streamDraws, nextUid };
});
if (nextItemUid() !== nextUid) throw new Error('Unexpected stream identity consumption');
fs.writeFileSync(path.join(process.argv[2], 'item-stream.json'), JSON.stringify({ schemaVersion: 1, seed: streamSeed, initialUid, rows: streamRows }) + '\n');
console.log(`Captured ${rows.length} original mint/forge option paths.`);
