import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url'; import {gunzipSync} from 'node:zlib';
import {createDamagePipeline} from '../dist/damage-pipeline.js';
import {StatSheet} from '../dist/stats.js'; import {StatRules} from '../dist/stat-rules.js';
import {createCombatActors} from '../adapters/embedded/combat-actor-services.mjs';
import {readCatalogue} from './catalogue-tools.mjs'; import {buildCombatQueries} from './compile-combat-queries.mjs';
import {buildCombatActorState} from './compile-combat-actor-state.mjs'; import {sha256} from './reference-utils.mjs';
const probe = process.argv.includes('--probe');
const archive = fs.readFileSync(probe ? '.artifacts/m3-actor-timers-probe.json.gz' : 'baseline/actor-timers/observations.json.gz');
const bytes = gunzipSync(archive), fixture = JSON.parse(bytes); assert(fixture.originalOnly);
if (!probe) {const a = JSON.parse(fs.readFileSync('baseline/actor-timers/acceptance.json')); assert.equal(sha256(archive), a.compressedSha256); assert.equal(sha256(bytes), a.sha256);}
const owned = fs.realpathSync('.artifacts'), work = fs.mkdtempSync(path.join(owned, 'm3-actor-timers-owned-'));
try {
  await buildCombatQueries(work); buildCombatActorState(work);
  const {combatSkillQueries: q, combatActorRules} = await import(pathToFileURL(path.join(work, 'queries.mjs')).href);
  const {initializeCombatActor: initialize, combatActorTiming} = await import(pathToFileURL(path.join(work, 'actor-state.mjs')).href);
  const catalogue = readCatalogue(), table = name => Object.fromEntries(catalogue.tables[name].map(r => [r.id, r.value]));
  const statuses = table('statuses'), statRules = new StatRules(table('stats'), table('rules').statTrades);
  assert.deepEqual(combatActorRules.vitals, fixture.vitals); assert.equal(combatActorTiming.bankStillGrace, fixture.bankStillGrace);
  for (const [key, value] of Object.entries(fixture.rules)) assert.equal(({...combatActorRules, ...combatActorTiming})[key], value);
  const plain = v => JSON.parse(JSON.stringify(v, (k, v) => k === 'inst' && v?.def ? {$skill: v.def.id} :
    v instanceof Map ? [...v] : v instanceof Float64Array ? [...v] : v));
  for (const c of fixture.courses) {
    const unused = () => assert.fail(c.name + ': unexpected branch');
    const damage = createDamagePipeline({...q, random: unused, travelProtected: () => false, weakPointBonus: () => 0,
      plyFloor: () => 0, dominantType: unused, stampSegment() {}, feedWound: () => false, resourceFlow() {}, boundToAbsorb: () => false});
    const {Actor} = createCombatActors({initialize, queries: q, definitions: {statuses},
      rules: {...combatActorRules, ...combatActorTiming}, random: unused, damage,
      summons: {slots: unused, reservation: unused},
      notify: {healed() {}, lifeSpent() {}, buffRelease() {}, statusPop() {}, restore() {}, timers() {}}});
    const skills = new Map(fixture.definitions.map(d => [d.id, q.makeSkillInstance(d, 1)]));
    const restore = v => v && typeof v === 'object' ? v.$skill ? skills.get(v.$skill) : Array.isArray(v) ? v.map(restore) :
      Object.fromEntries(Object.entries(v).map(([k, x]) => [k, restore(x)])) : v;
    const a = new Actor(1, c.initial.fields.name, 'player', {x: 0, y: 0}, new StatSheet(statRules));
    Object.assign(a, restore(c.initial.fields)); a.since.set(c.initial.since);
    a.skills = c.initial.skills.map(row => {if (!row) return null; const i = skills.get(row.id); i.state = restore(row.state); return i;});
    for (const name of fixture.mapFields) {a[name].clear(); for (const [id, value] of restore(c.initial.maps[name])) a[name].set(id, value);}
    for (const [key, value] of Object.entries(c.bases)) a.sheet.setBase(key, value);
    for (const [id, mods] of c.initial.sources) a.sheet.setSource(id, restore(mods));
    const snapshot = () => plain({fields: Object.fromEntries(fixture.scalarFields.map(k => [k, a[k]])),
      maps: Object.fromEntries(fixture.mapFields.map(k => [k, [...a[k]]])), since: [...a.since],
      skills: a.skills.map(i => i ? {id: i.def.id, state: i.state} : null),
      sources: a.sheet.sourceNames().map(id => [id, a.sheet.getSourceMods(id)]),
      reads: Object.fromEntries(['life', 'mana', 'energyShield', 'lifeRegen', 'manaRegen', 'poise', 'damage', 'healTaken'].map(k => [k, a.sheet.get(k)]))});
    assert.deepEqual(snapshot(), c.initial, c.name + ': initial');
    for (const [index, step] of c.steps.entries()) {
      const ticks = [], dot = a.updateTimers(step.dt, step.chronoDt, (s, n, t) => ticks.push({id: s.id, n, t}));
      assert.deepEqual({dot, ticks, state: snapshot()}, {dot: step.dot, ticks: step.ticks, state: step.state}, c.name + ': step ' + index);
    }
  }
  console.log({passed: true, originalActorClockCourses: fixture.courses.length,
    transitions: fixture.courses.reduce((n, c) => n + c.steps.length, 0), authoredActorAssembly: true, allCombatFamiliesQualified: false});
} finally {assert.equal(path.dirname(fs.realpathSync(work)), owned); fs.rmSync(work, {recursive: true, maxRetries: 3});}
