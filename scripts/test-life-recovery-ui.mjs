import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {root, listFiles, sha256, writeJSON} from './reference-utils.mjs';

const argument = name => {
  const at = process.argv.indexOf(name);
  assert(at >= 0 && process.argv[at + 1], name + ' required');
  return path.resolve(process.argv[at + 1]);
};
const game = argument('--game'), dist = argument('--dist'), electron = argument('--electron');
const baseline = path.join(root, 'baseline/milestone-forty-two');
const acceptanceBytes = fs.readFileSync(path.join(baseline, 'healing-ui-acceptance.json'));
const acceptance = JSON.parse(acceptanceBytes);
const expected = fs.readFileSync(path.join(baseline, 'healing-ui-expected.json'));
const harness = fs.readFileSync(path.join(root, 'adapters/hollow-wake/life-recovery-ui.cjs'));
const formatBytes = fs.readFileSync(path.join(baseline, 'healing-ui-format-decision.json'));
const format = JSON.parse(formatBytes);
assert.equal(format.decision, 'healing-ui-canonical-source/v1');
assert.equal(format.originalAcceptanceSha256, sha256(acceptanceBytes));
const capturedSource = fs.readFileSync(path.join(root, format.capturedSource.file));
assert.equal(sha256(capturedSource), format.capturedSource.compressedSha256);
const capturedHarness = gunzipSync(capturedSource);
assert.equal(sha256(capturedHarness), acceptance.harnessSha256);
assert.equal(sha256(capturedHarness), format.capturedSource.sha256);
assert.equal(harness.toString('utf8'), capturedHarness.toString('utf8').replaceAll('\r\n', '\n'));
assert.equal(format.expectedSha256, acceptance.expectedSha256);
const server = fs.readFileSync(path.join(game, 'launcher/server.cjs'));
assert.equal(acceptance.decision, 'native-healing-renderer/v1');
assert.equal(acceptance.status, 'accepted-after-two-native-runs-before-sdk-renderer-comparison');
assert.equal(acceptance.stages, 15);
assert.equal(sha256(expected), acceptance.expectedSha256);
assert.equal(sha256(harness), format.canonicalSource.sha256);
assert.equal(sha256(server), acceptance.serverSha256);
assert.deepEqual(JSON.parse(expected).map(row => row.name), acceptance.stageNames);
const snapshot = directory => Object.fromEntries(listFiles(directory).map(f => [f, sha256(fs.readFileSync(path.join(directory, f)))]));
const runtimeDir = path.join(game, 'node_modules/@hollow-wake/engine/dist'), packageDir = path.dirname(runtimeDir);
assert(fs.existsSync(path.join(runtimeDir, 'life-recovery.js')), 'Requires the installed recovery runtime');
assert(fs.readFileSync(path.join(game, 'src/engine/actor.ts'), 'utf8').includes("from '@hollow-wake/engine/combat/recovery'"), 'Requires the healing Actor adapter');
assert(fs.readFileSync(path.join(game, 'src/engine/lifeRecoveryAdapter.ts')).equals(fs.readFileSync(path.join(root, 'adapters/hollow-wake/lifeRecoveryAdapter.ts'))), 'Unexpected native recovery binding');
const inputs = {source: snapshot(path.join(game, 'src')), runtime: snapshot(runtimeDir), package: snapshot(packageDir)};
const buildFile = path.join(dist, 'sdk-build.json'), buildBytes = fs.readFileSync(buildFile), build = JSON.parse(buildBytes);
const outputs = () => Object.fromEntries(listFiles(dist).filter(f => f !== 'sdk-build.json').map(f => [f, sha256(fs.readFileSync(path.join(dist, f)))]));
assert(!build.originalItems && !build.originalEscape, 'Use the complete adapted game');
assert.deepEqual(build.sourceSha256, inputs.source, 'Stale renderer source');
assert.deepEqual(build.runtimeSha256, inputs.runtime, 'Stale renderer runtime');
assert.deepEqual(outputs(), build.outputs, 'Renderer outputs changed');
const trial = fs.mkdtempSync(path.join(root, '.artifacts/healing-ui-')), reports = path.join(trial, 'reports');
for (const name of ['balance', 'launcher', 'reports']) fs.mkdirSync(path.join(trial, name));
fs.writeFileSync(path.join(trial, 'balance/healing-ui.cjs'), harness, {flag: 'wx'});
fs.writeFileSync(path.join(trial, 'launcher/server.cjs'), server, {flag: 'wx'});
const fd = fs.openSync(path.join(trial, 'process.txt'), 'wx');
let passed = false, actualSha256 = null;
console.log('Healing renderer candidate trial: ' + trial);
try {
  execFileSync(electron, [path.join(trial, 'balance/healing-ui.cjs')], {
    cwd: trial, env: {...process.env, HOLLOW_WAKE_QA_REPORTS: reports, HOLLOW_WAKE_QA_DIST: dist},
    windowsHide: true, stdio: ['ignore', fd, fd], timeout: 210000,
  });
  assert.match(fs.readFileSync(path.join(trial, 'process.txt'), 'utf8'), /PASS: native healing input/);
  const actual = fs.readFileSync(path.join(reports, 'healing-ui.json'));
  actualSha256 = sha256(actual);
  assert(actual.equals(expected), 'Healing renderer observations differ from retained native healing');
  passed = true;
  console.log('PASS: all 15 healing renderer stages match native observations byte-for-byte');
} finally {
  fs.closeSync(fd);
  assert.deepEqual(snapshot(path.join(game, 'src')), inputs.source);
  assert.deepEqual(snapshot(packageDir), inputs.package);
  assert(fs.readFileSync(buildFile).equals(buildBytes));
  assert.deepEqual(outputs(), build.outputs);
  assert(fs.readFileSync(path.join(baseline, 'healing-ui-acceptance.json')).equals(acceptanceBytes));
  assert(fs.readFileSync(path.join(baseline, 'healing-ui-expected.json')).equals(expected));
  assert(fs.readFileSync(path.join(baseline, 'healing-ui-format-decision.json')).equals(formatBytes));
  assert(fs.readFileSync(path.join(root, format.capturedSource.file)).equals(capturedSource));
  const receipt = {
    game, dist, trial, reports, passed, stages: acceptance.stages, harnessSha256: sha256(harness),
    capturedHarnessSha256: acceptance.harnessSha256, sourceFormatRevisionSha256: sha256(formatBytes),
    expectedSha256: sha256(expected), actualSha256, rawObservationsByteEqual: passed,
    sourceMapSha256: sha256(JSON.stringify(inputs.source)), runtimeMapSha256: sha256(JSON.stringify(inputs.runtime)),
    buildSha256: sha256(buildBytes), sourceUnchanged: true, wholePackageUnchanged: true, bundleUnchanged: true, scope: acceptance.scope,
  };
  writeJSON(path.join(trial, 'verification.json'), receipt);
  writeJSON(path.join(root, '.artifacts/healing-ui-verification.json'), receipt);
}
