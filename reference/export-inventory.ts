import fs from 'node:fs';
import path from 'node:path';
import { makeSimWorld } from '../src/sim/arena';
import { mulberry32 } from '../src/sim/rng';
import { ITEM_BASES } from '../src/data/itembases';
import { itemGridSize } from '../src/engine/itemgen';
import { autoPlace, placeAt, removeFromBag, canPlaceAt, swapBlockerFits, bagItemAt, setBagBoardSource } from '../src/engine/inventory';
import type { ItemInstance } from '../src/engine/items';

const out = process.argv[2];
if (!out) throw new Error('Output directory required');
const world = makeSimWorld('magician', 4421), seat = world.seats[0];
const bases = [[1, 1], [1, 2], [2, 1], [2, 2], [2, 3]].map(([w, h]) => {
  const base = Object.values(ITEM_BASES).find(b => b.w === w && b.h === h);
  if (!base) throw new Error(`No authored footprint ${w}x${h}`);
  return base.id;
});
const scenarios = [
  { w: 12, h: 12 }, { w: 5, h: 5, rows: ['#####', '#...#', '#...#', '#...#', '#####'] },
  { w: 7, h: 4, rows: ['###.###', '#######', '#######', '.#####.'] }, { w: 2, h: 2 },
].map((board, index) => {
  const rng = mulberry32(14847 + index), pick = (n: number) => Math.floor(rng() * n);
  const originalBoard = { w: board.w, h: board.h, open: (x: number, y: number) => !board.rows || board.rows[y][x] === '#' };
  setBagBoardSource(() => originalBoard);
  seat.meta.items = [];
  const items: Record<string, any> = {}, steps: any[] = [];
  let uid = 1;
  for (let n = 0; n < 750; n++) {
    const bag = seat.meta.items, kind = pick(5);
    let command: any, result: any;
    if (kind < 2 || !bag.length) {
      const item = { uid: uid++, baseId: bases[pick(bases.length)], ilvl: 1, tier: 1, rarity: 'common',
        name: 'Reference item', baseRoll: .5, implicitRolls: [], affixes: [], sockets: [], locked: uid % 7 === 0 } as ItemInstance;
      const size = itemGridSize(item);
      items[item.uid] = { id: String(item.uid), ...size, data: JSON.parse(JSON.stringify(item)) };
      command = kind === 0 ? { type: 'insert', id: item.uid, x: pick(board.w + 2) - 1, y: pick(board.h + 2) - 1 } : { type: 'insert', id: item.uid };
      result = command.x === undefined ? autoPlace(bag, item, originalBoard) : placeAt(bag, item, command.x, command.y, originalBoard);
    } else if (kind === 2) {
      const item = bag[pick(bag.length)];
      command = { type: 'remove', id: item.uid };
      result = !!removeFromBag(bag, item.uid);
    } else {
      const item = bag[pick(bag.length)], x = pick(board.w + 2) - 1, y = pick(board.h + 2) - 1;
      command = { type: 'move', id: item.uid, x, y };
      result = canPlaceAt(bag, item, x, y, originalBoard) ? 'moved' : swapBlockerFits(bag, item, x, y, originalBoard) ? 'swapped' : 'blocked';
      // Actual World operation, not a second implementation of the swap policy.
      world.moveBagItem(seat, item.uid, x, y);
    }
    const query = { x: pick(board.w), y: pick(board.h) };
    steps.push({ command, result, placements: bag.map(i => [String(i.uid), i.x, i.y]),
      query: { ...query, id: String(bagItemAt(bag, query.x, query.y)?.uid ?? '') } });
  }
  return { board, items, steps };
});
setBagBoardSource(null);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'inventory.json'), JSON.stringify({ schemaVersion: 1, scenarios }) + '\n');
console.log(`Captured ${scenarios.length * 750} original inventory transitions (World moves included).`);
