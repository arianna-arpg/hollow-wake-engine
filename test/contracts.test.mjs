import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Content, Engine, Random, StatRules, StatSheet, Target } from '../dist/index.js';
import { setup, pack, fixture, equivalent } from './helpers.mjs';

const mod = (stat, kind, value, more = {}) => ({ stat, kind, value, ...more });

test('independent arithmetic: additive increases, multiplicative more, ordered override and clamps', () => {
  const sheet = new StatSheet(new StatRules({ power: { base: 10, min: 0, max: 100 } }));
  sheet.setSource('gear', [mod('power', 'flat', 5), mod('power', 'increased', .2), mod('power', 'increased', .3)]);
  sheet.setSource('passive', [mod('power', 'more', .5), mod('power', 'more', .2)]);
  equivalent(sheet.get('power'), 40.5); // (10 + 5) * (1 + .2 + .3) * 1.5 * 1.2
  sheet.setSource('override', [mod('power', 'override', 7), mod('power', 'override', 9)]);
  assert.equal(sheet.get('power'), 9);
  sheet.removeSource('override');
  equivalent(sheet.get('power'), 40.5);
  sheet.setBase('power', 100);
  assert.equal(sheet.get('power'), 100);
});

test('independent arithmetic: links are single-hop, and trade reads the pre-forgo source', () => {
  const rules = new StatRules({
    a: { base: 100 }, b: { base: 10 }, c: { base: 0 }, rate: { base: .5 }, forgo: { base: 1 },
  }, [{ from: 'a', to: 'b', rateStat: 'rate', forgoStat: 'forgo' }]);
  const sheet = new StatSheet(rules);
  sheet.setSource('links', [mod('c', 'link', 1, { fromStat: 'b' }), mod('b', 'link', .2, { fromStat: 'a' })]);
  assert.equal(sheet.get('a'), 0);
  assert.equal(sheet.get('b'), 80);
  assert.equal(sheet.get('c'), 10, 'links do not recursively include another grant');
});

test('source ownership and collision-free context keys prevent stale and aliased results', () => {
  const sheet = new StatSheet(new StatRules({ power: { base: 1 } }));
  const source = [mod('power', 'flat', 5, { tags: ['a,b'] })];
  sheet.setSource('owned', source);
  source[0].value = 999;
  assert.equal(sheet.get('power', new Set(['a,b'])), 6);
  assert.equal(sheet.get('power', new Set(['a', 'b'])), 1);
  sheet.getSourceMods('owned')[0].tags.push('broken');
  assert.equal(sheet.get('power', new Set(['a,b'])), 6);
  assert.throws(() => sheet.setSource('invalid', [mod('power', 'flat', NaN)]), /finite/);
  assert.throws(() => sheet.setGauges([['x', 1], ['x', 2]]), /Duplicate/);
});

test('two sessions remain independent when their operations are interleaved', () => {
  const shared = new Content(pack);
  const first = new Engine(shared, 42), second = new Engine(shared, 42);
  const configure = engine => {
    const character = engine.character(fixture.initial);
    const skill = engine.skill(fixture.initial.skill);
    return { character, skill, target: engine.target({ life: 10000 }) };
  };
  const a = configure(first), b = configure(second);
  for (let i = 0; i < 50; i++) {
    equivalent(first.resolveHit(a.character, a.skill, a.target), second.resolveHit(b.character, b.skill, b.target));
  }
  a.character.equip('lapis-reference', 'ring1');
  assert.notEqual(a.character.sheet.get('mana'), b.character.sheet.get('mana'));
  assert.equal(b.character.snapshot().equipped, undefined);
  assert.equal(typeof a.skill.tags.add, 'undefined', 'compiled tag contexts expose no mutation method');
});

test('preview is random-free; changed sources invalidate the compiled attack exactly once', () => {
  const { engine, character, skill } = setup();
  const before = engine.randomSnapshot();
  const first = engine.preview(character, skill);
  for (let i = 0; i < 100; i++) engine.preview(character, skill);
  assert.deepEqual(engine.randomSnapshot(), before);
  assert.equal(engine.planBuilds, 1);
  character.sheet.setSource('changed', [mod('damage', 'more', 1)]);
  const next = engine.preview(character, skill);
  assert.equal(next.total.lo, first.total.lo * 2);
  assert.equal(engine.planBuilds, 2);
});

test('equip, unequip and passive refunds restore values; rejected commands are atomic', () => {
  const engine = new Engine(pack);
  const character = engine.character(fixture.initial);
  const mana = character.sheet.get('mana');
  character.equip('lapis-reference', 'ring1');
  assert.ok(character.sheet.get('mana') > mana);
  const before = character.snapshot();
  assert.throws(() => character.equip('lapis-reference', 'ring2'), /already equipped/);
  assert.deepEqual(character.snapshot(), before);
  character.unequip('ring1');
  assert.equal(character.sheet.get('mana'), mana);
  character.allocate('cross_int_pursuit');
  assert.equal(character.pointsRemaining, 0);
  assert.throws(() => character.allocate('cross_int_pursuit'), /already/);
  character.refund('cross_int_pursuit');
  assert.equal(character.pointsRemaining, 1);
  assert.equal(character.sheet.get('damage', new Set(['spell'])), 1.15);
});

