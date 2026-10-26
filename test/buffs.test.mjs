import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StatRules, StatSheet } from '../dist/index.js';
const { BuffRuntime, BUFF_LIMITS } = await import(process.env.HOLLOW_WAKE_BUFF_MODULE ?? '../dist/buffs.js');
const rules = new StatRules({ life: { base: 100 } });
const def = (extra = {}) => ({ type: 'buff', id: 'one', duration: 4, mods: [{ stat: 'life', kind: 'flat', value: 10 }], ...extra });
const independent = (extra = {}) => def({ stackTimers: 'independent', maxStacks: 8, ...extra });
function setup(hooks = {}) {
  const owner = { buffs: new Map(), gainEvents: [], sheet: new StatSheet(rules) }, calls = [];
  const runtime = new BuffRuntime({
    publish(a, id, mods) { calls.push(['publish', id]); hooks.beforePublish?.(a, id, mods); a.sheet.setSource(id, mods); hooks.afterPublish?.(a, id, mods); },
    removeSource(a, id) { calls.push(['remove', id]); hooks.beforeRemove?.(a, id); a.sheet.removeSource(id); hooks.afterRemove?.(a, id); },
    release(a, definition, id, count) { calls.push(['release', id, count]); hooks.release?.(a, definition, id, count); },
    ...(hooks.direct ? {} : { consume(a, id, count) { runtime.consume(a, id, count); hooks.afterConsume?.(a, id, count); } }),
  });
  return { owner, runtime, calls, hooks };
}

test('mixed-duration independent consumption removes oldest applications, not soonest expirations', () => {
  const { owner, runtime } = setup();
  for (const duration of [9, 2, 7, 4]) runtime.grant(owner, independent({ duration }));
  const record = owner.buffs.get('one'), clocks = record.expiries;
  runtime.consume(owner, 'one', 2);
  assert.equal(record.expiries, clocks); assert.deepEqual(clocks, [7, 4]);
  assert.equal(record.stacks, 2); assert.equal(record.remaining, 7); assert.equal(owner.sheet.get('life'), 120);
  runtime.advance(owner, 4);
  assert.equal(owner.buffs.get('one'), record); assert.equal(record.expiries, clocks);
  assert.deepEqual(clocks, [3]); assert.equal(record.stacks, 1); assert.equal(record.remaining, 3);
  assert.equal(owner.sheet.get('life'), 110);
});

test('spending the longest application recomputes the remaining duration', () => {
  const { owner, runtime } = setup();
  runtime.grant(owner, independent({ duration: 12 })); runtime.grant(owner, independent({ duration: 3 }));
  runtime.consume(owner, 'one'); assert.deepEqual(owner.buffs.get('one').expiries, [3]); assert.equal(owner.buffs.get('one').remaining, 3);
});

test('zero, complete and excessive consumption preserve identity and detached scalar semantics', () => {
  for (const count of [0, 3, 7]) {
    const { owner, runtime, calls } = setup(); runtime.grant(owner, independent({ stacksOnApply: 3 }));
    const record = owner.buffs.get('one'), clocks = record.expiries;
    runtime.consume(owner, 'one', count);
    assert.equal(record.expiries, clocks); assert.equal(record.stacks, 3 - count);
    assert.deepEqual(clocks, count ? [] : [4, 4, 4]); assert.equal(record.remaining, 4);
    assert.equal(owner.buffs.has('one'), count === 0); assert.equal(owner.sheet.get('life'), count ? 100 : 130);
    assert.deepEqual(calls[1], ['release', 'one', Math.min(count, 3)]);
    runtime.advance(owner, 1); assert.equal(owner.buffs.has('one'), count === 0);
  }
});

test('independent nested consumption shares the captured record and never restores clocks', () => {
  const s = setup(); let nested = false;
  s.hooks.release = () => { if (!nested) { nested = true; s.runtime.consume(s.owner, 'one'); } };
  s.runtime.grant(s.owner, independent({ stacksOnApply: 3 })); s.runtime.consume(s.owner, 'one');
  assert.equal(s.owner.buffs.get('one').stacks, 1); assert.deepEqual(s.owner.buffs.get('one').expiries, [4]);
  s.runtime.advance(s.owner, 1); assert.equal(s.owner.buffs.get('one').stacks, 1); assert.equal(s.owner.sheet.get('life'), 110);
});

