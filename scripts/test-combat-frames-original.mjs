import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {sha256} from './reference-utils.mjs';
import {buildCombatContent} from './compile-combat-content.mjs';
import {createCombatSession} from '../adapters/embedded/combat-session.mjs';
import {emptyCombatSpace} from '../test/combat-empty-space.mjs';

const probe = process.argv.includes('--probe');
const familyCourse = process.argv.includes('--families'), name = familyCourse ? 'combat-families' : 'combat-frames';
const archive = fs.readFileSync(probe ? '.artifacts/m3-'+name+'-probe.json.gz' : 'baseline/'+name+'/observations.json.gz');
const bytes = gunzipSync(archive), fixture = JSON.parse(bytes); assert(fixture.originalOnly);
if (!probe) {
  const accepted = JSON.parse(fs.readFileSync('baseline/'+name+'/acceptance.json'));
  assert.equal(sha256(archive), accepted.compressedSha256); assert.equal(sha256(bytes), accepted.sha256);
}
const parent = fs.realpathSync('.artifacts'), work = fs.mkdtempSync(path.join(parent, 'm3-frames-owned-'));
const mismatches = [], refusals = [];
try {
  await buildCombatContent(path.join(work, 'content'));
  const {combatContent: content} = await import(pathToFileURL(path.join(work, 'content/content.mjs')));
  const q = {...content.queries, ...content.hitQueries};
  for (const course of fixture.courses) {
    const host = {space: emptyCombatSpace(1600, 1200)};
    host.space.viewRectFor = body => body.frameLockRect ?? course.view;
    const session = createCombatSession(content, host, {seed: course.seed, capacity: 16});
    let actor;
    try {actor = session.addActor({name: 'Hero', team: 'player', position: {x: 400, y: 400}, controlled: true, resourceFraction: course.resourceFraction,
      attributes: Object.fromEntries(Object.keys(q.ATTRIBUTES).map(id => [id, 100])), stats: {life: 10000, mana: 10000}, skills: [course.id]});
    } catch(error) {
      if (!familyCourse || !error.message.includes('missing-host-service')) throw error;
      refusals.push({id: course.id, reason: error.message}); continue;
    }
    session.addActor({name: 'Target', team: 'enemy', position: {x: 440, y: 400}, resourceFraction: course.resourceFraction, stats: {life: 10000, mana: 10000}});
    const inspect = () => JSON.parse(JSON.stringify({...session.snapshot(), ...(familyCourse ? {effects:session.effects()} : {})}));
    try {
      const accepted = session.press(actor, course.id, {x: 440, y: 400});
      assert.equal(accepted, course.accepted, 'request');
      for (let i = 0; i < course.steps.length; i++) {
        if (i === course.releaseStep) session.release(actor);
        if (i) session.advance(.1);
        const actual = inspect();
        try {assert.deepEqual(actual, course.steps[i]);}
        catch (error) {mismatches.push({id: course.id, step: i, actual, expected: course.steps[i], message: error.message}); break;}
      }
    } catch (error) {mismatches.push({id: course.id, error: error.stack});}
  }
  fs.writeFileSync('.artifacts/m3-'+name+'-comparison.json', JSON.stringify({passed: !mismatches.length, mismatches, refusals}, null, 2));
  console.log({courses: fixture.courses.length, refusals, mismatches: mismatches.map(m => ({id: m.id, step: m.step, message: (m.error ?? m.message).slice(0, 1400)}))});
  assert.equal(mismatches.length, 0, 'Composed frames must match the pinned original');
} finally {
  assert.equal(path.dirname(fs.realpathSync(work)), parent);
  fs.rmSync(work, {recursive: true, maxRetries: 3});
}
