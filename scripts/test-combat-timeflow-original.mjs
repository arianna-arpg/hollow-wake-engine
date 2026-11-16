import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {CombatTimeflow} from '../dist/combat-timeflow.js';
import {sha256} from './reference-utils.mjs';
const probe = process.argv.includes('--probe');
const archive = fs.readFileSync(probe ? '.artifacts/m3-combat-timeflow-probe.json.gz' : 'baseline/combat-timeflow/observations.json.gz');
const bytes = gunzipSync(archive), fixture = JSON.parse(bytes);
assert(fixture.originalOnly);
if (!probe) {
  const accepted = JSON.parse(fs.readFileSync('baseline/combat-timeflow/acceptance.json'));
  assert.equal(sha256(archive), accepted.compressedSha256); assert.equal(sha256(bytes), accepted.sha256);
}
for (const c of fixture.courses) {
  const clock = new CombatTimeflow(id => fixture.status[id]), owner = {id: 1, team: 'player', statuses: []},
    child = {id: 2, team: 'player', owner, statuses: []},
    actors = [owner, child, {id: 3, team: 'player', owner: child, statuses: []}, {id: 4, team: 'enemy', statuses: []}];
  for (const [index, op] of c.ops.entries()) {
    let result;
    switch (op.op) {
      case 'hold': result = clock.hold(structuredClone(op.value)); break;
      case 'frame': result = clock.beginFrame(op.dt); break;
      case 'release': clock.release(op.id); break;
      case 'kind': clock.releaseKind(op.kind); break;
      case 'allow': clock.allowHold = () => op.value; break;
      case 'team': actors.find(a => a.id === op.id).team = op.team; break;
      case 'status': actors.find(a => a.id === op.id).statuses = structuredClone(op.statuses); break;
      default: assert.fail('Unknown original operation');
    }
    assert.deepEqual({result: result ?? null, age: clock.age, active: clock.active, world: clock.worldScale(), overlay: clock.overlay(),
      body: actors.map(a => clock.actorScale(a)), full: actors.map(a => clock.scaleFor(a)), skill: clock.heldBy('skill'), menu: clock.heldBy('menu')}, c.steps[index], c.name + ':' + index);
  }
}
console.log({passed: true, originalCourses: fixture.courses.length, transitions: fixture.courses.reduce((n, c) => n + c.steps.length, 0), allCombatFamiliesQualified: false});