test('cue replacement leaves old clocks detached and publishes the replacement', () => {
  const s = setup(); s.runtime.grant(s.owner, independent({ stacksOnApply: 3 })); const old = s.owner.buffs.get('one');
  s.hooks.release = () => { s.runtime.remove(s.owner, 'one'); s.runtime.grant(s.owner, independent({ duration: 9, stacksOnApply: 4, mods: [{ stat: 'life', kind: 'flat', value: 20 }] })); };
  s.runtime.consume(s.owner, 'one');
  assert.equal(old.stacks, 2); assert.deepEqual(old.expiries, [4, 4]);
  assert.notEqual(s.owner.buffs.get('one'), old); assert.deepEqual(s.owner.buffs.get('one').expiries, [9, 9, 9, 9]);
  assert.equal(s.owner.sheet.get('life'), 180);
});

test('an exhausted captured record still deletes a cue-time replacement by id', () => {
  const s = setup(); s.runtime.grant(s.owner, independent()); const old = s.owner.buffs.get('one');
  s.hooks.release = () => { s.runtime.remove(s.owner, 'one'); s.runtime.grant(s.owner, independent({ stacksOnApply: 4 })); };
  s.runtime.consume(s.owner, 'one'); assert.equal(old.stacks, 0); assert.deepEqual(old.expiries, []);
  assert.equal(s.owner.buffs.size, 0); assert.equal(s.owner.sheet.get('life'), 100);
});

for (const phase of ['beforePublish', 'afterPublish']) test('publication failure retains earlier commits: ' + phase, () => {
  const s = setup(); s.hooks[phase] = () => { throw Error(phase); };
  assert.throws(() => s.runtime.grant(s.owner, def()), new RegExp(phase)); assert.equal(s.owner.gainEvents.length, 1);
  assert.equal(s.owner.buffs.size, 1); assert.equal(s.owner.sheet.get('life'), phase === 'beforePublish' ? 100 : 110);
  delete s.hooks[phase]; s.runtime.synchronize(s.owner, 'one'); assert.equal(s.owner.sheet.get('life'), 110);
});

test('failed source removal requires explicit synchronization; guards recover', () => {
  const s = setup(); s.runtime.grant(s.owner, def());
  s.hooks.beforeRemove = () => { throw Error('sink'); };
  assert.throws(() => s.runtime.remove(s.owner, 'one'), /sink/); assert.equal(s.owner.buffs.size, 0); assert.equal(s.owner.sheet.get('life'), 110);
  delete s.hooks.beforeRemove; s.runtime.remove(s.owner, 'one'); assert.equal(s.owner.sheet.get('life'), 110);
  s.runtime.synchronize(s.owner, 'one'); assert.equal(s.owner.sheet.get('life'), 100);
  s.runtime.grant(s.owner, def()); s.runtime.advance(s.owner, 4); assert.equal(s.owner.sheet.get('life'), 100);
});

for (const after of [false, true]) test('gain callback failure preserves its own partial queue commit: ' + after, () => {
  const s = setup(), push = s.owner.gainEvents.push;
  s.owner.gainEvents.push = function (event) { if (after) push.call(this, event); throw Error('queue'); };
  assert.throws(() => s.runtime.grant(s.owner, def()), /queue/); assert.equal(s.owner.buffs.size, 0);
  assert.equal(s.owner.gainEvents.length, after ? 1 : 0); assert.equal(s.owner.sheet.get('life'), 100);
  s.owner.gainEvents.push = push; s.runtime.grant(s.owner, def()); assert.equal(s.owner.sheet.get('life'), 110);
});

test('queue callbacks precede definition sampling and map lookup', () => {
  const s = setup(), definition = def(), tags = ['attack'], push = s.owner.gainEvents.push;
  s.owner.gainEvents.push = function (event) {
    push.call(this, event); definition.duration = 9; definition.stacksOnApply = 2; definition.maxStacks = 5;
    s.owner.buffs.set('one', { def: definition, stacks: 1, remaining: 2 });
    assert.equal(event.buff, definition); assert.equal(event.tags, tags);
    return this.length;
  };
  s.runtime.grant(s.owner, definition, 2, 3, tags);
  assert.equal(s.owner.buffs.get('one').stacks, 3); assert.equal(s.owner.buffs.get('one').remaining, 18);
  assert.equal(s.owner.gainEvents[0].depth, 3); assert.equal(s.owner.sheet.get('life'), 130);
});

