import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Inventory } from '../dist/index.js';
const fixture = JSON.parse(fs.readFileSync(new URL('../baseline/milestone-three/inventory.json', import.meta.url)));
for (const [i, scenario] of fixture.scenarios.entries()) test(`original grid/World moves: board ${i}`, () => {
  let inv = new Inventory(scenario.board);
  for (const [n, step] of scenario.steps.entries()) {
    const c = step.command, id = String(c.id);
    const actual = c.type === 'insert' ? inv.insert(scenario.items[id], c.x, c.y)
      : c.type === 'remove' ? !!inv.remove(id) : inv.move(id, c.x, c.y);
    assert.deepEqual(actual, step.result, `step ${n}: ${JSON.stringify(c)}`);
    const snapshot = inv.snapshot();
    assert.deepEqual(snapshot.items.map(i => [i.id, i.x, i.y]), step.placements);
    assert.equal(inv.at(step.query.x, step.query.y) ?? '', step.query.id);
    for (const item of snapshot.items) assert.deepEqual(item.data, scenario.items[item.id].data);
    inv = Inventory.restore(JSON.parse(JSON.stringify(snapshot)));
  }
});
const item = (id, w = 1, h = 1) => ({ id, w, h, data: { gem: { nodes: ['first'], level: 2 }, unknownFutureField: [1, null, 'retained'] } });
test('single blocker swaps are atomic and prospective footprints may not overlap', () => {
  const i = new Inventory({ w: 5, h: 2 });
  i.insert(item('a', 2), 0, 0); i.insert(item('b', 2), 2, 0);
  const before = i.snapshot();
  assert.equal(i.move('a', 1, 0), 'blocked');
  assert.deepEqual(i.snapshot(), before);
  assert.equal(i.move('a', 2, 0), 'swapped');
  assert.equal(i.at(0, 0), 'b'); assert.equal(i.at(2, 0), 'a');
});
test('transfers reject full/duplicate destinations without losing ownership or payload', () => {
  const a = new Inventory({ w: 2, h: 2 }), b = new Inventory({ w: 1, h: 1 });
  const raw = item('a'); a.insert(raw); raw.data.gem.nodes.push('external');
  b.insert(item('b')); const before = a.snapshot();
  assert.equal(a.transferTo(b, 'a'), false); assert.deepEqual(a.snapshot(), before);
  b.remove('b'); b.insert(item('a')); assert.equal(a.transferTo(b, 'a'), false);
  b.remove('a'); assert.equal(a.transferTo(b, 'a'), true);
  assert.equal(a.size, 0); assert.deepEqual(b.get('a').data, item('a').data);
  b.get('a').data.gem.nodes.push('external'); assert.deepEqual(b.get('a').data, item('a').data);
  assert.throws(() => b.transferTo(b, 'a')); assert.equal(b.has('a'), true);
});
test('masks, independent boards, resize and snapshot validation preserve legal state', () => {
  const i = new Inventory({ w: 3, h: 2, rows: ['#.#', '###'] });
  assert.equal(i.insert(item('a', 2), 0, 0), false); i.insert(item('a'), 2, 0);
  const before = i.snapshot(); assert.equal(i.reconfigure({ w: 2, h: 2 }), false);
  assert.deepEqual(i.snapshot(), before); assert.equal(i.reconfigure({ w: 4, h: 2 }), true);
  assert.equal(i.at(2, 0), 'a');
  for (const edit of [s => s.version = 2, s => s.items.push(s.items[0]), s => s.items[0].x = 8,
    s => delete s.items[0].y, s => s.items[0].data = Infinity, s => s.items[0].w = 0]) {
    const s = i.snapshot(); edit(s); assert.throws(() => Inventory.restore(s));
  }
  assert.equal(new Inventory({ w: 1, h: 1 }).size, 0);
});
test('malformed inputs are rejected before mutation and item slots are reusable', () => {
  const i = new Inventory({ w: 2, h: 2 });
  for (const bad of [NaN, Infinity, .5]) assert.throws(() => i.insert(item('a'), bad, 0));
  const cyclic = {}; cyclic.self = cyclic;
  for (const bad of [undefined, () => 3, new Map(), cyclic, [undefined], { x: undefined }]) {
    assert.throws(() => i.insert({ ...item('a'), data: bad })); assert.equal(i.size, 0);
  }
  assert.throws(() => new Inventory({ w: 1000, h: 1000 }));
  assert.throws(() => new Inventory({ w: 2, h: 1, rows: ['x#'] }));
  for (let n = 0; n < 10000; n++) { assert.equal(i.insert(item('a')), true); i.remove('a'); }
  assert.equal(i.size, 0); assert.equal(i.at(0, 0), undefined);
});
test('payload accessors/array extras cannot disappear in saves or run during ownership transfer', () => {
  const inv = new Inventory({ w: 2, h: 2 });
  let calls = 0;
  const array = []; Object.defineProperty(array, '0', { get() { calls++; return 1; }, enumerable: true });
  const extra = [1]; extra.note = 'would be lost';
  const hidden = {}; Object.defineProperty(hidden, 'note', { value: 'would be lost' });
  for (const data of [array, extra, hidden, new Array(2)]) assert.throws(() => inv.insert({ ...item('a'), data }));
  assert.equal(calls, 0); assert.equal(inv.size, 0);
  class HostInventory extends Inventory { insert() { calls++; return true; } }
  const target = new HostInventory({ w: 2, h: 2 }); inv.insert(item('a'));
  assert.equal(inv.transferTo(target, 'a'), true); assert.equal(target.has('a'), true); assert.equal(calls, 0);
});
