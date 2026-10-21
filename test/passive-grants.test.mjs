import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { PassiveGrants } from '../dist/passive-grants.js';
import { StatRules, StatSheet } from '../dist/index.js';
const fixture = JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-nine/passive-grants.json.gz', import.meta.url))));
const catalogue = JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-three/catalogue.json.gz', import.meta.url))));
const rules = new StatRules(JSON.parse(fs.readFileSync(new URL('../baseline/stat-catalogue.json',import.meta.url))), catalogue.tables.rules.find(r => r.id === 'statTrades').value);
const content = new PassiveGrants(fixture.pack);

test('every original node and choice grant reproduces attributes, modifier order, conduits, graft sources and sheet reads', () => {
  let reads = 0;
  for (const row of fixture.rows) {
    const { input, expected, label } = row;
    const build = content.begin(input.baseAttributes, new Set(input.allocated), input.choices, label === 'retired-selection' ? 'skip' : 'reject');
    const items = new Map(input.itemSources.map(s => [s.id, build.addItemModifiers(s.mods)]));
    assert.deepEqual(build.attributes(), expected.attributes, label);
    assert.deepEqual(build.attributeModifiers(), expected.attributeModifiers, label);
    assert.deepEqual(build.passiveModifiers, expected.passiveModifiers, label);
    assert.deepEqual(build.conduits, expected.conduits, label);
    assert.deepEqual(build.grafts, expected.graftSources, label);
    const sheet = new StatSheet(rules);
    for (const source of expected.sources) sheet.setSource(source.id, source.id === 'attributes' ? build.attributeModifiers()
      : source.id === 'passives' ? build.passiveModifiers : items.get(source.id) ?? source.mods);
    for (const read of expected.reads) {
      sheet.setConditions(read.conditions); sheet.setGauges(read.gauges);
      for (const [id, value] of Object.entries(read.values)) {
        const actual = sheet.get(id, read.tags.length ? new Set(read.tags) : undefined);
        assert.ok(Math.abs(actual - value) <= 1e-12 * Math.max(1, Math.abs(value)), `${label}: ${id}: ${actual} != ${value}`); reads++;
      }
    }
  }
  assert.equal(fixture.rows.length, 4103); assert.ok(reads > 100000);
});

function sample() {
  return { schemaVersion: 1, capability: 'passive-grants/v1', contentId: 'example',
    attributes: [{ id: 'strength', perPoint: [{ stat: 'life', kind: 'flat', value: 2 }] }], statIds: ['life','damage'], supportIds: ['support'],
    nodes: [
      { id: 'a', name: 'A', attributes: { strength: 1e16 }, mods: [{ stat: 'damage', kind: 'more', value: .2, tags: ['spell'], when: 'ready' }],
        choiceGroup: 'g', graft: { support: 'support' }, conduit: { from: 'mana', to: 'life', ratio: 2 } },
      { id: 'b', attributes: { strength: -1e16 } },
    ], groups: [{ id: 'g', options: [{ id: 'x', name: 'X', description: 'x', attributesPct: { strength: .5 }, graft: { support: 'support', level: 3 } }] }] };
}
test('flat source order and one final percentage/rounding phase remain authoritative', () => {
  const p = new PassiveGrants(sample());
  assert.equal(p.begin({ strength: 1 }, new Set(['a','b']), {}).attributes().strength, 0);
  assert.equal(p.begin({ strength: 1 }, new Set(['b','a']), {}).attributes().strength, 0);
  const input = sample(); input.nodes[0].attributes.strength = 2; input.nodes[1].attributes.strength = 3;
  const b = new PassiveGrants(input).begin({ strength: 4 }, new Set(['a','b']), { a: ['x'] });
  const rest = b.addItemModifiers([{ stat: 'strength', kind: 'flat', value: 1 }, { stat: 'strength', kind: 'increased', value: .25 }, { stat: 'life', kind: 'flat', value: 7 }]);
  assert.deepEqual(rest, [{ stat: 'life', kind: 'flat', value: 7 }]); assert.equal(b.attributes().strength, 18);
  assert.deepEqual(b.attributeModifiers(), [{ stat: 'life', kind: 'flat', value: 36 }]);
  b.addItemModifiers([{ stat: 'strength', kind: 'override', value: 400 }]); assert.equal(b.attributes().strength, 18);
});

test('grant output and accumulators own their state; invalid item rows are atomic', () => {
  const raw = sample(); raw.attributes[0].perPoint[0].tags = ['melee'];
  const p = new PassiveGrants(raw), base = { strength: 2 }, picks = { a: ['x'] };
  const a = p.begin(base, new Set(['a']), picks), b = p.begin(base, new Set(), {});
  base.strength = 40; picks.a.length = 0; raw.nodes[0].mods[0].value = 90;
  assert.equal(a.passiveModifiers[0].value, .2); assert.equal(a.grafts.length, 2); assert.equal(b.attributes().strength, 2);
  const out = a.passiveModifiers; out[0].tags.push('other'); const pumps = a.conduits; pumps[0].ratio = 900;
  assert.deepEqual(a.passiveModifiers[0].tags, ['spell']); assert.equal(a.conduits[0].ratio, 2);
  const grafts = a.grafts; grafts[0].graft.support = 'changed'; assert.equal(a.grafts[0].graft.support, 'support');
  const scaled = b.attributeModifiers(); scaled[0].tags.push('changed'); assert.deepEqual(b.attributeModifiers()[0].tags, ['melee']);
  const before = b.attributes();
  assert.throws(() => b.addItemModifiers([{ stat: 'strength', kind: 'flat', value: 5 }, { stat: 'missing', kind: 'flat', value: 2 }]));
  assert.deepEqual(b.attributes(), before);
  assert.throws(() => { p.pack.nodes[0].mods[0].value = 4; }, TypeError);
});

