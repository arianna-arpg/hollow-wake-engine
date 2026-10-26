import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StatRules } from '../dist/index.js';
const { compileBuffDefinition } = await import(process.env.HOLLOW_WAKE_BUFF_CONTENT_MODULE ?? '../dist/buff-content.js');
const rules = new StatRules({ life: { base: 100 }, damage: { base: 0 } });
const definition = () => ({ type: 'buff', id: 'mighty', duration: 4, mods: [{ stat: 'life', kind: 'flat', value: 10 }] });

test('serialized stat buffs are deeply owned, frozen and reusable across callers', () => {
  const input = { ...definition(), label: 'Might', maxStacks: 5, stacksOnApply: 3, stackTimers: 'independent',
    consumeOn: { on: 'hit', tags: ['attack'], skills: ['cleave'] }, consumeOnUse: { tags: ['melee'] } };
  input.mods[0].tags = ['attack']; input.mods[0].when = 'moving'; input.mods[0].gauge = 'focus'; input.mods[0].gaugeAt = .5;
  input.mods.push({ stat: 'damage', kind: 'link', value: .1, fromStat: 'life' });
  const first = compileBuffDefinition(input, rules), second = compileBuffDefinition(input, rules), before = structuredClone(first);
  assert.deepEqual(first, input); assert.deepEqual(second, first); assert.notEqual(first, second); assert.notEqual(first.mods, second.mods);
  for (const owned of [first, first.mods, ...first.mods, first.mods[0].tags, first.consumeOn, first.consumeOn.tags, first.consumeOn.skills, first.consumeOnUse, first.consumeOnUse.tags]) assert(Object.isFrozen(owned));
  for (const source of [input, input.mods, input.mods[0], input.mods[0].tags, input.consumeOn, input.consumeOn.tags]) assert(!Object.isFrozen(source));
  input.duration = 20; input.mods[0].value = 40; input.mods[0].tags.push('spell'); input.consumeOn.skills.push('other');
  assert.deepEqual(first, before); assert.throws(() => { first.mods[0].value = 20; }, TypeError);
  assert.throws(() => { first.consumeOn.tags.push('spell'); }, TypeError);
});

test('zero duration, negative modifiers, empty gates and unspecified caps retain their meaning', () => {
  const input = { ...definition(), duration: 0, stacksOnApply: 3, consumeOn: { on: 'use', tags: [], skills: [] } };
  input.mods[0].value = -10; const value = compileBuffDefinition(input, rules);
  assert.deepEqual(value, input); assert(!Object.hasOwn(value, 'maxStacks'));
  for (const kind of ['flat', 'increased', 'more', 'override', 'link']) {
    const mod = { stat: 'life', kind, value: .5, ...(kind === 'link' ? { fromStat: 'damage' } : {}) };
    assert.deepEqual(compileBuffDefinition({ ...definition(), mods: [mod] }, rules).mods, [mod]);
  }
});

test('all consumption events compile without imposing a game-specific tag catalogue', () => {
  for (const on of ['use', 'hit', 'crit', 'kill', 'hurt', 'block', 'evade']) {
    const input = { ...definition(), consumeOn: { on, tags: ['custom:tool'], skills: ['custom:skill'] } };
    assert.deepEqual(compileBuffDefinition(input, rules), input);
  }
  const plain = Object.assign(Object.create(null), definition()); assert.deepEqual(compileBuffDefinition(plain, rules), definition());
  const allUses = { ...definition(), consumeOnUse: {} }; assert.deepEqual(compileBuffDefinition(allUses, rules), allUses);
});

