import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Content, Engine, StatSheet } from '../dist/index.js';
import { pack, fixture, setup, equivalent, read } from './helpers.mjs';

test('each build transition matches the original World, skill compiler, preview and cost rules', () => {
  const engine = new Engine(pack);
  const character = engine.character(fixture.initial);
  let selection = structuredClone(fixture.initial.skill);
  for (const { command, expected } of fixture.steps) {
    if (command.type === 'equip') character.equip(command.item, command.slot);
    if (command.type === 'allocate') character.allocate(command.id);
    if (command.type === 'configure') selection = { ...selection, supports: command.supports };
    if (command.type === 'mutate') selection = { ...selection, nodes: command.nodes };
    const skill = engine.skill(selection);
    const costs = engine.costs(character, skill);
    equivalent({
      attributes: { ...character.attributes },
      stats: Object.fromEntries(fixture.probeStats.map(id => [id, character.sheet.get(id)])),
      preview: engine.preview(character, skill),
      cost: { mana: costs.mana, life: costs.life }, cooldown: costs.cooldown,
      modifiers: skill.mods, tags: [...skill.tags],
    }, expected, `build.${command.type}`);
  }
});

for (const row of fixture.hits) {
  test(`reference contact trace and random draw order, seed ${row.seed}`, () => {
    const { engine, character, skill } = setup(row.seed);
    const target = engine.target(row.target);
    for (let i = 0; i < row.trace.length; i++) {
      equivalent(engine.resolveHit(character, skill, target), row.trace[i], `seed ${row.seed}, contact ${i}`);
    }
    assert.equal(engine.randomSnapshot().draws, row.draws.length);
    assert.equal(engine.planBuilds, 1, 'stable loadout compiles once, not per hit');
  });
}

test('generated source, condition, gauge and removal sequences match original StatSheet', () => {
  const { tags, operations } = read('baseline/stat-transitions.json');
  const sheet = new StatSheet(new Content(pack).rules);
  for (let i = 0; i < operations.length; i++) {
    const { command, expected } = operations[i];
    if (command.type === 'source') sheet.setSource(command.id, command.mods);
    if (command.type === 'remove') sheet.removeSource(command.id);
    if (command.type === 'conditions') sheet.setConditions(command.values);
    if (command.type === 'gauges') sheet.setGauges(command.entries);
    equivalent(Object.fromEntries(Object.keys(expected).map(stat => [stat, sheet.get(stat, new Set(tags))])), expected, `stat transition ${i}`);
  }
});

test('mixed conversions, range changes, lucky rolls, crit avoidance, penetration and cost conversion match the original', () => {
  for (const row of read('baseline/arithmetic-contacts.json')) {
    const { engine, character, skill } = setup(row.seed);
    character.sheet.setSource('arithmetic-case', row.mods);
    character.setConditions(row.conditions);
    character.setGauges(row.gauges);
    equivalent(engine.preview(character, skill), row.preview, `numeric ${row.seed} preview`);
    const { mana, life } = engine.costs(character, skill);
    equivalent({ mana, life }, row.cost, `numeric ${row.seed} costs`);
    const target = engine.target(row.target);
    row.trace.forEach((expected, i) => equivalent(engine.resolveHit(character, skill, target), expected, `numeric ${row.seed} hit ${i}`));
  }
});

test('differential comparator rejects a deliberately altered result', () => {
  const changed = structuredClone(fixture.hits[0].trace[0]);
  changed.damage += 1;
  assert.throws(() => equivalent(changed, fixture.hits[0].trace[0]), /damage/);
});
