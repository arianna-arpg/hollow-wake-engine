import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {root, sha256, listFiles, verifyReference, writeJSON} from './reference-utils.mjs';
import {assertProcDeliveryObservations} from './proc-delivery-observation-checks.mjs';

const options = new Map(), args = process.argv.slice(2);
assert.equal(args.length % 2, 0);
for (let i = 0; i < args.length; i += 2) {
  assert(['--game', '--acceptance'].includes(args[i]) && !options.has(args[i]), args[i]);
  options.set(args[i], args[i + 1]);
}
const game = fs.realpathSync(path.resolve(root, options.get('--game') ?? '.reference'));
const acceptanceFile = path.resolve(root, options.get('--acceptance') ?? 'baseline/proc-delivery/acceptance.json');
const acceptanceBytes = fs.readFileSync(acceptanceFile), accepted = JSON.parse(acceptanceBytes);
const inputs = new Map([[acceptanceFile, sha256(acceptanceBytes)]]);
for (const [file, hash] of [[accepted.helper, accepted.helperSha256], [accepted.positiveAssertions, accepted.positiveAssertionsSha256],
  [accepted.sourceBoundary, accepted.sourceBoundarySha256], [accepted.observations, accepted.compressedSha256]]) {
  const absolute = path.resolve(root, file); assert.equal(sha256(fs.readFileSync(absolute)), hash, file); inputs.set(absolute, hash);
}
const boundary = JSON.parse(fs.readFileSync(path.resolve(root, accepted.sourceBoundary)));
const lockFile = path.join(root, 'baseline/source-lock.json');
assert.equal(sha256(fs.readFileSync(lockFile)), boundary.sourceLockSha256); inputs.set(lockFile, boundary.sourceLockSha256);
if (!options.has('--game')) verifyReference(game, JSON.parse(fs.readFileSync(lockFile)));
const expected = gunzipSync(fs.readFileSync(path.resolve(root, accepted.observations)));
assert.equal(sha256(expected), accepted.observationsSha256); assertProcDeliveryObservations(JSON.parse(expected));
const snapshot = directory => Object.fromEntries(listFiles(directory).map(file => [file, sha256(fs.readFileSync(path.join(directory, file)))]));
const before = snapshot(path.join(game, 'src'));
const runtimeDirectory = path.join(root, 'dist'), runtime = fs.existsSync(runtimeDirectory) ? snapshot(runtimeDirectory) : null;
const packageDirectory = path.join(game, 'node_modules/@hollow-wake/engine');
const installed = fs.existsSync(packageDirectory) ? snapshot(packageDirectory) : null;
const output = fs.mkdtempSync(path.join(root, '.artifacts/reference-proc-delivery-'));
writeJSON('.artifacts/proc-delivery-reference-running.json', {output, game});
const helper = fs.readFileSync(path.join(root, accepted.helper), 'utf8');
const runtimeFile = path.join(output, 'capture.ts'), typed = path.join(output, 'capture.typed.ts'), observations = path.join(output, 'observations.json');
const imports = /(['"])\.\.\/src\/([^'"]+)\1/g;
fs.writeFileSync(runtimeFile, helper.replace(imports, (_a, _q, file) => JSON.stringify(pathToFileURL(path.join(game, 'src', file + '.ts')).href)), {flag: 'wx'});
fs.writeFileSync(typed, helper.replace(imports, (_a, _q, file) => JSON.stringify(path.relative(output, path.join(game, 'src', file)).replaceAll('\\', '/'))), {flag: 'wx'});
writeJSON(path.join(output, 'tsconfig.json'), {extends: path.join(game, 'tsconfig.sim.json'), compilerOptions: {typeRoots: [path.join(game, 'node_modules/@types')]}, include: [typed], exclude: []});
const report = {passed: false, game, output, courses: accepted.courses, acceptanceSha256: sha256(acceptanceBytes),
  helperSha256: accepted.helperSha256, sourceMapSha256: sha256(JSON.stringify(before)),
  runtimeMapSha256: runtime ? sha256(JSON.stringify(runtime)) : null, installedMapSha256: installed ? sha256(JSON.stringify(installed)) : null,
  expectedFilesRewritten: false, results: []};
try {
  for (const [name, command] of [
    ['types', [path.join(game, 'node_modules/typescript/bin/tsc'), '-p', path.join(output, 'tsconfig.json')]],
    ['capture', ['--import', pathToFileURL(path.join(game, 'node_modules/tsx/dist/loader.mjs')).href, runtimeFile, observations]],
  ]) {
    const log = path.join(output, name + '.txt'), fd = fs.openSync(log, 'wx');
    try { execFileSync(process.execPath, command, {cwd: game, windowsHide: true, timeout: 300000, stdio: ['ignore', fd, fd]}); }
    finally { fs.closeSync(fd); }
    report.results.push({name, passed: true, logSha256: sha256(fs.readFileSync(log))});
    writeJSON(path.join(output, 'progress.json'), report); console.log(name + ': passed');
  }
  const actual = fs.readFileSync(observations);
  report.observationsSha256 = sha256(actual);
  report.independentChecks = assertProcDeliveryObservations(JSON.parse(actual));
  assert(actual.equals(expected), 'Proc delivery trace differs from accepted original');
  report.passed = true;
} finally {
  assert.deepEqual(snapshot(path.join(game, 'src')), before);
  if (runtime) assert.deepEqual(snapshot(runtimeDirectory), runtime);
  if (installed) assert.deepEqual(snapshot(packageDirectory), installed);
  for (const [file, hash] of inputs) assert.equal(sha256(fs.readFileSync(file)), hash, file);
  report.inputsUnchanged = true;
  writeJSON(path.join(output, 'verification.json'), report); writeJSON('.artifacts/proc-delivery-reference-verification.json', report);
  console.log({passed: report.passed, game, output, courses: report.courses, observationsSha256: report.observationsSha256});
}