const invalid = [
  ['missing type', d => { delete d.type; }], ['wrong type', d => { d.type = 'status'; }],
  ['empty id', d => { d.id = ''; }], ['long id', d => { d.id = 'x'.repeat(257); }],
  ['string duration', d => { d.duration = '4'; }], ['negative duration', d => { d.duration = -1; }],
  ['infinite duration', d => { d.duration = Infinity; }], ['NaN duration', d => { d.duration = NaN; }],
  ['zero cap', d => { d.maxStacks = 0; }], ['fractional cap', d => { d.maxStacks = 1.5; }], ['oversized cap', d => { d.maxStacks = 65537; }],
  ['zero grant', d => { d.stacksOnApply = 0; }], ['negative grant', d => { d.stacksOnApply = -1; }],
  ['unknown clocks', d => { d.stackTimers = 'elapsed'; }], ['missing mods', d => { delete d.mods; }],
  ['unknown stat', d => { d.mods[0].stat = 'missing'; }], ['prototype stat', d => { d.mods[0].stat = 'toString'; }],
  ['unknown kind', d => { d.mods[0].kind = 'multiply'; }], ['nonfinite modifier', d => { d.mods[0].value = NaN; }],
  ['missing link source', d => { d.mods[0].kind = 'link'; }], ['unknown link source', d => { d.mods[0].fromStat = 'missing'; }],
  ['threshold without gauge', d => { d.mods[0].gaugeAt = .5; }], ['empty condition', d => { d.mods[0].when = ''; }],
  ['unknown modifier field', d => { d.mods[0].evil = true; }], ['unknown event', d => { d.consumeOn = { on: 'cast' }; }],
  ['nonstring tag', d => { d.consumeOn = { on: 'use', tags: [1] }; }], ['invalid use tags', d => { d.consumeOnUse = { tags: null }; }],
  ['unknown gate field', d => { d.consumeOn = { on: 'use', count: 2 }; }], ['unknown use field', d => { d.consumeOnUse = { tags: [], skills: [] }; }],
  ['oversized tags', d => { d.mods[0].tags = Array(257).fill('attack'); }], ['oversized modifiers', d => { d.mods = Array(4097).fill(d.mods[0]); }],
  ['oversized label', d => { d.label = 'x'.repeat(1025); }], ['unsupported next-hit payload', d => { d.nextHit = { damage: 10 }; }],
  ['unsupported spatial resolution', d => { d.radius = 3; }], ['unsupported presentation', d => { d.storedCue = false; }],
  ['custom prototype', d => { Object.setPrototypeOf(d, { duration: 4 }); }], ['symbol metadata', d => { d[Symbol('hidden')] = true; }],
  ['sparse modifiers', d => { d.mods = new Array(1); }], ['extra array field', d => { d.mods.extra = true; }],
  ['array symbol metadata', d => { d.mods[Symbol('hidden')] = true; }], ['array prototype', d => { Object.setPrototypeOf(d.mods, null); }],
  ['cyclic modifier', d => { d.mods = [d]; }], ['cyclic tags', d => { const tags = []; tags.push(tags); d.mods[0].tags = tags; }],
];
test('malformed and unsupported serialized definitions are rejected before they become runtime content', () => {
  for (const [name, change] of invalid) { const input = definition(); change(input); assert.throws(() => compileBuffDefinition(input, rules), undefined, name); }
  for (const input of [undefined, null, 4, 'buff', [], new Map()]) assert.throws(() => compileBuffDefinition(input, rules));
});

test('record and array accessors are rejected without executing supplied getters', () => {
  for (const location of ['definition', 'modifier', 'gate', 'array']) {
    const input = definition(); let reads = 0;
    const descriptor = { enumerable: true, configurable: true, get() { reads++; throw Error('getter executed'); } };
    if (location === 'definition') Object.defineProperty(input, 'duration', descriptor);
    if (location === 'modifier') Object.defineProperty(input.mods[0], 'kind', descriptor);
    if (location === 'gate') { input.consumeOn = {}; Object.defineProperty(input.consumeOn, 'on', descriptor); }
    if (location === 'array') Object.defineProperty(input.mods, '0', descriptor);
    assert.throws(() => compileBuffDefinition(input, rules), /data/); assert.equal(reads, 0);
  }
  const input = definition(); Object.defineProperty(input, 'duration', { value: 4, enumerable: false });
  assert.throws(() => compileBuffDefinition(input, rules), /data/);
});
