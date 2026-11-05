import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { root, sha256, writeJSON } from './reference-utils.mjs';
import { readVocationFixture } from './vocation-reference.mjs';
import { readCatalogue } from './catalogue-tools.mjs';
import { ProgressionGateContent } from '../dist/progression-gate-content.js';
import { gateRowLabel, gateLevelNeeds, gateClassLevelNeeds } from '../dist/progression-gates.js';

export function progressionGatePack() {
  const { fixtures } = JSON.parse(fs.readFileSync(path.join(root, 'baseline/progression-gates/acceptance.json')));
  const source = JSON.parse(readVocationFixture('content', fixtures));
  const observations = JSON.parse(readVocationFixture('gates', fixtures));
  // These frozen expressions are reviewed as data templates. Changed source
  // expressions require an explicit compiler revision and new observations.
  assert.deepEqual(source.encoderSources, {
    reachedLevelKey: 'n=>`reached_level_${n}`',
    classLevelLedgerKey: '(classId,m)=>`class_${classId}_level_${m}`',
    vocationUnlockKey: 'vocId=>`${LEDGER_VOCATION_PREFIX}${vocId}`',
    questDoneKey: 'questId=>`${LEDGER_QUEST_DONE_PREFIX}${questId}`',
  });
  const classParts = source.classZero.split(source.classToken);
  assert.equal(classParts.length, 2);
  assert(source.levelZero.endsWith('0') && classParts[1].endsWith('0'));
  const keys = {
    levelPrefix: source.levelZero.slice(0, -1),
    classPrefix: classParts[0],
    classLevelSeparator: classParts[1].slice(0, -1),
    vocationPrefix: source.vocationPrefix,
    questDonePrefix: source.questDonePrefix,
    questsCompletedKey: source.questsCompletedKey,
  };
  const classes = new Map(source.classes.map(row => [row.id, row.name]));
  const catalogue = readCatalogue();
  const byId = (left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  assert.deepEqual([...source.classes].sort(byId),
    catalogue.tables.classes.map(({ id, value }) => ({ id, name: value.name })).sort(byId));
  assert.deepEqual(observations.classes, source.classes);
  const unlocks = new Set(source.unlockIds), features = new Set(source.featureIds);
  // The pinned src/data/brandt.ts owns this flag outside the FEATURE registry.
  // Its grant remains a host service, and its authored requirements survive.
  features.add('brandt_rare_wares');
  const requirements = observations.authored.map(({ id, rows }) => {
    assert(unlocks.has(id), id);
    for (const row of rows) {
      if (row.unlock !== undefined) assert(unlocks.has(row.unlock), row.unlock);
      if (row.feature !== undefined) assert(features.has(row.feature), row.feature);
      if (row.classLevel !== undefined) assert(classes.has(row.classLevel.classId), row.classLevel.classId);
    }
    return { id, mode: 'any', rows };
  });
  const data = { schemaVersion: 1, capability: 'progression-gates/v1', keys, classes: source.classes, requirements };
  const pack = { ...data, contentId: 'hollow-wake-progression-gates:sha256:' + sha256(JSON.stringify(data)) };
  const content = new ProgressionGateContent(pack), context = content.context;
  const number = value => typeof value === 'object' ? Number(value.number) : value;
  for (const row of source.levels) assert.equal(context.reachedLevelKey(number(row.level)), row.key);
  for (const row of source.classLevels) assert.equal(context.classLevelLedgerKey(row.id, number(row.level)), row.key);
  for (const row of source.vocations) assert.equal(context.vocationUnlockKey(row.id), row.key);
  for (const row of source.quests) assert.equal(context.questDoneKey(row.id), row.key);
  for (const original of observations.authored) {
    const requirement = content.requirement(original.id);
    assert.deepEqual(requirement.rows, original.rows);
    assert.deepEqual(requirement.rows.map(row => gateRowLabel(row, context)), original.labels);
    assert.deepEqual(gateLevelNeeds(requirement.rows), original.levels);
    assert.deepEqual(gateClassLevelNeeds(requirement.rows), original.classLevels);
  }
  return content.pack;
}

export function buildProgressionGates(destination) {
  const pack = progressionGatePack();
  fs.mkdirSync(destination, { recursive: true });
  const bytes = JSON.stringify(pack, null, 2) + '\n';
  fs.writeFileSync(path.join(destination, 'gates.json'), bytes);
  writeJSON(path.join(destination, 'package.json'), {
    name: '@hollow-wake/progression-gates', version: '0.1.0', private: true, type: 'module',
    license: 'PolyForm-Noncommercial-1.0.0',
    exports: { './gates.json': './gates.json', './manifest.json': './manifest.json' },
    files: ['gates.json', 'manifest.json', 'LICENSE.md', 'NOTICE.md', 'README.md'],
  });
  writeJSON(path.join(destination, 'manifest.json'), {
    schemaVersion: 1, contentId: pack.contentId, capability: pack.capability,
    sha256: sha256(bytes), bytes: Buffer.byteLength(bytes),
  });
  for (const name of ['LICENSE.md', 'NOTICE.md']) {
    fs.copyFileSync(path.join(root, name), path.join(destination, name));
  }
  fs.writeFileSync(path.join(destination, 'README.md'),
    '# Hollow Wake progression gates\n\n' +
    'The 88 authored reqAnyOf groups, 39 class display names, and account-key templates. ' +
    'Load once with @hollow-wake/engine/progression/gate-content. ' +
    'Query groups with @hollow-wake/engine/progression/gates and supply current account facts and unlock ownership. ' +
    'Hosts apply their additional visibility, purchase and mastery eligibility policies.\n');
  return pack;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pack = buildProgressionGates(path.join(root, '.artifacts/progression-gate-content'));
  console.log({ classes: pack.classes.length, requirements: pack.requirements.length, contentId: pack.contentId });
}
