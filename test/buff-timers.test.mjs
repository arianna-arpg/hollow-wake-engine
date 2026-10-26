import { test } from 'node:test';
import assert from 'node:assert/strict';
const { BuffRuntime } = await import(process.env.HOLLOW_WAKE_BUFF_MODULE ?? '../dist/buffs.js');

function setup(durations) {
  const owner = { buffs: new Map(), gainEvents: [] }, calls = [];
  const runtime = new BuffRuntime({
    publish(_owner, source, mods) { calls.push(['publish', source, mods]); },
    removeSource(_owner, source) { calls.push(['remove', source]); },
    release() {},
  });
  for (const duration of durations) runtime.grant(owner, {
    type: 'buff', id: 'cuts', duration, mods: [{ value: 3 }],
    stackTimers: 'independent', maxStacks: 12,
  });
  calls.length = 0;
  return { owner, runtime, calls, record: owner.buffs.get('cuts') };
}

test('live independent clocks preserve a different scalar duration after a shared refresh', () => {
  const s = setup([8, 6, 3]), clocks = s.record.expiries;
  s.runtime.grant(s.owner, { type: 'buff', id: 'cuts', duration: .5, mods: [{ value: 7 }] });
  s.calls.length = 0;
  s.runtime.advance(s.owner, 1);
  assert.equal(s.owner.buffs.get('cuts'), s.record);
  assert.equal(s.record.expiries, clocks);
  assert.deepEqual(clocks, [7, 5, 2]);
  assert.equal(s.record.remaining, -.5);
  assert.equal(s.record.stacks, 3);
  assert.deepEqual(s.calls, []);
  s.runtime.advance(s.owner, 2);
  assert.deepEqual(clocks, [5, 3]);
  assert.equal(s.record.remaining, 5);
  assert.equal(s.record.stacks, 2);
  assert.deepEqual(s.calls, [['publish', 'buff:cuts', [{ value: 14 }]]]);
});

test('partial expiry includes the live prefix when finding the longest remaining application', () => {
  const s = setup([8, 6, 1, 7, 0, 4]), clocks = s.record.expiries;
  s.runtime.advance(s.owner, 2);
  assert.equal(s.record.expiries, clocks);
  assert.deepEqual(clocks, [6, 4, 5, 2]);
  assert.equal(s.record.remaining, 6);
  assert.equal(s.record.stacks, 4);
  assert.deepEqual(s.calls, [['publish', 'buff:cuts', [{ value: 12 }]]]);
});

test('an attached empty clock array expires without changing detached scalars', () => {
  const s = setup([7]), clocks = s.record.expiries;
  clocks.length = 0; s.record.stacks = 0;
  s.runtime.advance(s.owner, 0);
  assert.equal(s.owner.buffs.size, 0);
  assert.equal(s.record.expiries, clocks);
  assert.deepEqual(clocks, []);
  assert.equal(s.record.remaining, 7);
  assert.equal(s.record.stacks, 0);
  assert.deepEqual(s.calls, [['remove', 'buff:cuts']]);
});

test('every expiry position through eight stacks preserves survivor order, identity and publication', () => {
  for (let length = 1; length <= 8; length++) for (let mask = 0; mask < 2 ** length; mask++) {
    // Exact binary fractions exercise equality at expiry and two survivor sizes.
    const durations = Array.from({ length }, (_, i) => mask & 1 << i ? .5 : 2 + i % 2 / 2);
    const expected = durations.map(value => value - .5).filter(value => value > 0);
    const s = setup(durations), clocks = s.record.expiries, before = s.record.remaining;
    s.runtime.advance(s.owner, .5);
    assert.equal(s.record.expiries, clocks);
    assert.deepEqual(clocks, expected, 'length ' + length + ', expiry mask ' + mask);
    if (!expected.length) {
      assert.equal(s.owner.buffs.size, 0);
      assert.equal(s.record.remaining, before);
      assert.equal(s.record.stacks, length);
      assert.deepEqual(s.calls, [['remove', 'buff:cuts']]);
    } else {
      assert.equal(s.owner.buffs.get('cuts'), s.record);
      assert.equal(s.record.stacks, expected.length);
      assert.equal(s.record.remaining, mask ? Math.max(...expected) : before - .5);
      assert.deepEqual(s.calls, mask ? [['publish', 'buff:cuts', [{ value: 3 * expected.length }]]] : []);
    }
  }
});
