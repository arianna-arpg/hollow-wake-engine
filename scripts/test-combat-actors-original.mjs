import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url'; import {gunzipSync} from 'node:zlib';
import {buildCombatActorState} from './compile-combat-actor-state.mjs'; import {sha256} from './reference-utils.mjs';
const probe = process.argv.includes('--probe');
const archive = fs.readFileSync(probe ? '.artifacts/m3-combat-actors-probe.json.gz' : 'baseline/combat-actors/observations.json.gz');
const bytes = gunzipSync(archive), fixture = JSON.parse(bytes); assert(fixture.originalOnly);
if (!probe) {const a = JSON.parse(fs.readFileSync('baseline/combat-actors/acceptance.json')); assert.equal(sha256(archive), a.compressedSha256); assert.equal(sha256(bytes), a.sha256);}
const owned = fs.realpathSync('.artifacts'), work = fs.mkdtempSync(path.join(owned, 'm3-actors-owned-'));
try {
  const manifest = buildCombatActorState(work);
  const {initializeCombatActor: initialize, combatRecency} = await import(pathToFileURL(path.join(work, 'actor-state.mjs')).href);
  assert.deepEqual(combatRecency, {kinds: fixture.recentKinds, never: fixture.recentNever});
  const view = a => JSON.parse(JSON.stringify(a, (key, value) => key === 'sheet' ? {$sheet: true} :
    value instanceof Map ? {$map: [...value]} : value instanceof Set ? {$set: [...value]} :
    value instanceof Float64Array ? {$float64: [...value]} : typeof value === 'number' && !Number.isFinite(value) ? {$number: String(value)} : value));
  const bodies = [];
  for (const c of fixture.courses) {
    const sheet = {}, a = initialize({}, c.id, c.input.name, c.input.team, c.input.pos, sheet);
    assert.equal(a.sheet, sheet); assert.equal(a.pos !== c.input.pos, c.positionOwned);
    assert.deepEqual(view(a), c.state, c.name); bodies.push(a);
  }
  for (const key of Object.keys(bodies[0])) if (bodies[0][key] && typeof bodies[0][key] === 'object') {
    assert.notEqual(bodies[0][key], bodies[1][key], 'Actor state shared: ' + key);
  }
  bodies[0].charges.set('rage', 10); bodies[0].since[0] = 0; bodies[0].statuses.push({id: 'burn'});
  assert.equal(bodies[1].charges.size, 0); assert.equal(bodies[1].since[0], fixture.recentNever); assert.equal(bodies[1].statuses.length, 0);
  console.log({passed: true, originalActorDefaults: fixture.courses.length, fields: manifest.fields.length, independentMutableState: true, actorMethodsQualified: false});
} finally {assert.equal(path.dirname(fs.realpathSync(work)), owned); fs.rmSync(work, {recursive: true, maxRetries: 3});}