test('unknown selections require an explicit compatibility choice; malformed content never becomes executable', () => {
  const p = new PassiveGrants(sample());
  assert.throws(() => p.begin({}, new Set(['missing']), {}), /Unknown allocated/);
  assert.throws(() => p.begin({}, new Set(['a']), { a: ['missing'] }), /Unknown chosen/);
  assert.deepEqual(p.begin({ strength: 3 }, new Set(['missing']), {}, 'skip').attributes(), { strength: 3 });
  for (const change of [
    p => p.nodes[0].mods[0].stat = 'typo', p => p.nodes[0].conduit.to = 'typo', p => p.nodes[0].graft.support = 'typo',
    p => p.nodes[0].choiceGroup = 'typo', p => p.nodes[0].attributes.typo = 1, p => p.nodes[0].mods[0].gaugeAt = 1,
    p => p.nodes[0].attributes.strength = Infinity, p => p.nodes[0].conduit.floor = 2, p => p.nodes[0].aura = {},
  ]) { const input = sample(); change(input); assert.throws(() => new PassiveGrants(input)); }
});

test('item snapshots retain own field order, explicit undefined and independent tag arrays', () => {
  const build = new PassiveGrants(sample()).begin({ strength: 2 }, new Set(), {});
  const row = Object.assign(Object.create(null), { tags: ['spell'], value: 7, kind: 'flat', stat: 'life', when: undefined });
  row[Symbol('ignored by serializable snapshot')] = () => { throw new Error('Do not read'); };
  const output = build.addItemModifiers([row, row]);
  assert.deepEqual(Object.keys(output[0]), ['tags', 'value', 'kind', 'stat', 'when']);
  assert.equal(Object.getPrototypeOf(output[0]), Object.prototype);
  assert.equal(Object.getOwnPropertySymbols(output[0]).length, 0);
  assert.notEqual(output[0], output[1]); assert.notEqual(output[0].tags, output[1].tags);
  row.tags.push('source'); output[0].tags.push('output');
  assert.deepEqual(output[1].tags, ['spell']); assert.equal(output[0].value, 7);
  const sparse = Array(2); sparse[1] = 'spell';
  const held = build.addItemModifiers([{ stat: 'life', kind: 'flat', value: 1, tags: sparse }])[0].tags;
  assert.equal(0 in held, false); assert.equal(held[1], 'spell');
});

test('snapshot reads each field and tag once before capturing the build accumulator', () => {
  const build = new PassiveGrants(sample()).begin({ strength: 2 }, new Set(), {});
  let fields = 0, tags = 0;
  const input = { stat: 'strength', kind: 'flat', get value() {
    fields++; build.addItemModifiers([{ stat: 'strength', kind: 'flat', value: 3 }]); return 5;
  }};
  const list = []; Object.defineProperty(list, 0, { enumerable: true, get() { tags++; return 'spell'; }});
  build.addItemModifiers([input, { stat: 'life', kind: 'flat', value: 1, tags: list }]);
  assert.equal(fields, 1); assert.equal(tags, 1); assert.equal(build.attributes().strength, 10);
});

test('nonplain and executable modifier payloads fail atomically without invoking nested values', () => {
  const build = new PassiveGrants(sample()).begin({ strength: 2 }, new Set(), {}), before = build.attributes();
  let executed = 0; const executable = { toString() { executed++; return 'life'; } }, cycle = {}; cycle.self = cycle;
  for (const row of [null, [], new Date(), Object.assign(Object.create({}), { stat: 'life', kind: 'flat', value: 1 }),
    { stat: 'life', kind: 'flat', value: 1, fromStat: executable },
    { stat: 'life', kind: 'flat', value: 1, when: () => 1 },
    { stat: 'life', kind: 'flat', value: 1, gauge: Symbol('bad') },
    { stat: 'life', kind: 'flat', value: 1n },
    { stat: 'life', kind: 'flat', value: Infinity },
    { stat: 'life', kind: 'flat', value: 1, extra: cycle },
    { stat: 'life', kind: 'flat', value: 1, tags: [executable] }]) {
    assert.throws(() => build.addItemModifiers([{ stat: 'strength', kind: 'flat', value: 5 }, row]));
    assert.deepEqual(build.attributes(), before);
  }
  assert.throws(() => build.addItemModifiers(new Set())); assert.equal(executed, 0);
});

test('modifier snapshots define own fields without invoking inherited setters', () => {
  const build = new PassiveGrants(sample()).begin({ strength: 2 }, new Set(), {});
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'when'); let calls = 0, output;
  try {
    Object.defineProperty(Object.prototype, 'when', { configurable: true, set() { calls++; } });
    output = build.addItemModifiers([{ stat: 'life', kind: 'flat', value: 1, when: 'ready' }]);
  } finally {
    if (previous) Object.defineProperty(Object.prototype, 'when', previous); else delete Object.prototype.when;
  }
  assert.equal(calls, 0); assert.equal(output[0].when, 'ready'); assert(Object.hasOwn(output[0], 'when'));
});
