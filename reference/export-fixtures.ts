// Executed inside the hash-verified original game's balance directory.
// This file never imports the extracted SDK; expected results come from the original.
import fs from 'node:fs';
import path from 'node:path';
import { bootSimEngine, makeSimWorld } from '../src/sim/arena';
import { mulberry32 } from '../src/sim/rng';
import { Actor } from '../src/engine/actor';
import { StatSheet, STAT_DEFS, STAT_TRADES, ATTRIBUTES, DAMAGE_TYPES, type Modifier } from '../src/engine/stats';
import { DEFENSE_CFG } from '../src/engine/defense';
import { SKILLS } from '../src/data/skills';
import { SUPPORTS } from '../src/data/supports';
import { PASSIVE_NODES } from '../src/data/passives';
import { CLASSES } from '../src/data/classes';
import { rollItem, compileItemMods } from '../src/engine/itemgen';
import { makeSkillInstance, instanceMods, skillContextTags, skillCooldownSeconds } from '../src/engine/skills';
import { rollSkillDamage, skillDamageBands, applyHit } from '../src/engine/damage';

const output = process.argv[2];
if (!output) throw new Error('An output directory is required.');
fs.mkdirSync(output, { recursive: true });
const json = (name: string, value: unknown): void =>
  fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n');
bootSimEngine();
const world = makeSimWorld('magician', 2345);
const hero = world.player;
const item = rollItem({ baseId: 'ring_lapis', ilvl: 1, rarity: 'common', rng: mulberry32(123) })!;
const classDef = CLASSES.find(c => c.id === 'magician')!;
const inst = makeSkillInstance(SKILLS.ruin, 5, 2);
const probeStats = ['life', 'mana', 'accuracy', 'evasion', 'armor', 'castSpeed', 'damage', 'critChance', 'critMulti', 'chaosRes'];
function state() {
  return {
    attributes: { ...hero.attributeValues },
    stats: Object.fromEntries(probeStats.map(id => [id, hero.sheet.get(id)])),
    preview: skillDamageBands(hero, inst),
    cost: hero.skillCost(inst),
    cooldown: skillCooldownSeconds(hero, inst),
    modifiers: instanceMods(inst),
    tags: [...skillContextTags(inst)],
  };
}
const steps = [{ command: { type: 'create' }, expected: state() }];
world.meta.equipped.ring1 = item;
world.recalcPlayer();
steps.push({ command: { type: 'equip', item: 'lapis-reference', slot: 'ring1' } as any, expected: state() });
world.meta.allocated.add('cross_int_pursuit');
world.recalcPlayer();
steps.push({ command: { type: 'allocate', id: 'cross_int_pursuit' } as any, expected: state() });
inst.sockets[0] = { def: SUPPORTS.corrosion, level: 2 };
inst.sockets[1] = { def: SUPPORTS.measured_blows, level: 1 };
steps.push({ command: { type: 'configure', supports: [{ id: 'corrosion', level: 2 }, { id: 'measured_blows', level: 1 }] } as any, expected: state() });
inst.treeNodes = ['ruin_studies'];
steps.push({ command: { type: 'mutate', nodes: ['ruin_studies'] } as any, expected: state() });
const builds = hero.sheet.sourceNames().map(id => ({ id, mods: hero.sheet.getSourceMods(id) }));
const sampleSkill = SKILLS.ruin;
const studyNode = sampleSkill.tree?.nodes?.find(n => n.id === 'ruin_studies');
if (!studyNode) throw new Error('Reference skill is missing Ruin Studies');
const pack = {
  schemaVersion: 1,
  id: 'hollow-wake-milestone-one',
  capability: 'resolved-spell-hit/v1',
  stats: STAT_DEFS,
  trades: STAT_TRADES,
  attributes: ATTRIBUTES,
  damageTypes: DAMAGE_TYPES,
  defense: { armorK: DEFENSE_CFG.armor.k, resistanceHardCap: DEFENSE_CFG.resistance.hardCap, resistanceFloor: DEFENSE_CFG.resistance.floor },
  classes: {
    magician: {
      id: classDef.id, name: classDef.name, attributes: classDef.attributes,
      startNode: classDef.startNode, mods: classDef.innate ?? [],
      // This slice's character is level one; the full progression curve is deferred.
      levelMods: builds.find(s => s.id === 'level')!.mods,
    },
  },
  passives: Object.fromEntries(['int_start', 'cross_int_pursuit'].map(id => [id, PASSIVE_NODES[id]])),
  items: { 'lapis-reference': { id: 'lapis-reference', name: item.name, category: 'ring', slots: ['ring1', 'ring2'], mods: compileItemMods(item) } },
  skills: {
    ruin: {
      id: sampleSkill.id, name: sampleSkill.name, tags: sampleSkill.tags,
      castTag: 'cast:timed', manaCost: sampleSkill.manaCost,
      cooldown: sampleSkill.cooldown, useTime: sampleSkill.useTime,
      baseDamage: sampleSkill.baseDamage, requirements: sampleSkill.requirements,
      perLevel: sampleSkill.leveling!.perLevel, treeLevel: sampleSkill.tree!.level,
      nodes: { ruin_studies: studyNode },
    },
  },
  supports: Object.fromEntries(['corrosion', 'measured_blows'].map(id => [id, {
    id, name: SUPPORTS[id].name, requiresTags: SUPPORTS[id].requiresTags,
    excludeTags: SUPPORTS[id].excludeTags, mods: SUPPORTS[id].mods, perLevel: SUPPORTS[id].perLevel,
  }])),
};
// Preserve the complete authored stat registry as evidence, while the small runtime
// pack carries only definitions used by this declared capability and its selected content.
json('stat-catalogue.json', STAT_DEFS);
const usedStats = new Set([
  ...probeStats, 'damageTaken', 'critAvoid', 'armorPen', 'armorDamageFloor',
  'luckyChance', 'unluckyChance', 'damageSpread', 'thorns', 'thornsToHit',
  'reservedDamage', 'maxManaDamage', 'manaCost', 'manaUseCost', 'addedManaCost',
  'addedLifeCost', 'costToLife', 'costToMana', 'addedCooldown', 'cooldownRecovery',
  ...STAT_TRADES.flatMap(t => [t.from, t.to, t.rateStat, t.forgoStat]),
]);
function collectMods(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  const row = value as Record<string, unknown>;
  if (typeof row.stat === 'string') usedStats.add(row.stat);
  if (typeof row.fromStat === 'string') usedStats.add(row.fromStat);
  for (const child of Object.values(row)) collectMods(child);
}
for (const value of [pack.attributes, pack.classes, pack.passives, pack.items, pack.skills, pack.supports]) collectMods(value);
for (const type of DAMAGE_TYPES) {
  for (const stat of [`added${type[0].toUpperCase()}${type.slice(1)}`, `addedMin_${type}`, `addedMax_${type}`,
    `extraAs_${type}`, `${type}Pen`, `${type}Res`, `${type}ResMax`]) usedStats.add(stat);
  for (const to of DAMAGE_TYPES) if (type !== to) usedStats.add(`convert_${type}_${to}`);
}
pack.stats = Object.fromEntries(Object.entries(STAT_DEFS).filter(([id]) => usedStats.has(id)));
json('milestone-one.json', pack);
json('authored-selection.json', {
  class: classDef, skill: sampleSkill, supports: [SUPPORTS.corrosion, SUPPORTS.measured_blows],
  passives: [PASSIVE_NODES.int_start, PASSIVE_NODES.cross_int_pursuit],
  item,
  note: 'Raw authored definitions are retained here. The runtime pack explicitly exposes only the resolved hit capability; Ruin bond feeding, travel and other tree branches are not implemented.',
});
const hits: unknown[] = [];
for (const seed of [0, 1, 2, 17, 42, 99, 255, 1024, 12345, 659918, 0x7fffffff, 0xffffffff]) {
  const next = mulberry32(seed);
  const original = Math.random;
  const draws: number[] = [];
  Math.random = () => { const value = next(); draws.push(value); return value; };
  try {
    const target = new Actor('reference-target', 'enemy', { x: 0, y: 0 });
    target.sheet.setBase('life', 500);
    target.sheet.setBase('chaosRes', seed % 2 ? 0.25 : 0.95);
    target.life = 500;
    const targetSpec = { life: 500, mods: [{ stat: 'chaosRes', kind: 'flat', value: seed % 2 ? 0.25 : 0.95 }] };
    const trace: unknown[] = [];
    for (let i = 0; i < 6; i++) {
      const start = draws.length;
      const packet = rollSkillDamage(hero, inst);
      const outgoing = { ...packet.amounts };
      const result = applyHit(hero, target, packet);
      trace.push({
        outgoing, crit: packet.crit, rollT: packet.rollT,
        damage: result.total, life: target.life,
        randomDraws: draws.length - start,
      });
    }
    hits.push({ seed, target: targetSpec, trace, draws });
  } finally { Math.random = original; }
}
json('first-path.json', {
  schemaVersion: 1,
  description: 'Original World.recalcPlayer + original skill compilation, damage roll, preview, costs and applyHit. Spatial contact is pre-resolved; no active bond, status or defensive pools.',
  initial: { classId: 'magician', passivePoints: 1, skill: { id: 'ruin', level: 5, sockets: 2, treePoints: 1 } },
  probeStats, steps, hits,
});
// Mixed numeric cases broaden the first slice beyond a single chaos-damage example.
// These still call the original damage and mitigation code, with inert world-only mechanics.
const arithmeticContacts: unknown[] = [];
for (let index = 0; index < 32; index++) {
  const mods: Modifier[] = [
    { stat: 'addedPhysical', kind: 'flat', value: index % 4 * 3 },
    { stat: 'addedMin_fire', kind: 'flat', value: index % 3 * 2 },
    { stat: 'addedMax_fire', kind: 'flat', value: 3 + index % 7 },
    { stat: 'damageSpread', kind: 'flat', value: (index % 5 - 2) * .25 },
    { stat: 'convert_physical_fire', kind: 'flat', value: index % 2 ? .75 : 0 },
    { stat: 'convert_fire_cold', kind: 'flat', value: index % 3 ? .5 : 0 },
    { stat: 'extraAs_lightning', kind: 'flat', value: index % 4 * .1 },
    { stat: 'luckyChance', kind: 'flat', value: index % 4 < 2 ? 1 : 0 },
    { stat: 'unluckyChance', kind: 'flat', value: index % 4 % 2 },
    { stat: 'critChance', kind: 'override', value: index % 3 ? 1 : 0 },
    { stat: 'critMulti', kind: 'flat', value: .5 },
    { stat: 'armorPen', kind: 'flat', value: .3 },
    { stat: 'chaosPen', kind: 'flat', value: index % 5 * .4 },
    { stat: 'thorns', kind: 'flat', value: 4 },
    { stat: 'thornsToHit', kind: 'flat', value: index % 2 * .5 },
    { stat: 'maxManaDamage', kind: 'flat', value: index % 3 * .03 },
    { stat: 'costToLife', kind: 'flat', value: index % 3 * .25 },
    { stat: 'addedManaCost', kind: 'flat', value: index % 4 },
    { stat: 'damage', kind: 'increased', value: .1, when: 'moving', gauge: 'charge:reference' },
  ];
  const conditions = index % 2 ? ['moving'] as const : [];
  const gauges: [string, number][] = [['charge:reference', index % 5]];
  hero.sheet.setSource('arithmetic-case', mods);
  hero.sheet.setConditions([...conditions]);
  hero.sheet.setGauges(gauges);
  const targetMods: Modifier[] = [
    { stat: 'armor', kind: 'flat', value: 60 },
    { stat: 'chaosRes', kind: 'flat', value: index % 2 ? .95 : -.3 },
    { stat: 'fireRes', kind: 'flat', value: .2 },
    { stat: 'coldRes', kind: 'flat', value: .4 },
    { stat: 'critAvoid', kind: 'flat', value: index % 2 },
    { stat: 'damageTaken', kind: 'more', value: -.1 },
  ];
  const target = new Actor('numeric-target', 'enemy', { x: 0, y: 0 });
  target.life = 5000;
  target.sheet.setBase('life', 5000);
  target.sheet.setSource('case-defense', targetMods);
  const seed = 0x7000 + index;
  const next = mulberry32(seed);
  const original = Math.random;
  let draws = 0;
  Math.random = () => { draws++; return next(); };
  try {
    const trace: unknown[] = [];
    for (let i = 0; i < 3; i++) {
      const before = draws;
      const packet = rollSkillDamage(hero, inst);
      const outgoing = { ...packet.amounts };
      const result = applyHit(hero, target, packet);
      trace.push({ outgoing, crit: packet.crit, rollT: packet.rollT,
        damage: result.total, life: target.life, randomDraws: draws - before });
    }
    arithmeticContacts.push({
      seed, mods, conditions, gauges, target: { life: 5000, mods: targetMods },
      preview: skillDamageBands(hero, inst), cost: hero.skillCost(inst), trace,
    });
  } finally { Math.random = original; }
}
json('arithmetic-contacts.json', arithmeticContacts);
// Generated stateful stat operations exercise the same source changes a build editor makes.
const random = mulberry32(0x5a7);
const stats = ['damage', 'life', 'armor', 'evasion', 'insight', 'evasionToArmor', 'evasionForgone', 'critChance'];
const tags = ['spell', 'projectile', 'chaos'];
const sheet = new StatSheet();
const operations: unknown[] = [];
for (let i = 0; i < 240; i++) {
  let command: any;
  if (i % 11 === 0) {
    command = { type: 'conditions', values: i % 22 ? ['moving'] : [] };
    sheet.setConditions(command.values);
  } else if (i % 13 === 0) {
    command = { type: 'gauges', entries: [['charge:reference', i % 5]] };
    sheet.setGauges(command.entries);
  } else if (i % 7 === 0) {
    command = { type: 'remove', id: 'source:' + (i % 9) };
    sheet.removeSource(command.id);
  } else {
    const mods: Modifier[] = [];
    for (let j = 0; j < 5; j++) {
      const stat = stats[Math.floor(random() * stats.length)];
      const kind = (['flat', 'increased', 'more', 'override'] as const)[Math.floor(random() * 4)];
      mods.push({
        stat, kind, value: stat === 'life' ? random() * 30 : random() * 0.5,
        ...(j % 3 === 0 ? { tags: ['spell'] as any } : {}),
        ...(j % 3 === 1 ? { when: 'moving' as const } : {}),
        ...(j === 4 ? { gauge: 'charge:reference' } : {}),
      });
    }
    command = { type: 'source', id: 'source:' + (i % 9), mods };
    sheet.setSource(command.id, mods);
  }
  operations.push({ command, expected: Object.fromEntries(stats.map(stat => [stat, sheet.get(stat, new Set(tags as any))])) });
}
json('stat-transitions.json', { seed: 0x5a7, tags, operations });
console.log(`Reference export: ${steps.length} build stages, ${hits.length * 6} hit transitions, ${operations.length} stat transitions.`);