test('a failing release callback does not spend stacks or clocks', () => {
  const s = setup(); s.runtime.grant(s.owner, independent({ stacksOnApply: 3 })); const record = s.owner.buffs.get('one');
  s.hooks.release = () => { throw Error('release'); };
  assert.throws(() => s.runtime.consume(s.owner, 'one'), /release/);
  assert.equal(record.stacks, 3); assert.deepEqual(record.expiries, [4, 4, 4]); assert.equal(s.owner.sheet.get('life'), 130);
  delete s.hooks.release; s.runtime.consume(s.owner, 'one'); assert.equal(record.stacks, 2);
});

test('live expiry visits insertions, skips deletions and forbids same-owner re-entry even when empty', () => {
  const s = setup(); s.runtime.grant(s.owner, def({ duration: 1 }));
  s.hooks.afterRemove = () => {
    assert.throws(() => s.runtime.advance(s.owner, 1), /already active/);
    s.runtime.grant(s.owner, def({ id: 'late', duration: 4 }));
  };
  s.runtime.advance(s.owner, 1); assert.equal(s.owner.buffs.get('late').remaining, 3);
  delete s.hooks.afterRemove; s.runtime.advance(s.owner, 3); assert.equal(s.owner.buffs.size, 0);
  s.runtime.grant(s.owner, def({ duration: 1 })); s.runtime.grant(s.owner, def({ id: 'two', duration: 1 }));
  s.hooks.afterRemove = (_owner, id) => { if (id === 'buff:one') s.runtime.remove(s.owner, 'two'); };
  s.runtime.advance(s.owner, 1); assert.equal(s.owner.buffs.size, 0);
  assert.equal(s.calls.filter(c => c[0] === 'remove' && c[1] === 'buff:two').length, 1);
});

test('failed expiry resets its guard and preserves already removed records', () => {
  const s = setup(); s.runtime.grant(s.owner, def({ duration: 1 })); s.runtime.grant(s.owner, def({ id: 'two', duration: 3 }));
  s.hooks.beforeRemove = () => { throw Error('expiry'); };
  assert.throws(() => s.runtime.advance(s.owner, 1), /expiry/); assert(!s.owner.buffs.has('one')); assert.equal(s.owner.buffs.get('two').remaining, 3);
  delete s.hooks.beforeRemove; s.runtime.synchronize(s.owner, 'one'); assert.doesNotThrow(() => s.runtime.advance(s.owner, 1));
  assert.equal(s.owner.buffs.get('two').remaining, 2);
});

test('one runtime isolates actors and permits another actor to advance in a callback', () => {
  const s = setup(), other = setup().owner;
  s.runtime.grant(s.owner, def({ duration: 1 })); s.runtime.grant(other, def({ duration: 4 }));
  s.hooks.afterRemove = owner => { if (owner === s.owner) s.runtime.advance(other, 1); };
  s.runtime.advance(s.owner, 1); assert.equal(s.owner.buffs.size, 0); assert.equal(other.buffs.get('one').remaining, 3);
  assert.equal(s.owner.sheet.get('life'), 100); assert.equal(other.sheet.get('life'), 110);
});

test('event snapshots defer newly inserted buffs and observe changed unvisited definitions', () => {
  const s = setup(); s.runtime.grant(s.owner, def({ consumeOn: { on: 'hit' } }));
  s.runtime.grant(s.owner, def({ id: 'two', consumeOn: { on: 'hit' } }));
  s.hooks.afterConsume = (_owner, id) => { if (id === 'one') {
    s.runtime.grant(s.owner, def({ id: 'two', consumeOn: { on: 'kill' } }));
    s.runtime.grant(s.owner, def({ id: 'late', consumeOn: { on: 'hit' } }));
  } };
  s.runtime.spend(s.owner, 'hit'); assert.deepEqual([...s.owner.buffs.keys()], ['two', 'late']);
  s.runtime.spend(s.owner, 'hit'); assert.deepEqual([...s.owner.buffs.keys()], ['two']);
});

