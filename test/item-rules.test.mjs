import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { Inventory, Engine } from '../dist/index.js';
import { ItemContent, ItemRules } from '../dist/item-rules.js';
import { itemPack } from '../scripts/compile-item-content.mjs';
import { equivalent } from './helpers.mjs';
const fixture = JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-four/items.json.gz', import.meta.url))));
const content = new ItemContent(itemPack());
const json = value => JSON.parse(JSON.stringify(value));
const mint = JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-four/mint-options.json.gz', import.meta.url))));

test('custom choice identities and overflowing weights cannot corrupt state', () => {
  const pack = itemPack(), unique = Object.values(pack.uniques).find(u => u.choices?.length);
  const group = unique.choices[0];
  group.id = '__proto__';
  assert.throws(() => new ItemContent(pack), /choice group/);
  group.id = 'overflow_test';
  group.options = [0,1].map(n => ({...group.options[0],id:`option_${n}`,weight:Number.MAX_VALUE}));
  const rules = new ItemRules(pack, 501), before = rules.snapshot();
  assert.throws(() => rules.forge({uniqueId:unique.id,ilvl:21}), /weight overflow/);
  assert.deepEqual(rules.snapshot(), before);
});
test('generated-item equipment changes match original World character, preview and costs', () => {
  const path = JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-four/item-equipment.json.gz', import.meta.url))));
  const pack = JSON.parse(fs.readFileSync(new URL('../content/milestone-one.json', import.meta.url)));
  const engine = new Engine(pack), rules = new ItemRules(content);
  let hero = engine.character({classId:'magician',passivePoints:1});
  const skill = engine.skill({id:'ruin',level:5,sockets:0,treePoints:0});
  for (const row of path.rows) {
    const c = row.command;
    if (c.type === 'equip') hero.equipInstance({id:`owner:${c.item.uid}`,name:c.item.name,category:'ring',slots:['ring1','ring2'],mods:rules.compile(c.item)},c.slot);
    if (c.type === 'unequip') hero.unequip(c.slot);
    const costs = engine.costs(hero,skill);
    equivalent({attributes:{...hero.attributes},stats:Object.fromEntries(path.stats.map(id=>[id,hero.sheet.get(id)])),
      preview:engine.preview(hero,skill),cost:{mana:costs.mana,life:costs.life},cooldown:costs.cooldown},row.expected);
    hero = engine.character(json(hero.snapshot()));
  }
});

test('wild drops, ceilings, forced families, quality, forge and unsatisfiable requests match source', () => {
  for (const row of mint.rows) {
    const rules = new ItemRules(content, row.seed, row.initialUid);
    assert.deepEqual(json(rules[row.kind](row.options)), row.expected, JSON.stringify(row.options));
    assert.equal(rules.snapshot().random.draws, row.draws);
    assert.equal(rules.snapshot().nextUid, row.nextUid);
  }
});
test('one long original stream crosses cache levels/rarities/bases with unchanged results and replay', () => {
  const stream = JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-four/item-stream.json.gz', import.meta.url))));
  let live = new ItemRules(content, stream.seed, stream.initialUid), resumed = ItemRules.restore(content, live.snapshot());
  for (const [i, row] of stream.rows.entries()) {
    assert.deepEqual(json(live[row.kind](row.options)), row.expected, `live ${i}`);
    assert.deepEqual(json(resumed[row.kind](row.options)), row.expected, `resumed ${i}`);
    assert.equal(live.snapshot().random.draws, row.draws); assert.equal(live.snapshot().nextUid, row.nextUid);
    if (i % 37 === 0) resumed = ItemRules.restore(content, json(live.snapshot()));
  }
});

