import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {root, listFiles, sha256, writeJSON} from './reference-utils.mjs';

const argument = name => {
  const index = process.argv.indexOf(name);
  assert(index >= 0 && process.argv[index + 1], name + ' required');
  return path.resolve(process.argv[index + 1]);
};
const game = argument('--game'), dist = argument('--dist'), electron = argument('--electron');
const baseline = path.join(root, 'baseline/ready-cooldown-bank');
const acceptanceFile = path.join(baseline, 'renderer-acceptance.json');
const expectedFile = path.join(baseline, 'renderer-expected.json.gz');
const harnessFile = path.join(root, 'adapters/hollow-wake/ready-bank-ui.cjs');
const acceptanceBytes = fs.readFileSync(acceptanceFile), acceptance = JSON.parse(acceptanceBytes);
const compressed = fs.readFileSync(expectedFile), expected = gunzipSync(compressed);
const rawHarness = fs.readFileSync(harnessFile);
const harness = Buffer.from(rawHarness.toString('utf8').replaceAll('\r\n', '\n'));
assert.equal(acceptance.decision, 'native-ready-bank-renderer/v1');
assert.equal(acceptance.status, 'accepted-after-two-native-runs-before-sdk-renderer-comparison');
assert.equal(acceptance.sourceCanonicalization, 'CRLF to LF only');
assert.equal(acceptance.stages, 23);
assert.equal(sha256(compressed), acceptance.expected.compressedSha256);
assert.equal(sha256(expected), acceptance.expected.sha256);
assert.equal(sha256(harness), acceptance.harnessSha256);
assert.deepEqual(JSON.parse(expected).map(row => row.name), acceptance.stageNames);
const server = fs.readFileSync(path.join(game, 'launcher/server.cjs'));
assert.equal(sha256(server), acceptance.serverSha256);
const snapshot = directory => Object.fromEntries(listFiles(directory).map(f => [f, sha256(fs.readFileSync(path.join(directory, f)))]));
const runtimeDir = path.join(game, 'node_modules/@hollow-wake/engine/dist'), packageDir = path.dirname(runtimeDir);
assert(fs.existsSync(path.join(runtimeDir, 'ready-cooldown-bank.js')), 'Ready bank runtime must be installed');
const adapted=fs.readFileSync(path.join(game,"src/engine/assault.ts"),"utf8");
for(const call of ["engineRefundReadyCooldown(","engineConsumeReadyCooldownBank(","enginePublishReadyCooldownBank("])assert(adapted.includes(call),"Ready bank delegation missing: "+call);
const inputs = {source: snapshot(path.join(game, 'src')), runtime: snapshot(runtimeDir), package: snapshot(packageDir)};
const buildFile = path.join(dist, 'sdk-build.json'), buildBytes = fs.readFileSync(buildFile), build = JSON.parse(buildBytes);
const outputs = () => Object.fromEntries(listFiles(dist).filter(f => f !== 'sdk-build.json').map(f => [f, sha256(fs.readFileSync(path.join(dist, f)))]));
assert(!build.originalItems && !build.originalEscape, 'Use the complete adapted game');
assert.deepEqual(build.sourceSha256, inputs.source, 'Stale renderer source');
assert.deepEqual(build.runtimeSha256, inputs.runtime, 'Stale renderer runtime');
assert.deepEqual(outputs(), build.outputs, 'Renderer outputs changed');
const trial = fs.mkdtempSync(path.join(root, '.artifacts/ready-bank-ui-')), reports = path.join(trial, 'reports');
for (const name of ['balance', 'launcher', 'reports']) fs.mkdirSync(path.join(trial, name));
fs.writeFileSync(path.join(trial, 'balance/ready-bank-ui.cjs'), harness, {flag: 'wx'});
fs.writeFileSync(path.join(trial, 'launcher/server.cjs'), server, {flag: 'wx'});
const log = path.join(trial, 'process.txt'), fd = fs.openSync(log, 'wx');
let passed = false, actualSha256 = null;
console.log('Ready bank renderer candidate: ' + trial);
try {
  execFileSync(electron, [path.join(trial, 'balance/ready-bank-ui.cjs')], {
    cwd: trial, env: {...process.env, HOLLOW_WAKE_QA_REPORTS: reports, HOLLOW_WAKE_QA_DIST: dist},
    windowsHide: true, stdio: ['ignore', fd, fd], timeout: 210000,
  });
  assert.match(fs.readFileSync(log, 'utf8'), /PASS: ready bank renderer scenarios; 23 stages/);
  const actual = fs.readFileSync(path.join(reports, 'ready-bank-ui.json'));
  actualSha256 = sha256(actual);
  assert(actual.equals(expected), 'Renderer observations differ from native ready bank');
  passed = true;
  console.log('PASS: all 23 ready bank renderer stages match native observations byte-for-byte');
} finally {
  fs.closeSync(fd);
  assert.deepEqual(snapshot(path.join(game, 'src')), inputs.source);
  assert.deepEqual(snapshot(packageDir), inputs.package);
  assert(fs.readFileSync(buildFile).equals(buildBytes));
  assert.deepEqual(outputs(), build.outputs);
  assert(fs.readFileSync(acceptanceFile).equals(acceptanceBytes));
  assert(fs.readFileSync(expectedFile).equals(compressed));
  assert(fs.readFileSync(harnessFile).equals(rawHarness));
  const receipt = {
    game, dist, trial, reports, passed, stages: acceptance.stages, harnessSha256: sha256(harness),
    acceptanceSha256: sha256(acceptanceBytes), expectedSha256: sha256(expected), actualSha256,
    rawObservationsByteEqual: passed, sourceMapSha256: sha256(JSON.stringify(inputs.source)),
    runtimeMapSha256: sha256(JSON.stringify(inputs.runtime)), buildSha256: sha256(buildBytes),
    sourceUnchanged: true, wholePackageUnchanged: true, bundleUnchanged: true, scope: "Twenty-three actual refund-bank renderer stages; no pixel, physical-input or device-performance equivalence claim.",
  };
  writeJSON(path.join(trial, 'verification.json'), receipt);
  writeJSON(path.join(root, '.artifacts/ready-bank-ui-verification.json'), receipt);
}
