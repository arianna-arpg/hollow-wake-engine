import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {buildCombatContent} from './compile-combat-content.mjs';
import {createCombatOwner} from '../adapters/embedded/combat-owner.mjs';
import {createCombatAdmission} from '../adapters/embedded/combat-admission.mjs';
import {installCombatClock} from '../adapters/embedded/combat-clock-services.mjs';
import {emptyCombatSpace} from '../test/combat-empty-space.mjs';

// Broad composition smoke coverage, not an original-equivalence receipt.
const parent = fs.realpathSync('.artifacts'), work = fs.mkdtempSync(path.join(parent, 'm3-census-owned-'));
const results = [];
try {
  await buildCombatContent(path.join(work, 'content'));
  const {combatContent: content} = await import(pathToFileURL(path.join(work, 'content/content.mjs')));
  const q = {...content.queries, ...content.hitQueries};
  for (const def of Object.values(q.SKILLS)) {
    const result = {id: def.id, delivery: def.delivery.type};
    try {
      const host = {space: emptyCombatSpace()}, admission = createCombatAdmission(content, host);
      const owner = createCombatOwner(content, host, {seed: 1234, capacity: 16, admit: admission.admit}), {w} = owner;
      const clock = installCombatClock(owner, content);
      const actor = w.allocateActor('Hero', 'player', {x: 400, y: 400}); actor.kind = 'player';
      const enemy = w.allocateActor('Target', 'enemy', {x: 440, y: 400});
      for (const a of [actor, enemy]) {
        a.sheet.setBase('life', 10000); a.sheet.setBase('mana', 10000); a.life = a.maxLife(); a.mana = a.maxMana();
      }
      w.actors.push(actor, enemy);
      const seat = {id: 'hero', actor, meta: {knownSkills: new Map(), stances: new Map(), attrs: Object.fromEntries(Object.keys(q.ATTRIBUTES).map(id => [id, 100]))}, reviveDwellBy: new Map(), lastActedAt: -999};
      w.seats.push(seat); w.localSeat = seat;
      const skill = q.makeSkillInstance(def, 1); actor.skills = [skill]; seat.meta.knownSkills.set(def.id, skill);
      result.admission = admission.inspect(actor, skill);
      if (!result.admission) {
        result.requested = w.useSkill(actor, skill, {...enemy.pos}, true);
        for (let i = 0; i < 16; i++) {
          clock.advance(.1);
          for (const body of w.actors) {
            for (const value of [body.life, body.mana, body.pos.x, body.pos.y, ...body.statuses.map(s => s.dps)])
              assert(Number.isFinite(value), 'Nonfinite combat state');
          }
        }
        result.actors = w.actors.length; result.enemyLife = enemy.life;
        result.projectiles = w.projectiles.length; result.zones = w.zones.length;
      }
    } catch (error) {result.error = error.stack;}
    results.push(result);
    if (results.length % 200 === 0) console.log({checked: results.length});
  }
  const failures = results.filter(r => r.error);
  fs.writeFileSync('.artifacts/m3-owner-census.json', JSON.stringify({originalEquivalence: false, results}, null, 2));
  console.log({total: results.length, refused: results.filter(r => r.admission).length, failed: failures.length,
    failures: failures.slice(0, 15).map(r => ({id: r.id, error: r.error.split('\n').slice(0, 4)}))});
  assert.equal(failures.length, 0, 'Composed authored skills must not throw after admission');
} finally {
  assert.equal(path.dirname(fs.realpathSync(work)), parent);
  fs.rmSync(work, {recursive: true, maxRetries: 3});
}
