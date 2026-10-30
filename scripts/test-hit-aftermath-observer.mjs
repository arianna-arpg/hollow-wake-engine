import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {gzipSync, gunzipSync} from 'node:zlib';
import ts from 'typescript';
import {root, materialize, verifyReference, sha256, writeJSON} from './reference-utils.mjs';
import {aftermathFaults, applyAftermathFault} from './hit-aftermath-observer-faults.mjs';
import {hitAftermathTree} from '../adapters/hollow-wake/hit-aftermath-tree.mjs';
import {assertHitAftermathObservations} from './hit-aftermath-observation-checks.mjs';

const args = process.argv.slice(2);
assert(args.length === 0 || (args.length === 2 && args[0] === '--acceptance'));
const acceptedFile = path.resolve(root, args[1] ?? 'baseline/hit-aftermath/acceptance.json');
const acceptedBytes = fs.readFileSync(acceptedFile), capture = JSON.parse(acceptedBytes);
assert.equal(capture.schemaVersion, 1);
assert.equal(capture.courses, 260);
assert.equal(aftermathFaults.length, 101);
assert.deepEqual([...new Set(aftermathFaults.filter(f=>f[1]==='inner').map(f=>f[2]))].sort((a,b)=>a-b),Array.from({length:16},(_,i)=>50+i));
const tracked = new Map([[acceptedFile, sha256(acceptedBytes)]]);
for(const file of ['scripts/test-hit-aftermath-observer.mjs','scripts/hit-aftermath-observer-faults.mjs','adapters/hollow-wake/hit-aftermath-tree.mjs']){
  const absolute=path.join(root,file);tracked.set(absolute,sha256(fs.readFileSync(absolute)));
}
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
assertHitAftermathObservations(expectedValue);
const lock = JSON.parse(fs.readFileSync(lockFile));
const directory = fs.mkdtempSync(path.join(root, '.artifacts/hit-aftermath-observer-faults-'));
const game = path.join(directory, 'game');
materialize(null, lock, game);
verifyReference(game, lock);
fs.symlinkSync(fs.realpathSync(path.join(root, '.reference/node_modules')), path.join(game, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
const file = path.join(game, 'src/engine/world.ts'), bytes = fs.readFileSync(file);
const tree = hitAftermathTree(bytes.toString(), true);
for (const row of boundary.statements) assert.equal(sha256(tree[row.section==='inner'?'inner':'top'][row.index].getText(tree.ast)),row.sha256);
// Preflight every selector before running expensive native captures.
for (const fault of aftermathFaults) {
  const changed = applyAftermathFault(tree, fault);
  assert.equal(ts.createSourceFile(file, changed, ts.ScriptTarget.Latest, true).parseDiagnostics.length, 0, fault[0]);
}
const runtime = path.join(directory, 'capture.ts');
const helper = fs.readFileSync(path.join(root, capture.helper), 'utf8');
fs.writeFileSync(runtime, helper.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,
  (_a, _q, f) => JSON.stringify(pathToFileURL(path.join(game, 'src', f + '.ts')).href)), {flag:'wx'});
const errors = data => data.rows.flatMap(r => r.steps.filter(s => !s.error.$undefined).map(s => [r.name, s.error]));
const expectedErrors = errors(expectedValue), results = [];
// Repaired coverage seams run first, followed by the same complete fault set.
// Sharing needs native recovery before its refund; story filters need distinct
// attacker/victim stories so the enemy query cannot mask the victim filter.
const first=new Set(['spread-story','splash-story','share-ceiling']);
const orderedFaults=[...aftermathFaults.filter(f=>first.has(f[0])),...aftermathFaults.filter(f=>!first.has(f[0]))];
assert.equal(orderedFaults.length,aftermathFaults.length);
assert.equal(new Set(orderedFaults.map(f=>f[0])).size,aftermathFaults.length);
let passed = false;
try {
  for (const fault of [['control', null], ...orderedFaults]) {
    const [name, index] = fault;
    if (index !== null) fs.writeFileSync(file, applyAftermathFault(tree, fault));
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
    if (name === 'control') { assert.deepEqual(errors(value), expectedErrors); assertHitAftermathObservations(value); }
    writeJSON(path.join(directory, 'progress.json'), {directory, results});
    console.log('Verified aftermath observer: ' + name);
  }
  passed = true;
} finally {
  fs.writeFileSync(file, bytes);
  verifyReference(game, lock);
  for (const [file, hash] of tracked) assert.equal(sha256(fs.readFileSync(file)), hash, file);
  const report = {passed, directory, game, originalRestored:true, expectedFilesRewritten:false,
    acceptanceFile:acceptedFile, acceptanceSha256:sha256(acceptedBytes), courses:capture.courses,
    helperSha256:capture.helperSha256, expectedSha256:capture.observationsSha256,
    faultDefinitionsSha256:sha256(fs.readFileSync(path.join(root, 'scripts/hit-aftermath-observer-faults.mjs'))),
    executionOrder:orderedFaults.map(f=>f[0]),verificationInputs:Object.fromEntries(tracked),
    faults:results.filter(r => r.detected).length, results};
  writeJSON(path.join(directory, 'verification.json'), report);
  writeJSON(path.join(root, '.artifacts/hit-aftermath-observer-verification.json'), report);
  console.log({passed, directory, faults:report.faults});
}
