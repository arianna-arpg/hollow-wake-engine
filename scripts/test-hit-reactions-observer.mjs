import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {gzipSync, gunzipSync} from 'node:zlib';
import ts from 'typescript';
import {root, materialize, verifyReference, sha256, writeJSON} from './reference-utils.mjs';
import {reactionFaults, applyReactionFault} from './hit-reactions-observer-faults.mjs';
import {hitReactionsTree} from '../adapters/hollow-wake/hit-reactions-tree.mjs';
import {assertHitReactionObservations} from './hit-reactions-observation-checks.mjs';

const args = process.argv.slice(2);
assert(args.length === 0 || (args.length === 2 && args[0] === '--acceptance'));
const acceptedFile = path.resolve(root, args[1] ?? 'baseline/hit-reactions/acceptance.json');
const acceptedBytes = fs.readFileSync(acceptedFile), capture = JSON.parse(acceptedBytes);
assert.equal(capture.schemaVersion, 1);
assert.equal(capture.courses, 136);
assert.equal(reactionFaults.length, 55);
assert.deepEqual([...new Set(reactionFaults.map(f => f[1]))].sort((a,b) => a-b), Array.from({length:29}, (_,i) => i));
const tracked = new Map([[acceptedFile, sha256(acceptedBytes)]]);
for (const [file, hash] of [[capture.helper, capture.helperSha256],
  [capture.sourceBoundary, capture.sourceBoundarySha256],
  [capture.observations, capture.compressedSha256],
  [capture.positiveAssertions, capture.positiveAssertionsSha256]]) {
  const absolute = path.join(root, file);
  assert.equal(sha256(fs.readFileSync(absolute)), hash, file);
  tracked.set(absolute, hash);
}
const boundary = JSON.parse(fs.readFileSync(path.join(root, capture.sourceBoundary)));
const lockFile = path.join(root, 'baseline/source-lock.json');
assert.equal(sha256(fs.readFileSync(lockFile)), boundary.sourceLockSha256);
tracked.set(lockFile, boundary.sourceLockSha256);
const expected = gunzipSync(fs.readFileSync(path.join(root, capture.observations)));
assert.equal(sha256(expected), capture.observationsSha256);
const expectedValue = JSON.parse(expected);
assertHitReactionObservations(expectedValue);
const lock = JSON.parse(fs.readFileSync(lockFile));
const directory = fs.mkdtempSync(path.join(root, '.artifacts/hit-reactions-observer-faults-'));
const game = path.join(directory, 'game');
materialize(null, lock, game);
verifyReference(game, lock);
fs.symlinkSync(fs.realpathSync(path.join(root, '.reference/node_modules')), path.join(game, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
const file = path.join(game, 'src/engine/world.ts'), bytes = fs.readFileSync(file);
const {input:source, ast, reactions} = hitReactionsTree(bytes.toString(), true);
for (const [i, row] of boundary.statements.entries()) assert.equal(sha256(reactions[i].getText(ast)), row.sha256);
// Preflight every selector before running expensive native captures.
for (const fault of reactionFaults) {
  const changed = applyReactionFault(source, ast, reactions, fault);
  assert.equal(ts.createSourceFile(file, changed, ts.ScriptTarget.Latest, true).parseDiagnostics.length, 0, fault[0]);
}
const runtime = path.join(directory, 'capture.ts');
const helper = fs.readFileSync(path.join(root, capture.helper), 'utf8');
fs.writeFileSync(runtime, helper.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,
  (_a, _q, f) => JSON.stringify(pathToFileURL(path.join(game, 'src', f + '.ts')).href)), {flag:'wx'});
const errors = data => data.rows.flatMap(r => r.steps.filter(s => !s.error.$undefined).map(s => [r.name, s.error]));
const expectedErrors = errors(expectedValue), results = [];
let passed = false;
try {
  for (const fault of [['control', null], ...reactionFaults]) {
    const [name, index] = fault;
    if (index !== null) fs.writeFileSync(file, applyReactionFault(source, ast, reactions, fault));
    const out = path.join(directory, name + '.json'), log = fs.openSync(path.join(directory, name + '.txt'), 'wx');
    try {
      execFileSync(process.execPath, ['--import', pathToFileURL(path.join(game, 'node_modules/tsx/dist/loader.mjs')).href, runtime, out],
        {cwd:game, stdio:['ignore',log,log], timeout:180000, windowsHide:true});
    } finally { fs.closeSync(log); fs.writeFileSync(file, bytes); }
    const actual = fs.readFileSync(out), matches = actual.equals(expected), value = JSON.parse(actual);
    const compressed = gzipSync(actual, {level:9});
    assert(gunzipSync(compressed).equals(actual));
    fs.writeFileSync(out + '.gz', compressed, {flag:'wx'});
    fs.unlinkSync(out);
    const result = {name, detected:name !== 'control' && !matches, observationsSha256:sha256(actual), compressedSha256:sha256(compressed), matches};
    results.push(result);
    assert.equal(matches, name === 'control', name + ' was not distinguished');
    assert.equal(value.courses, capture.courses);
    assert.deepEqual(value.rows.map(r => r.name), expectedValue.rows.map(r => r.name));
    // A skipped callback may remove its deliberately injected error; new errors cannot count as detection.
    for (const [course, error] of errors(value)) assert.deepEqual(error, expectedErrors.find(e => e[0] === course)?.[1], 'Unrelated exception: ' + name + '/' + course);
    if (name === 'control') { assert.deepEqual(errors(value), expectedErrors); assertHitReactionObservations(value); }
    writeJSON(path.join(directory, 'progress.json'), {directory, results});
    console.log('Verified reaction observer: ' + name);
  }
  passed = true;
} finally {
  fs.writeFileSync(file, bytes);
  verifyReference(game, lock);
  for (const [file, hash] of tracked) assert.equal(sha256(fs.readFileSync(file)), hash, file);
  const report = {passed, directory, game, originalRestored:true, expectedFilesRewritten:false,
    acceptanceFile:acceptedFile, acceptanceSha256:sha256(acceptedBytes), courses:capture.courses,
    helperSha256:capture.helperSha256, expectedSha256:capture.observationsSha256,
    faultDefinitionsSha256:sha256(fs.readFileSync(path.join(root, 'scripts/hit-reactions-observer-faults.mjs'))),
    faults:results.filter(r => r.detected).length, results};
  writeJSON(path.join(directory, 'verification.json'), report);
  writeJSON(path.join(root, '.artifacts/hit-reactions-observer-verification.json'), report);
  console.log({passed, directory, faults:report.faults});
}
