// Original-game observations only; no SDK implementation is imported.
import fs from 'node:fs';
import path from 'node:path';
import { bootSimEngine } from '../src/sim/arena';
import { mulberry32 } from '../src/sim/rng';
import { ITEM_BASES } from '../src/data/itembases';
import { ITEM_AFFIXES } from '../src/data/itemaffixes';
import { UNIQUES } from '../src/data/uniques';
import { VESTIGES, EPITAPH_LIST } from '../src/data/vestiges';
import { RELIQUARY_CFG, RELIC_SCALABLE } from '../src/data/reliquary';
import { DEFENSE_KINDS, ITEM_CFG, type ItemInstance, type ItemRarity } from '../src/engine/items';
import { rollItem, compileItemMods, foldOwnStats, affixPoolsFor } from '../src/engine/itemgen';
import { resolveUniqueChoices } from '../src/engine/itemchoices';

bootSimEngine();
const out = process.argv[2];
if (!out) throw new Error('Output directory required');
fs.mkdirSync(out, { recursive: true });
const rows: any[] = [];
function observe(label: string, item: ItemInstance, roll?: object) {
  rows.push({ label, item: JSON.parse(JSON.stringify(item)),
    expected: { mods: compileItemMods(item), own: foldOwnStats(ITEM_BASES[item.baseId], item),
      choices: item.uniqueId ? resolveUniqueChoices(item, UNIQUES[item.uniqueId]) ?? null : null }, ...(roll ? { roll } : {}) });
}
let seed = 6719;
function rolled(label: string, options: Parameters<typeof rollItem>[0]): ItemInstance {
  const currentSeed = seed++, random = mulberry32(currentSeed); let draws = 0;
  const item = rollItem({ ...options, rng: () => { draws++; return random(); } });
  if (!item) throw new Error(`Cannot mint reference ${label}`);
  observe(label, item, { options, seed: currentSeed, draws }); return item;
}
for (const base of Object.values(ITEM_BASES)) for (const ilvl of [1, 5, 9, 13, 21, 40]) {
  for (const rarity of ['common', 'magic', 'rare'] as ItemRarity[]) rolled(`${base.id}/${ilvl}/${rarity}`, { baseId: base.id, ilvl, rarity });
}
for (const unique of Object.values(UNIQUES)) for (const ilvl of [1, 9, 21, 40]) {
  const item = rolled(`${unique.id}/${ilvl}`, { uniqueId: unique.id, ilvl });
  if (unique.choices?.length) {
    const missing = { ...item, uniqueChoices: undefined }; observe(`${unique.id}/${ilvl}/missing-choice-migration`, missing);
    const retired = { ...item, uniqueChoices: Object.fromEntries(unique.choices.map(g => [g.id, { id: 'retired-option', rolls: [.1] }])) };
    observe(`${unique.id}/${ilvl}/retired-choice-migration`, retired);
  }
}
const carriers = new Map<string, string>();
for (const base of Object.values(ITEM_BASES)) {
  const pools = affixPoolsFor(base);
  for (const def of [...pools.prefix, ...pools.suffix]) if (!carriers.has(def.id)) carriers.set(def.id, base.id);
}
const uncarried: string[] = [];
let uid = 1000000;
function plain(baseId: string, ilvl = 21): ItemInstance {
  return { uid: uid++, baseId, ilvl, tier: 6, rarity: 'rare', name: 'Reference item', baseRoll: .5, implicitRolls: [], affixes: [] };
}
for (const affix of Object.values(ITEM_AFFIXES)) {
  const baseId = carriers.get(affix.id);
  if (!baseId) { uncarried.push(affix.id); continue; }
  for (const tier of [0, affix.tiers.length - 1]) for (const value of [0, .5, 1]) {
    const item = plain(baseId);
    item.affixes = [{ id: affix.id, tier, rolls: affix.lines.map(() => value) }];
    observe(`affix/${affix.id}/${tier}/${value}`, item);
  }
}
for (const base of Object.values(ITEM_BASES)) for (const vestige of Object.values(VESTIGES)) {
  const item = plain(base.id); item.sockets = [vestige.id]; observe(`socket/${base.id}/${vestige.id}`, item);
}
for (const epitaph of EPITAPH_LIST) for (const category of epitaph.categories) {
  const base = Object.values(ITEM_BASES).find(b => b.category === category);
  if (!base) throw new Error(`Missing epitaph category ${category}`);
  const item = plain(base.id); item.rarity = 'common'; item.sockets = [...epitaph.sequence];
  observe(`epitaph/${epitaph.id}/${category}`, item);
  item.sockets = [...epitaph.sequence].reverse(); observe(`epitaph-reversed/${epitaph.id}/${category}`, item);
  item.rarity = 'magic'; item.sockets = [...epitaph.sequence]; observe(`epitaph-rarity/${epitaph.id}/${category}`, item);
}
const pack = { schemaVersion: 1, capability: 'item-modifiers/v1', bases: ITEM_BASES, affixes: ITEM_AFFIXES,
  uniques: UNIQUES, vestiges: VESTIGES, epitaphs: EPITAPH_LIST, defenseKinds: DEFENSE_KINDS,
  config: ITEM_CFG, relic: { baseline: RELIQUARY_CFG.baseline,
    // Portable encoding: null means no finite line cap. Never encode Infinity as an accidental JSON null.
    scalable: Object.fromEntries(Object.entries(RELIC_SCALABLE).map(([id, cap]) => [id, cap === Infinity ? null : cap])) } };
fs.writeFileSync(path.join(out, 'item-rules.json'), JSON.stringify(pack) + '\n');
fs.writeFileSync(path.join(out, 'items.json'), JSON.stringify({ schemaVersion: 1, rows, uncarried }) + '\n');
console.log(JSON.stringify({ observations: rows.length, uncarriedAffixes: uncarried }));