test('all captured item modifiers, local folds and unique migrations match the original', () => {
  const rules = new ItemRules(content, 867);
  const state = rules.snapshot();
  for (const row of fixture.rows) {
    assert.deepEqual(json(rules.compile(row.item)), row.expected.mods, row.label);
    assert.deepEqual(json(rules.ownStats(row.item)), row.expected.own, row.label);
    assert.deepEqual(json(rules.resolveChoices(row.item)), row.expected.choices, row.label);
  }
  assert.deepEqual(rules.snapshot(), state, 'Value reads and legacy choice migrations do not touch mint RNG or uid allocation');
  assert.equal(fixture.rows.length, 26404);
});
test('all reference drops retain complete item data and exact random consumption', () => {
  let count = 0;
  for (const row of fixture.rows) if (row.roll) {
    const rules = new ItemRules(content, row.roll.seed, row.item.uid);
    assert.deepEqual(json(rules.roll(row.roll.options)), row.item, row.label);
    assert.equal(rules.snapshot().random.draws, row.roll.draws, row.label);
    assert.equal(rules.snapshot().nextUid, row.item.uid + 1);
    count++;
  }
  assert.equal(count, 1658);
});
test('mint continuation, independent owners, transfer/save and re-derived values agree', () => {
  const a = new ItemRules(content, 54), b = new ItemRules(content, 54);
  const options = { baseId: 'ring_lapis', ilvl: 21, rarity: 'rare' };
  assert.deepEqual(a.roll(options), b.roll(options));
  const resumed = ItemRules.restore(content, json(a.snapshot()));
  for (let n = 0; n < 20; n++) assert.deepEqual(a.roll(options), resumed.roll(options));
  const item = a.roll(options), before = a.compile(item);
  const bag = new Inventory({ w: 2, h: 2 }), stash = new Inventory({ w: 2, h: 2 });
  bag.insert({ id: `session-a:${item.uid}`, w: 1, h: 1, data: item });
  assert.equal(bag.transferTo(stash, `session-a:${item.uid}`), true);
  const restored = Inventory.restore(json(stash.snapshot()));
  assert.deepEqual(a.compile(restored.get(`session-a:${item.uid}`).data), before);
  a.bumpUidFloor(100000); assert.equal(a.roll(options).uid, 100001);
  assert.notEqual(a.snapshot().nextUid, b.snapshot().nextUid);
});
test('invalid commands and snapshots cannot consume randomness or identity', () => {
  const r = new ItemRules(content, 77), before = r.snapshot();
  for (const options of [{ ilvl: NaN }, { ilvl: Infinity }, { ilvl: 1, rng() { return 0; } },
    { ilvl: 1, rarity: 'impossible' }, { ilvl: 1, rarityWeights: { rare: -1 } }, { ilvl: 1, affixQuality: { bestTierCount: Infinity, rollFloor: .5 } }]) {
    assert.throws(() => r.roll(options)); assert.deepEqual(r.snapshot(), before);
  }
  for (const edit of [s => s.version++, s => s.contentId = 'other', s => s.nextUid = 0, s => s.random.state = -1]) {
    const s = json(before); edit(s); assert.throws(() => ItemRules.restore(content, s));
  }
  const full = new ItemRules(content, 77, Number.MAX_SAFE_INTEGER), exhausted = full.snapshot();
  assert.throws(() => full.roll({ ilvl: 1 })); assert.deepEqual(full.snapshot(), exhausted);
  assert.equal(r.roll({ ilvl: 1, baseId: '__proto__' }), null);
});
test('content and returned modifiers do not alias; unknown saved definitions fail explicitly', () => {
  const r = new ItemRules(content, 1), row = fixture.rows.find(r => r.expected.mods.some(m => m.tags));
  const mods = r.compile(row.item); const tagged = mods.find(m => m.tags); tagged.tags.push('external');
  assert.deepEqual(json(r.compile(row.item)), row.expected.mods);
  assert.throws(() => content.pack.config.tierBreaks.push(100));
  for (const edit of [i => i.baseId = 'missing', i => i.affixes = [{ id: 'missing', tier: 0, rolls: [] }],
    i => i.uniqueId = 'missing', i => i.sockets = ['missing'], i => i.baseRoll = NaN]) {
    const item = json(row.item); edit(item); assert.throws(() => r.compile(item));
  }
});
test('generated item values equip, survive a build save and affect actual spell damage', () => {
  const pack = JSON.parse(fs.readFileSync(new URL('../content/milestone-one.json', import.meta.url)));
  const engine = new Engine(pack, 761), hero = engine.character({ classId: 'magician', passivePoints: 1 });
  const rules = new ItemRules(content, 12), item = rules.forge({ baseId: 'ring_lapis', ilvl: 21, quality: 1, rarity: 'rare', affixes: [{ id: 'attr_intelligence' }] });
  const definition = { id: `owner:${item.uid}`, name: item.name, category: 'ring', slots: ['ring1','ring2'], mods: rules.compile(item) };
  const before = hero.snapshot(), intelligence = hero.attributes.intelligence;
  hero.equipInstance(definition, 'ring1');
  assert.ok(hero.attributes.intelligence > intelligence);
  const saved = hero.snapshot(), restored = engine.character(json(saved));
  assert.deepEqual(restored.attributes, hero.attributes);
  assert.throws(() => hero.equipInstance(definition, 'ring2'));
  assert.deepEqual(hero.snapshot(), saved);
  assert.throws(() => hero.equipInstance({ ...definition, mods: [{ stat: 'unsupportedProc', kind: 'flat', value: 1 }] }, 'ring1'));
  assert.deepEqual(hero.snapshot(), saved);
  const skill = engine.skill({ id: 'ruin', level: 5, sockets: 0, treePoints: 0 });
  const baselineEngine = new Engine(pack, 761), baselineHero = baselineEngine.character(before);
  const baselineSkill = baselineEngine.skill({ id: 'ruin', level: 5, sockets: 0, treePoints: 0 });
  const baselineHit = baselineEngine.resolveHit(baselineHero, baselineSkill, baselineEngine.target({ life: 1000 }));
  const equippedHit = engine.resolveHit(hero, skill, engine.target({ life: 1000 }));
  assert.ok(equippedHit.damage > baselineHit.damage);
  hero.unequip('ring1'); assert.deepEqual(hero.snapshot(), { ...before, equipped: {} });
});
test('custom zero-sided affix caps cannot be bypassed by magic or guaranteed families', () => {
  const pack = itemPack(); pack.bases.ring_lapis.affixCap = { prefix:0, suffix:1 }; pack.config.magic.bothChance = 1;
  const rules = new ItemRules(pack,19), family = pack.affixes.attr_intelligence.family;
  for (const rarity of ['magic','rare']) for (let n=0;n<20;n++) {
    const item = rules.roll({baseId:'ring_lapis',ilvl:21,rarity,withFamily:family});
    assert.ok(item.affixes.length<=1); assert.ok(item.affixes.every(a=>pack.affixes[a.id].kind==='suffix'));
  }
  pack.bases.ring_lapis.affixCap.suffix=0;
  assert.equal(new ItemRules(pack,19).roll({baseId:'ring_lapis',ilvl:21,rarity:'magic',withFamily:family}).affixes.length,0);
});
