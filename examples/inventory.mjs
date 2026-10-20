import assert from 'node:assert/strict';
import { Inventory } from '../dist/index.js';

// Host supplies durable identity, footprint and authored instance data.
const bag = new Inventory({ w: 12, h: 8 });
bag.insert({ id: 'hero:item:42', w: 1, h: 1, data: { baseId: 'ring_lapis', implicitRolls: [.5], sockets: [] } });
const stash = new Inventory({ w: 5, h: 5, rows: ['#####', '#...#', '#...#', '#...#', '#####'] });
// Apply the game's eligibility/trade policy before requesting an ownership transfer.
assert.equal(bag.transferTo(stash, 'hero:item:42', 0, 0), true);
assert.equal(bag.has('hero:item:42'), false);
assert.equal(stash.move('hero:item:42', 2, 2), 'blocked');
const saved = JSON.stringify(stash.snapshot());
const restored = Inventory.restore(JSON.parse(saved));
assert.equal(restored.at(0, 0), 'hero:item:42');
console.log(saved);
