import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {gzipSync, gunzipSync} from 'node:zlib';
import ts from 'typescript';
import {root, materialize, verifyReference, sha256, writeJSON} from './reference-utils.mjs';
import {procDeliveryFaults, applyProcDeliveryFault} from './proc-delivery-observer-faults.mjs';
import {procDeliveryTree} from '../adapters/hollow-wake/proc-delivery-tree.mjs';
import {assertProcDeliveryObservations} from './proc-delivery-observation-checks.mjs';

const args = process.argv.slice(2);
assert(args.length === 0 || args.length === 2 && args[0] === '--acceptance');
const acceptanceFile = path.resolve(root, args[1] ?? 'baseline/proc-delivery/acceptance.json');
const acceptanceBytes = fs.readFileSync(acceptanceFile), accepted = JSON.parse(acceptanceBytes);
const inputs = new Map([[acceptanceFile, sha256(acceptanceBytes)]]);
for (const file of ['scripts/test-proc-delivery-observer.mjs', 'scripts/proc-delivery-observer-faults.mjs', 'adapters/hollow-wake/proc-delivery-tree.mjs']) {
  inputs.set(path.join(root, file), sha256(fs.readFileSync(path.join(root, file))));
}
for (const [file, hash] of [[accepted.helper, accepted.helperSha256], [accepted.positiveAssertions, accepted.positiveAssertionsSha256],
  [accepted.sourceBoundary, accepted.sourceBoundarySha256], [accepted.observations, accepted.compressedSha256]]) {
  const absolute = path.resolve(root, file); assert.equal(sha256(fs.readFileSync(absolute)), hash, file); inputs.set(absolute, hash);
}
const boundary = JSON.parse(fs.readFileSync(path.resolve(root, accepted.sourceBoundary)));
const lockFile = path.join(root, 'baseline/source-lock.json'), lockBytes = fs.readFileSync(lockFile), lock = JSON.parse(lockBytes);
assert.equal(sha256(lockBytes), boundary.sourceLockSha256); inputs.set(lockFile, sha256(lockBytes));
const expectedBytes = gunzipSync(fs.readFileSync(path.resolve(root, accepted.observations)));
assert.equal(sha256(expectedBytes), accepted.observationsSha256);
const expected = JSON.parse(expectedBytes); assertProcDeliveryObservations(expected);
assert.equal(procDeliveryFaults.length, 63);
assert.equal(new Set(procDeliveryFaults.map(f => f[0])).size, procDeliveryFaults.length);
const expectedRows = new Map(expected.rows.map(r => [r.name, r]));
const directory = fs.mkdtempSync(path.join(root, '.artifacts/proc-delivery-observer-faults-'));
const game = path.join(directory, 'game');
writeJSON('.artifacts/proc-delivery-observer-running.json', {directory});
materialize(null, lock, game); verifyReference(game, lock);
fs.symlinkSync(fs.realpathSync(path.join(root, '.reference/node_modules')), path.join(game, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
const sourceFile = path.join(game, 'src/engine/world.ts'), original = fs.readFileSync(sourceFile), tree = procDeliveryTree(original.toString());
for (const [name, row] of Object.entries(boundary.maps.original.methods)) assert.equal(sha256(tree.methods[name].getText(tree.ast)), row.sha256, name);
for (const [name, row] of Object.entries(boundary.maps.original.branches)) assert.equal(sha256(tree.branches[name].getText(tree.ast)), row.sha256, name);
// Catch a bad edit before spending time executing any behavioral course.
for (const fault of procDeliveryFaults) assert.equal(ts.createSourceFile('world.ts', applyProcDeliveryFault(tree, fault), ts.ScriptTarget.Latest, true).parseDiagnostics.length, 0, fault[0]);
const helper = fs.readFileSync(path.join(root, accepted.helper), 'utf8'), runtime = path.join(directory, 'capture.ts');
fs.writeFileSync(runtime, helper.replace(/(['"])\.\.\/src\/([^'"]+)\1/g, (_a, _q, f) => JSON.stringify(pathToFileURL(path.join(game, 'src', f + '.ts')).href)), {flag: 'wx'});
const results = [], controlled = new Set(); let passed = false;
function capture(name, course, fault) {
  assert(expectedRows.has(course), course);
  if (fault) fs.writeFileSync(sourceFile, applyProcDeliveryFault(tree, fault));
  const output = path.join(directory, name + '.json'), log = path.join(directory, name + '.txt'), fd = fs.openSync(log, 'wx');
  const started = performance.now();
  try {
    execFileSync(process.execPath, ['--import', pathToFileURL(path.join(game, 'node_modules/tsx/dist/loader.mjs')).href, runtime, output, course],
      {cwd: game, windowsHide: true, timeout: 180000, stdio: ['ignore', fd, fd]});
  } finally { fs.closeSync(fd); fs.writeFileSync(sourceFile, original); }
  const bytes = fs.readFileSync(output), value = JSON.parse(bytes), compressed = gzipSync(bytes, {level: 9});
  assert(gunzipSync(compressed).equals(bytes)); fs.writeFileSync(output + '.gz', compressed, {flag: 'wx'}); fs.unlinkSync(output);
  assert.equal(value.schemaVersion, expected.schemaVersion); assert.equal(value.courses, 1); assert.equal(value.rows.length, 1);
  assert.deepEqual(value.authored, expected.authored, name + ' authored content changed');
  const row = value.rows[0], correct = expectedRows.get(course);
  assert.equal(row.name, course); assert.deepEqual(row.steps.map(s => s.name), correct.steps.map(s => s.name));
  // A syntax failure, missed callback, or new exception cannot count as fault detection.
  assert.deepEqual(row.steps.map(s => [s.error, s.expectedError]), correct.steps.map(s => [s.error, s.expectedError]), name + ' unrelated error');
  const matches = JSON.stringify(row) === JSON.stringify(correct);
  results.push({name, course, control: !fault, matches, detected: !!fault && !matches, elapsedMs: performance.now() - started,
    observationsSha256: sha256(bytes), rowSha256: sha256(JSON.stringify(row)), expectedRowSha256: sha256(JSON.stringify(correct)),
    compressedSha256: sha256(compressed), logSha256: sha256(fs.readFileSync(log))});
  writeJSON(path.join(directory, 'progress.json'), {directory, results});
  assert.equal(matches, !fault, name + (fault ? ' not distinguished' : ' focused control differs from full capture'));
  console.log('Verified proc observer: ' + name);
}
try {
  for (const fault of procDeliveryFaults) {
    const course = fault[4];
    if (!controlled.has(course)) { capture('control-' + course, course); controlled.add(course); }
    capture(fault[0], course, fault);
  }
  passed = true;
} finally {
  fs.writeFileSync(sourceFile, original); verifyReference(game, lock);
  for (const [file, hash] of inputs) assert.equal(sha256(fs.readFileSync(file)), hash, file);
  const report = {passed, directory, game, originalRestored: true, expectedFilesRewritten: false,
    acceptanceFile, acceptanceSha256: sha256(acceptanceBytes), helperSha256: accepted.helperSha256, expectedSha256: accepted.observationsSha256,
    scope: 'Focused real-original-source mutations. Each positive selector first matches its row in the complete capture.',
    courses: expected.courses, controls: controlled.size, faults: results.filter(r => r.detected).length,
    faultDefinitionsSha256: sha256(fs.readFileSync(path.join(root, 'scripts/proc-delivery-observer-faults.mjs'))), verificationInputs: Object.fromEntries(inputs), results};
  writeJSON(path.join(directory, 'verification.json'), report); writeJSON('.artifacts/proc-delivery-observer-verification.json', report);
  console.log({passed, directory, controls: report.controls, faults: report.faults});
}
