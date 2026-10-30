import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {gzipSync, gunzipSync} from 'node:zlib';
import {root, sha256, listFiles, writeJSON} from './reference-utils.mjs';
import {statusDeliveryDecision} from '../adapters/hollow-wake/integrate-status-delivery.mjs';
import {assertStatusDeliveryObservations} from './status-delivery-observation-checks.mjs';

const args = process.argv.slice(2);
assert(args.length === 2 && args[0] === '--location');
const location = JSON.parse(fs.readFileSync(path.resolve(root, args[1])));
const game = fs.realpathSync(location.game);
assert(game.startsWith(path.join(root, '.artifacts') + path.sep), 'Fault tests require a disposable adapter');
assert.equal(location.statusDeliveryDecision, statusDeliveryDecision);
const installed = fs.realpathSync(path.join(game, 'node_modules/@hollow-wake/engine'));
assert(installed.startsWith(path.join(root, '.artifacts') + path.sep));
const snapshot = dir => Object.fromEntries(listFiles(dir).map(file => [file, sha256(fs.readFileSync(path.join(dir, file)))]));
assert.deepEqual(snapshot(path.join(installed, 'dist')), snapshot(path.join(root, 'dist')));
const sourceBefore = snapshot(path.join(game, 'src')), packageBefore = snapshot(installed);
const files = {
  runtime: path.join(installed, 'dist/status-delivery.js'),
  binding: path.join(game, 'src/engine/statusDelivery.ts'),
  world: path.join(game, 'src/engine/world.ts'),
};
const originals = Object.fromEntries(Object.entries(files).map(([kind, file]) => [kind, fs.readFileSync(file)]));
const acceptanceFile = path.join(root, 'baseline/status-delivery/acceptance.json');
const acceptanceBytes = fs.readFileSync(acceptanceFile), accepted = JSON.parse(acceptanceBytes);
const sealed = new Map([[acceptanceFile, sha256(acceptanceBytes)]]);
for (const [file, hash] of [[accepted.helper, accepted.helperSha256], [accepted.positiveAssertions, accepted.positiveAssertionsSha256],
  [accepted.observations, accepted.compressedSha256], [accepted.sourceBoundary, accepted.sourceBoundarySha256]]) {
  const absolute = path.join(root, file);
  assert.equal(sha256(fs.readFileSync(absolute)), hash, file);
  sealed.set(absolute, hash);
}
const expected = gunzipSync(fs.readFileSync(path.join(root, accepted.observations)));
assert.equal(sha256(expected), accepted.observationsSha256);
const expectedValue = JSON.parse(expected);
assertStatusDeliveryObservations(expectedValue);
const directory = fs.mkdtempSync(path.join(root, '.artifacts/game-status-delivery-faults-'));
const capture = path.join(directory, 'capture.ts');
const helper = fs.readFileSync(path.join(root, accepted.helper), 'utf8');
fs.writeFileSync(capture, helper.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,
  (_all, _quote, file) => JSON.stringify(pathToFileURL(path.join(game, 'src', file + '.ts')).href)), {flag: 'wx'});
