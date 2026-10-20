import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { bootSimEngine } from '../src/sim/arena';
import { canPlaceAt, bagItemAt } from '../src/engine/inventory';
import { ITEM_BASES } from '../src/data/itembases';
import type { ItemInstance } from '../src/engine/items';
bootSimEngine();
const { Inventory } = await import(pathToFileURL(process.argv[3]).href);
const mode = process.argv[2], board = { w: 12, h: 12 };
const base = Object.values(ITEM_BASES).find(b => b.w === 1 && b.h === 1)!;
const bag: ItemInstance[] = [], inventory = new Inventory(board);
for (let cell = 0; cell < 144; cell++) if (cell % 4 !== 0) {
  const x = cell % 12, y = Math.floor(cell / 12);
  const item = { uid: cell + 1, baseId: base.id, x, y } as ItemInstance;
  bag.push(item); inventory.insert({ id: String(item.uid), w: 1, h: 1, data: { uid: item.uid, baseId: item.baseId } }, x, y);
}
function batch(batch: number): number {
  let checksum = 0;
  for (let n = 0; n < 1024; n++) {
    const cell = ((batch * 1024 + n) * 37) % 144, x = cell % 12, y = Math.floor(cell / 12);
    if (mode === 'original') { checksum += bagItemAt(bag, x, y)?.uid ?? 0; checksum += canPlaceAt(bag, bag[0], x, y, board) ? 1 : 0; }
    else { checksum += Number(inventory.at(x, y) ?? 0); checksum += inventory.canPlace(String(bag[0].uid), x, y) ? 1 : 0; }
  }
  return checksum;
}
for (let b = 0; b < 200; b++) batch(b);
const times = []; let checksum = 0;
for (let b = 0; b < 500; b++) { const start = performance.now(); checksum += batch(b); times.push(performance.now() - start); }
times.sort((a, b) => a - b);
console.log(JSON.stringify({ mode, items: bag.length, queries: 1024000, batch1024P50Ms: times[250], batch1024P95Ms: times[475], checksum }));