test('state restoration continues the exact random and target sequence', () => {
  const { engine, character, skill } = setup(99);
  character.setConditions(['moving']);
  character.setGauges([['charge:reference', 3]]);
  const target = engine.target({ life: 10000, mods: [mod('chaosRes', 'flat', .2)] });
  for (let i = 0; i < 5; i++) engine.resolveHit(character, skill, target);
  const saved = { random: engine.randomSnapshot(), character: character.snapshot(), skill: skill.selection, target: target.snapshot() };
  const resumed = new Engine(engine.content);
  resumed.restoreRandom(JSON.parse(JSON.stringify(saved.random)));
  const other = resumed.character(saved.character), otherSkill = resumed.skill(saved.skill);
  assert.equal(other.sheet.hasCondition('moving'), true);
  assert.equal(other.sheet.gauge('charge:reference'), 3);
  const otherTarget = Target.restore(resumed.content, saved.target);
  for (let i = 0; i < 20; i++) equivalent(engine.resolveHit(character, skill, target), resumed.resolveHit(other, otherSkill, otherTarget));
});

test('range bounds and target resistance caps hold across a broad seed sweep', () => {
  for (let seed = 0; seed < 256; seed++) {
    const { engine, character, skill } = setup(seed);
    const preview = engine.preview(character, skill);
    const hit = engine.resolveHit(character, skill, engine.target({ life: 1000, mods: [mod('chaosRes', 'flat', 99)] }));
    const total = Object.values(hit.outgoing).reduce((a, b) => a + b, 0);
    const scale = hit.crit ? preview.critMulti : 1;
    assert.ok(total >= preview.total.lo * scale - 1e-10 && total <= preview.total.hi * scale + 1e-10);
    assert.ok(Math.abs(hit.damage - total * .25) < 1e-10);
  }
});

test('unsupported mechanics fail explicitly and content is detached from caller mutation', () => {
  const input = structuredClone(pack);
  const engine = new Engine(input);
  input.stats.damage.base = 999;
  assert.equal(engine.content.rules.definitions.damage.base, 1);
  assert.throws(() => engine.target({ life: 100, mods: [mod('blockChance', 'flat', .5)] }), /Unsupported/);
  assert.throws(() => engine.skill({ ...fixture.initial.skill, nodes: ['venom_seeker'] }), /Unknown skill node/);
  const unsupported = structuredClone(pack);
  unsupported.supports.corrosion.mods.push(mod('apply_poison', 'flat', .5));
  assert.throws(() => new Content(unsupported), /Mechanic not in/);
  const hiddenBehavior = structuredClone(pack);
  hiddenBehavior.skills.ruin.effects = [{ type: 'summon' }];
  assert.throws(() => new Content(hiddenBehavior), /Skill field is not supported/);
  assert.throws(() => Random.restore({ algorithm: 'other', state: 1, draws: 0 }), /Unsupported/);
});

test('a second content pack changes the same engine through data', () => {
  const alternative = structuredClone(pack);
  alternative.id = 'test-independent-content';
  alternative.skills.ruin.name = 'A different game';
  alternative.skills.ruin.baseDamage = { fire: [4, 4] };
  alternative.skills.ruin.tags = ['spell', 'projectile', 'fire'];
  alternative.skills.ruin.perLevel = [];
  const engine = new Engine(alternative);
  const character = engine.character(fixture.initial);
  const skill = engine.skill(fixture.initial.skill);
  assert.equal(engine.preview(character, skill).total.lo, 4.6);
});

test('content rejects cycles, host objects and silently ignored skill-node behavior', () => {
  const cyclic = structuredClone(pack);
  cyclic.self = cyclic;
  assert.throws(() => new Content(cyclic), /cycles/);
  const host = structuredClone(pack);
  host.metadata = new Date();
  assert.throws(() => new Content(host), /plain serializable/);
  const behavior = structuredClone(pack);
  behavior.skills.ruin.nodes.ruin_studies.trigger = { skill: 'other' };
  assert.throws(() => new Content(behavior), /Skill node field is not supported/);
});

test('stat caches stay bounded when a host supplies many distinct contexts', () => {
  const sheet = new StatSheet(new StatRules({ value: { base: 3 } }), 32);
  for (let i = 0; i < 10000; i++) {
    assert.equal(sheet.get('value', new Set([`target:${i}`])), 3);
    assert.ok(sheet.cacheEntries <= 32);
  }
  const uncached = new StatSheet(new StatRules({ value: { base: 3 } }), 0);
  assert.equal(uncached.get('value'), 3);
  assert.equal(uncached.cacheEntries, 0);
});