const faults = [
  ['siphon-edge', 'runtime', '- actor.radius > radius', '- actor.radius >= radius'],
  ['siphon-team', 'runtime', "effect.from === 'allies' && !ally", "effect.from === 'allies' && ally"],
  ['siphon-clock', 'runtime', "duration: 'remaining'", "duration: 'refreshed'"],
  ['siphon-removal', 'runtime', 'actor.statuses.splice(i, 1);', ''],
  ['recall-zero-scale', 'runtime', 'effect.damageScale ?? 1', 'effect.damageScale || 1'],
  ['recall-breakable', 'runtime', 'if (target.construct?.breakable)', 'if (target.construct)'],
  ['recall-zero-share', 'runtime', 'effect.spearShare ?? 0.5', 'effect.spearShare || 0.5'],
  ['recall-cache-level', 'runtime', 'spear.level !== ports.effectiveLevel(inst)', 'false'],
  ['recall-tree-identity', 'runtime', 'recallSources.set(spear, inst)', 'recallSources.set(spear, spear)'],
  ['recall-kill-credit', 'binding', 'w.kill(target, silent, caster)', 'w.kill(target, silent, target)'],
  ['projectile-direction', 'binding', 'direction: angleTo', 'direction: (from, to) => angleTo(to, from)'],
  ['transplant-duration', 'binding', "w['transplantStatus'](target, status, name, options)", "w['transplantStatus'](target, status, name, {...options, duration: 'refreshed'})"],
  ['siphon-world-area', 'world', 'this.engineStatusDelivery.siphon(caster, fx, aoeScale,', 'this.engineStatusDelivery.siphon(caster, fx, aoeScale * 0.5,'],
  ['recall-world-area', 'world', 'this.engineStatusDelivery.recall(caster, inst, fx, aoeScale,', 'this.engineStatusDelivery.recall(caster, inst, fx, aoeScale * 0.5,'],
  ['selective-retirement', 'world', '!this.engineStatusDelivery.isReturnedFrom(p.inst, inst)', 'this.engineStatusDelivery.isReturnedFrom(p.inst, inst)'],
];
for (const [name, kind, needle] of faults) assert.equal(originals[kind].toString().split(needle).length - 1, 1, name + ' selector');
const expectedErrors = new Map(expectedValue.rows.flatMap(row => row.steps.map(step => [row.name + '/' + step.name, step.error])));
const results = [];
let passed = false;
try {
  for (const [name, kind, needle, replacement] of [['control'], ...faults]) {
    if (needle) fs.writeFileSync(files[kind], originals[kind].toString().replace(needle, replacement));
    const output = path.join(directory, name + '.json'), log = path.join(directory, name + '.txt');
    const fd = fs.openSync(log, 'wx');
    try {
      execFileSync(process.execPath, ['--import', pathToFileURL(path.join(game, 'node_modules/tsx/dist/loader.mjs')).href, capture, output],
        {cwd: game, windowsHide: true, stdio: ['ignore', fd, fd], timeout: 180000});
    } finally {
      fs.closeSync(fd);
      for (const [key, file] of Object.entries(files)) fs.writeFileSync(file, originals[key]);
    }
    const actual = fs.readFileSync(output), value = JSON.parse(actual), matches = actual.equals(expected);
    const compressed = gzipSync(actual, {level: 9});
    assert(gunzipSync(compressed).equals(actual));
    fs.writeFileSync(output + '.gz', compressed, {flag: 'wx'});
    fs.unlinkSync(output);
    const row = {name, kind, detected: name !== 'control' && !matches, matches,
      sha256: sha256(actual), compressedSha256: sha256(compressed), logSha256: sha256(fs.readFileSync(log))};
    results.push(row);
    assert.equal(matches, name === 'control', name);
    assert.equal(value.courses, 88);
    assert.deepEqual(value.rows.map(r => [r.name, r.steps.map(s => s.name)]), expectedValue.rows.map(r => [r.name, r.steps.map(s => s.name)]));
    for (const course of value.rows) for (const step of course.steps) {
      if (step.error) assert.equal(step.error, expectedErrors.get(course.name + '/' + step.name), 'Unrelated exception: ' + name + '/' + course.name);
    }
    if (name === 'control') assertStatusDeliveryObservations(value);
    writeJSON(path.join(directory, 'progress.json'), {directory, results});
    console.log('Verified installed status delivery fault: ' + name);
  }
  passed = true;
} finally {
  for (const [kind, file] of Object.entries(files)) fs.writeFileSync(file, originals[kind]);
  assert.deepEqual(snapshot(path.join(game, 'src')), sourceBefore);
  assert.deepEqual(snapshot(installed), packageBefore);
  for (const [file, hash] of sealed) assert.equal(sha256(fs.readFileSync(file)), hash, file);
  const report = {passed, directory, game, declaredFaults: faults.length, faults: results.filter(r => r.detected).length, results,
    sourceAndPackageRestored: true, expectedFilesRewritten: false, sourceMapSha256: sha256(JSON.stringify(sourceBefore)),
    packageMapSha256: sha256(JSON.stringify(packageBefore)), verificationInputs: Object.fromEntries(sealed)};
  writeJSON(path.join(directory, 'verification.json'), report);
  writeJSON('.artifacts/game-status-delivery-fault-verification.json', report);
  console.log({passed, directory, faults: report.faults});
}