test('every consumption event, empty gates and legacy precedence use the direct standalone path', () => {
  for (const on of ['use', 'hit', 'crit', 'kill', 'hurt', 'block', 'evade']) {
    const s = setup({ direct: true });
    s.runtime.grant(s.owner, def({ consumeOn: { on, tags: ['attack', 'melee'], skills: ['cleave'] }, consumeOnUse: { tags: ['spell'] } }));
    s.runtime.spend(s.owner, on, ['spell'], 'cleave'); assert.equal(s.owner.buffs.size, 1);
    s.runtime.spend(s.owner, on, ['melee']); assert.equal(s.owner.buffs.size, 1);
    s.runtime.spend(s.owner, on, ['melee'], 'cleave'); assert.equal(s.owner.buffs.size, 0);
  }
  for (const consumeOn of [{ on: 'use', tags: [] }, { on: 'use', skills: [] }]) {
    const s = setup({ direct: true }); s.runtime.grant(s.owner, def({ consumeOn })); s.runtime.spend(s.owner, 'use', ['melee'], 'cleave'); assert.equal(s.owner.buffs.size, 1);
  }
  const s = setup({ direct: true }); s.runtime.grant(s.owner, def({ consumeOnUse: { tags: ['melee'] } }));
  s.runtime.spend(s.owner, 'hit', ['melee']); assert.equal(s.owner.buffs.size, 1);
  s.runtime.spend(s.owner, 'use', ['melee']); assert.equal(s.owner.buffs.size, 0);
  s.runtime.grant(s.owner, def({ consumeOnUse: {} })); s.runtime.spend(s.owner, 'use'); assert.equal(s.owner.buffs.size, 0);
});

test('independent zero clocks retain native signed-zero maximum semantics', () => {
  const s = setup(); s.runtime.grant(s.owner, independent({ duration: -0 }));
  s.runtime.grant(s.owner, independent({ duration: 0 })); assert(Object.is(s.owner.buffs.get('one').remaining, 0));
  s.runtime.advance(s.owner, 0); assert.equal(s.owner.buffs.size, 0);
});

test('published modifier arrays and objects are detached from definitions and later publications', () => {
  const held = [], s = setup({ afterPublish(_owner, _id, mods) { held.push(mods); } }), definition = def({ maxStacks: 3 });
  s.runtime.grant(s.owner, definition); s.runtime.grant(s.owner, definition);
  assert.notEqual(held[0], held[1]); assert.notEqual(held[0][0], definition.mods[0]); assert.equal(held[0][0].value, 10);
  definition.mods[0].value = 30; assert.equal(s.owner.sheet.get('life'), 120); assert.equal(held[1][0].value, 20);
  s.runtime.synchronize(s.owner, 'one'); assert.equal(s.owner.sheet.get('life'), 160);
});

test('stable compaction preserves nonadjacent survivors and detached native expiration scalars', () => {
  const s = setup(); for (const duration of [1, 4, 2, 5, 1, 7]) s.runtime.grant(s.owner, independent({ duration }));
  const record = s.owner.buffs.get('one'), clocks = record.expiries;
  s.runtime.advance(s.owner, 2); assert.equal(record.expiries, clocks); assert.deepEqual(clocks, [2, 3, 5]); assert.equal(record.stacks, 3);
  s.runtime.advance(s.owner, 5); assert.equal(s.owner.buffs.size, 0); assert.deepEqual(clocks, []);
  assert.equal(record.stacks, 3); assert.equal(record.remaining, 5);
});

