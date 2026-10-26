import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {root, sha256, listFiles, writeJSON} from './reference-utils.mjs';

const argument = name => {
  const at = process.argv.indexOf(name);
  assert(at >= 0 && process.argv[at + 1], name + ' required');
  return path.resolve(process.argv[at + 1]);
};
const game = argument('--game'), dist = argument('--dist'), electron = argument('--electron');
const baseline = path.join(root, 'baseline/milestone-forty-one');
const acceptanceBytes = fs.readFileSync(path.join(baseline, 'buff-ui-acceptance.json'));
const acceptance = JSON.parse(acceptanceBytes), expected = fs.readFileSync(path.join(baseline, 'buff-ui-expected.json'));
const harness = fs.readFileSync(path.join(root, 'adapters/hollow-wake/buffs-ui.cjs'));
const server = fs.readFileSync(path.join(game, 'launcher/server.cjs'));
assert.equal(acceptance.decision, 'native-buff-renderer/v2');
assert.equal(acceptance.environmentRevision.file, 'baseline/milestone-forty-one/buff-ui-environment-decision.json');
const revision = fs.readFileSync(path.join(root, acceptance.environmentRevision.file));
assert.equal(sha256(revision), acceptance.environmentRevision.sha256);
assert.equal(JSON.parse(revision).status, 'accepted-after-two-original-runs-before-revised-candidate');
assert.equal(JSON.parse(revision).expectedSha256, acceptance.expectedSha256);
assert.equal(acceptance.stages, 14);
assert.equal(sha256(expected), acceptance.expectedSha256);
assert.equal(sha256(harness), acceptance.harnessSha256);
assert.equal(sha256(server), acceptance.serverSha256);
assert.deepEqual(JSON.parse(expected).map(r => r.name), acceptance.stageNames);
const snapshot = dir => Object.fromEntries(listFiles(dir).map(f => [f, sha256(fs.readFileSync(path.join(dir, f)))]));
const runtimeDir = path.join(game, 'node_modules/@hollow-wake/engine/dist'), packageDir = path.dirname(runtimeDir);
assert(fs.existsSync(path.join(runtimeDir, 'buffs.js')), 'Requires the installed buff runtime');
assert(fs.readFileSync(path.join(game, 'src/engine/actor.ts'), 'utf8').includes("from '@hollow-wake/engine/combat/buffs'"), 'Requires the buff Actor adapter');
assert(fs.readFileSync(path.join(game, 'src/engine/buffAdapter.ts')).equals(fs.readFileSync(path.join(root, 'adapters/hollow-wake/buffAdapter.ts'))), 'Unexpected native buff binding');
const inputs = {source: snapshot(path.join(game, 'src')), runtime: snapshot(runtimeDir), package: snapshot(packageDir)};
const buildFile = path.join(dist, 'sdk-build.json'), buildBytes = fs.readFileSync(buildFile), build = JSON.parse(buildBytes);
const outputs = () => Object.fromEntries(listFiles(dist).filter(f => f !== 'sdk-build.json').map(f => [f, sha256(fs.readFileSync(path.join(dist, f)))]));
assert(!build.originalItems && !build.originalEscape, 'Use the complete adapted game');
assert.deepEqual(build.sourceSha256, inputs.source, 'Stale renderer source');
assert.deepEqual(build.runtimeSha256, inputs.runtime, 'Stale renderer runtime');
assert.deepEqual(outputs(), build.outputs, 'Renderer outputs changed');
const trial = fs.mkdtempSync(path.join(root, '.artifacts/buff-ui-')), reports = path.join(trial, 'reports');
for (const name of ['balance', 'launcher', 'reports']) fs.mkdirSync(path.join(trial, name));
fs.writeFileSync(path.join(trial, 'balance/buffs-ui.cjs'), harness, {flag: 'wx'});
fs.writeFileSync(path.join(trial, 'launcher/server.cjs'), server, {flag: 'wx'});
const fd = fs.openSync(path.join(trial, 'process.txt'), 'wx');
let passed = false, actualSha256 = null;
console.log('Buff renderer candidate trial: ' + trial);
try {
  execFileSync(electron, [path.join(trial, 'balance/buffs-ui.cjs')], {
    cwd: trial, env: {...process.env, HOLLOW_WAKE_QA_REPORTS: reports, HOLLOW_WAKE_QA_DIST: dist},
    windowsHide: true, stdio: ['ignore', fd, fd], timeout: 210000,
  });
  assert.match(fs.readFileSync(path.join(trial, 'process.txt'), 'utf8'), /PASS: native casts/);
  const actual = fs.readFileSync(path.join(reports, 'buffs-ui.json'));
  actualSha256 = sha256(actual);
  assert(actual.equals(expected), 'Native buff renderer observations differ from retained v0.35');
  passed = true;
  console.log('PASS: all 14 native buff renderer stages match retained v0.35 observations byte-for-byte');
} finally {
  fs.closeSync(fd);
  assert.deepEqual(snapshot(path.join(game, 'src')), inputs.source);
  assert.deepEqual(snapshot(packageDir), inputs.package);
  assert(fs.readFileSync(buildFile).equals(buildBytes));
  assert.deepEqual(outputs(), build.outputs);
  assert(fs.readFileSync(path.join(baseline, 'buff-ui-acceptance.json')).equals(acceptanceBytes));
  assert(fs.readFileSync(path.join(root, acceptance.environmentRevision.file)).equals(revision));
  assert(fs.readFileSync(path.join(baseline, 'buff-ui-expected.json')).equals(expected));
  const receipt = {game, dist, trial, reports, passed, stages: acceptance.stages, harnessSha256: sha256(harness),
    expectedSha256: sha256(expected), actualSha256, rawObservationsByteEqual: passed,
    sourceMapSha256: sha256(JSON.stringify(inputs.source)), runtimeMapSha256: sha256(JSON.stringify(inputs.runtime)),
    buildSha256: sha256(buildBytes), sourceUnchanged: true, wholePackageUnchanged: true, bundleUnchanged: true, scope: acceptance.scope};
  writeJSON(path.join(trial, 'verification.json'), receipt);
  writeJSON(path.join(root, '.artifacts/buff-ui-verification.json'), receipt);
}
