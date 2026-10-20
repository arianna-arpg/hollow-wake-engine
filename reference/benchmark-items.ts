import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { bootSimEngine } from '../src/sim/arena';
import { mulberry32 } from '../src/sim/rng';
import { ITEM_BASES } from '../src/data/itembases';
import { rollItem, compileItemMods } from '../src/engine/itemgen';
bootSimEngine();
const { ItemContent, ItemRules } = await import(pathToFileURL(process.argv[3]).href);
const mode = process.argv[2], bases = Object.values(ITEM_BASES).filter(b => b.dropWeight > 0).map(b => b.id);
const random = mulberry32(54321);
let rules: InstanceType<typeof ItemRules> | undefined;
const loadStart = performance.now();
if (mode === 'sdk') rules = new ItemRules(new ItemContent(JSON.parse(fs.readFileSync(process.argv[4], 'utf8'))), 54321);
const contentLoadMs = performance.now() - loadStart;
function batch(index: number): number {
  let checksum = 0;
  for (let n = 0; n < 20; n++) {
    const options = { baseId: bases[(index * 20 + n) % bases.length], ilvl: 21, rarity: 'rare' as const };
    const item: NonNullable<ReturnType<typeof rollItem>> = rules ? rules.roll(options)! : rollItem({ ...options, rng: random })!;
    const mods: ReturnType<typeof compileItemMods> = rules ? rules.compile(item) : compileItemMods(item);
    checksum += item.baseRoll + item.name.length + item.affixes.reduce((v, a) => v + a.tier + a.id.length, 0)
      + mods.reduce((v, m) => v + m.value + m.stat.length, 0);
  }
  return checksum;
}
for (let b = 0; b < 50; b++) batch(b);
const times: number[] = []; let checksum = 0;
for (let b = 0; b < 250; b++) { const start = performance.now(); checksum += batch(b); times.push(performance.now() - start); }
times.sort((a, b) => a - b);
console.log(JSON.stringify({ mode, contentLoadMs, batch20P50Ms: times[125], batch20P95Ms: times[237], checksum }));