test('a timer-only operation never recreates applications across deterministic mixed operations', () => {
  const s = setup(); let applications = [], sequence = 0, random = 87;
  const next = () => (random = Math.imul(random, 1664525) + 1013904223 >>> 0);
  for (let step = 0; step < 800; step++) {
    const op = next() % 3;
    if (op === 0) {
      const duration = 1 + next() % 9, amount = 1 + next() % 3;
      s.runtime.grant(s.owner, independent({ duration, stacksOnApply: amount }));
      for (let i = 0; i < amount && applications.length < 8; i++) applications.push({ id: sequence++, duration });
    } else if (op === 1) {
      const count = next() % 5; s.runtime.consume(s.owner, 'one', count); applications = applications.slice(count);
    } else {
      const delta = (next() % 4) / 2, before = new Set(applications.map(a => a.id));
      s.runtime.advance(s.owner, delta); applications = applications.map(a => ({ ...a, duration: a.duration - delta })).filter(a => a.duration > 0);
      assert(applications.every(a => before.has(a.id)));
    }
    const record = s.owner.buffs.get('one'); assert.equal(record?.stacks ?? 0, applications.length, 'step ' + step);
    assert.deepEqual(record?.expiries ?? [], applications.map(a => a.duration));
    assert.equal(s.owner.sheet.get('life'), 100 + 10 * applications.length);
  }
});

test('bounded callback recursion fails predictably and recovers without a stack overflow', () => {
  const s = setup(); let callbacks = 0;
  s.hooks.afterPublish = () => { callbacks++; s.runtime.grant(s.owner, def()); };
  assert.throws(() => s.runtime.grant(s.owner, def()), /nesting limit/);
  assert.equal(callbacks, BUFF_LIMITS.nesting); assert.equal(s.owner.gainEvents.length, BUFF_LIMITS.gainEvents);
  delete s.hooks.afterPublish; s.runtime.remove(s.owner, 'one'); assert.equal(s.owner.sheet.get('life'), 100);
});

test('live iterator work is bounded even when every expiry appends another expired buff', () => {
  const s = setup(); let removed = 0;
  s.runtime.grant(s.owner, def({ duration: 0 }));
  s.hooks.afterRemove = () => { removed++; s.runtime.grant(s.owner, def({ duration: 0 })); };
  assert.throws(() => s.runtime.advance(s.owner, 0), /visit limit/); assert.equal(removed, BUFF_LIMITS.visits);
  assert.equal(s.owner.buffs.size, 1); delete s.hooks.afterRemove; s.runtime.advance(s.owner, 0); assert.equal(s.owner.buffs.size, 0);
});

test('scalar and collection limits reject invalid operations with documented partial commits', () => {
  const s = setup(); s.runtime.grant(s.owner, def());
  for (const delta of [-1, Infinity, NaN]) assert.throws(() => s.runtime.advance(s.owner, delta), /finite and nonnegative/);
  for (const count of [-1, .5, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => s.runtime.consume(s.owner, 'one', count));
  assert.equal(s.owner.buffs.get('one').remaining, 4); assert.equal(s.owner.buffs.get('one').stacks, 1);
  for (const extra of [{ duration: Infinity }, { stacksOnApply: 0 }, { maxStacks: BUFF_LIMITS.clocks + 1 }, { mods: Array(BUFF_LIMITS.modifiers + 1).fill({ value: 1 }) }]) {
    const before = s.owner.gainEvents.length; assert.throws(() => s.runtime.grant(s.owner, def(extra)));
    assert.equal(s.owner.gainEvents.length, before + 1); assert.equal(s.owner.buffs.get('one').remaining, 4);
  }
  const record = s.owner.buffs.get('one'); record.expiries = Array(BUFF_LIMITS.clocks + 1).fill(4);
  assert.throws(() => s.runtime.advance(s.owner, 1), /clock limit/); assert.equal(record.expiries[0], 4);
});

test('port tables are validated and their supplied callbacks are fixed at construction', () => {
  for (const key of ['publish', 'removeSource', 'release']) {
    const ports = { publish() {}, removeSource() {}, release() {} }; delete ports[key]; assert.throws(() => new BuffRuntime(ports), /Missing buff port/);
  }
  assert.throws(() => new BuffRuntime({ publish() {}, removeSource() {}, release() {}, consume: 3 }), /consume port/);
  const ports = { publish() {}, removeSource() {}, release() {} }, runtime = new BuffRuntime(ports), owner = setup().owner;
  ports.publish = () => { throw Error('changed'); }; runtime.grant(owner, def()); assert.equal(owner.buffs.size, 1);
});
