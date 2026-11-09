import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {Content, Engine} from '../dist/index.js';
import {ItemContent, ItemRules} from '../dist/item-rules.js';
import {itemPack} from './compile-item-content.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file));
// The frozen observer is JSON, as is the native transport. Optional undefined
// properties have no representation in this comparison; runtime API shape is separate.
const jsonValue = value => JSON.parse(JSON.stringify(value));
const manifest = read('baseline/equipment-catalogue/acceptance.json');
const compressed = fs.readFileSync('baseline/equipment-catalogue/observations.json.gz');
assert.equal(sha(compressed), manifest.gzipSha256);
const bytes = gunzipSync(compressed); assert.equal(sha(bytes), manifest.sha256);
assert.equal(sha(fs.readFileSync(manifest.source)), manifest.sourceSha256);
assert.equal(sha(fs.readFileSync('baseline/source-lock.json')), manifest.sourceLockSha256);
const original = JSON.parse(bytes); assert(original.complete); assert.equal(original.rows.length, manifest.cases);
const pack = itemPack(), rules = new ItemRules(new ItemContent(pack), 17);
const core = read('content/milestone-one.json'), engine = new Engine(new Content(core), 29);
const skill = engine.skill({id: 'ruin', level: 5, sockets: 0, treePoints: 0});
const initialRandom = {items: rules.snapshot(), combat: engine.randomSnapshot()};
const compilationFailures = [], projectionDifferences = [], projected = [], rejected = {}, choiceFallbacks = [];
const derivation = {grantedSkills: [], wornGrafts: [], changedLearnedSkill: [], savedItemMutation: []};
const checks = (actual, expected, failures, row, label) => {
  try { assert.deepEqual(actual, expected); } catch { failures.push({id: row.spec.id, family: row.spec.family, label, actual, expected}); }
};
for (const [index, row] of original.rows.entries()) {
  let mods;
  try { mods = rules.compile(row.item); }
  catch (error) { compilationFailures.push({index, id: row.spec.id, error: String(error)}); continue; }
  checks(jsonValue(mods), row.mods, compilationFailures, row, 'compiled modifiers');
  assert.deepEqual(row.before.cast, row.equipped.cast, row.spec.id + ': cast changed on derivation');
  assert.deepEqual(row.equipped.cast, row.removed.cast, row.spec.id + ': cast changed on removal');
  assert.equal(row.equipped.life, Math.min(row.before.life, row.equipped.maxLife));
  assert.equal(row.equipped.mana, Math.min(row.before.mana, row.equipped.maxMana));
  assert.equal(row.removed.life, Math.min(row.equipped.life, row.removed.maxLife));
  assert.equal(row.removed.mana, Math.min(row.equipped.mana, row.removed.maxMana));
  const gear = row.equipped.sources.find(([name]) => name === 'gear:' + row.spec.slot);
  assert(gear, 'Missing original gear source');
  assert.deepEqual(gear[1], jsonValue(mods.filter(m => !Object.hasOwn(core.attributes, m.stat))));
  assert.deepEqual(row.removed.attributes, row.before.attributes);
  assert.deepEqual(row.removed.sources, row.before.sources);
  if (row.equipped.granted.length) derivation.grantedSkills.push(index);
  if (row.equipped.wornGrafts.length) derivation.wornGrafts.push(index);
  if (JSON.stringify(row.before.learned) !== JSON.stringify(row.equipped.learned)) derivation.changedLearnedSkill.push(index);
  if (JSON.stringify(row.item) !== JSON.stringify(row.storedItem)) derivation.savedItemMutation.push(index);
  if (row.spec.choice) {
    const resolved = rules.resolveChoices(row.item);
    if (resolved[row.spec.choice.group]?.id !== row.spec.choice.id)
      choiceFallbacks.push({index, id: row.spec.id, requested: row.spec.choice.id, resolved: resolved[row.spec.choice.group]?.id ?? null});
  }
  let character;
  try {
    const id = 'equipped:' + row.item.uid;
    character = engine.character({classId: 'magician', passivePoints: 1, equipped: {[row.spec.slot]: id},
      itemInstances: {[id]: {id, name: row.item.name, category: pack.bases[row.item.baseId].category,
        slots: [row.spec.slot], mods}}});
  } catch (error) {
    const reason = String(error.message); (rejected[reason] ??= []).push(index); continue;
  }
  const differencesBefore = projectionDifferences.length;
  checks(character.attributes, row.equipped.attributes, projectionDifferences, row, 'attributes');
  for (const [stat, value] of Object.entries(row.equipped.stats))
    checks(character.sheet.get(stat), value, projectionDifferences, row, 'stat:' + stat);
  checks(engine.preview(character, skill), row.equipped.preview, projectionDifferences, row, 'Ruin preview');
  const costs = engine.costs(character, skill);
  checks({mana: costs.mana, life: costs.life}, row.equipped.cost, projectionDifferences, row, 'Ruin cost');
  checks(costs.cooldown, row.equipped.cooldown, projectionDifferences, row, 'Ruin cooldown');
  projected.push({index, matchesObservedNumericProjection: differencesBefore === projectionDifferences.length});
}
assert.deepEqual({items: rules.snapshot(), combat: engine.randomSnapshot()}, initialRandom, 'Read-only derivation consumed RNG/identity');
const report = {schemaVersion: 1, passed: !compilationFailures.length && !projectionDifferences.length,
  scope: 'Original item compilation and numeric-projection audit; matching numbers do not qualify equipment side effects or native acceptance',
  fixtureSha256: manifest.gzipSha256, cases: original.rows.length, compilationFailures, projectionDifferences,
  projected, rejected, derivation, choiceFallbacks,
  summary: {compiled: original.rows.length - compilationFailures.length, projected: projected.length,
    numericDifferences: projectionDifferences.length, rejected: Object.values(rejected).reduce((n, rows) => n + rows.length, 0),
    rejectionReasons: Object.keys(rejected).length, choiceFallbacks: choiceFallbacks.length,
    derivation: Object.fromEntries(Object.entries(derivation).map(([key, rows]) => [key, rows.length]))},
  nativeQualification: false, physicalDeviceQualification: false};
fs.writeFileSync('.artifacts/equipment-catalogue-audit.json', JSON.stringify(report, null, 2) + '\n');
console.log(report.summary);
assert(report.passed, `Equipment audit found ${compilationFailures.length} compilation and ${projectionDifferences.length} numeric differences; see .artifacts/equipment-catalogue-audit.json`);
