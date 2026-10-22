import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { root, listFiles, sha256, writeJSON } from './reference-utils.mjs';

const artifacts = path.join(root, '.artifacts');
const location = JSON.parse(fs.readFileSync(path.join(artifacts, 'adapter-location.json')));
const installed = path.join(location.tooling, 'node_modules/@hollow-wake/engine');
assert.equal(fs.realpathSync(path.join(location.game, 'node_modules/@hollow-wake/engine')), fs.realpathSync(installed), 'Game resolves a different SDK installation');
for (const name of ['m30-adapter-location.json', 'm31-adapter-location.json', 'm32-adapter-location.json']) {
  const file = path.join(artifacts, name);
  if (!fs.existsSync(file)) continue;
  const retained = JSON.parse(fs.readFileSync(file));
  assert.notEqual(fs.realpathSync(path.join(retained.tooling, 'node_modules/@hollow-wake/engine')), fs.realpathSync(installed), 'Refusing to mutate a retained control');
}
const built = path.join(root, 'dist'), files = listFiles(built);
const world = path.join(location.game, 'src/engine/world.ts'), worldBytes = fs.readFileSync(world);
assert(worldBytes.includes('this.sdkSkillRequest.preflight'), 'Request policy is not integrated');
function verifyInstalled() {
  assert.deepEqual(listFiles(path.join(installed, 'dist')), files);
  for (const file of files) assert(fs.readFileSync(path.join(installed, 'dist', file)).equals(
    fs.readFileSync(path.join(built, file))), 'Stale or unrestored installed request: ' + file);
  assert(fs.readFileSync(world).equals(worldBytes), 'Host request source was not restored');
}
verifyInstalled();
const baseline = path.join(root, 'baseline/milestone-thirty-three');
const acceptance = JSON.parse(fs.readFileSync(path.join(baseline, 'acceptance.json')));
const output = fs.mkdtempSync(path.join(artifacts, 'game-skill-request-'));
const helpers = acceptance.fixtures.map(row => {
  const source = fs.readFileSync(path.join(root, 'reference/export-' + row.name + '.ts'));
  const compressed = fs.readFileSync(path.join(baseline, row.name + '.json.gz')), expected = gunzipSync(compressed);
  assert.equal(sha256(source), row.helperSha256); assert.equal(sha256(compressed), row.compressedSha256);
  assert.equal(sha256(expected), row.fixtureSha256);
  return { ...row, source, expected, helper: path.join(location.game, 'balance/sdk-request-' + randomUUID() + '.ts') };
});
function capture(row, label) {
  const file = path.join(output, row.name + '-' + label + '.json');
  const stdout = execFileSync(process.execPath, ['--import', 'tsx', row.helper, file], {
    cwd: location.game, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  fs.writeFileSync(path.join(output, row.name + '-' + label + '.txt'), stdout);
  const actual = fs.readFileSync(file);
  assert(actual.equals(row.expected), 'Raw request observations changed: ' + row.name);
  return { name: row.name, sha256: sha256(actual), rawByteEqual: true };
}
const nativeRequestCall = worldBytes.includes('this.sdkSkillDispatch.request')
  ? ['return this.sdkSkillDispatch.request(caster, inst, aim, seatPress);', 'return false;']
  : ['const sdkRequestResult = this.sdkSkillRequest.preflight(caster, inst, aim, seatPress);', 'const sdkRequestResult = false;'];
const faults = [
  ['request-seal-ignored', 'if (seal) {', 'if (false) {'],
  ['request-held-struggle-lost', 'hold.struggle += p.mashPress();', 'hold.struggle += 0;'],
  ['request-replenish-forget-lost', 'p.forgetReplenishment(actor, inst);', '/* lost forget */'],
  ['request-life-endpoint-closed', 'actor.life > delivery.lockAboveLife', 'actor.life >= delivery.lockAboveLife'],
  ['request-depth-retained', 'inst.state.trigDepth = 0;', 'inst.state.trigDepth = 1;'],
  ['request-admission-ignored', '!p.canUse(actor, inst)', 'false'],
  ['request-native-disconnected', ...nativeRequestCall, true],
];
const reports = [], observations = [];
try {
  for (const row of helpers) fs.writeFileSync(row.helper, row.source, { flag: 'wx' });
  for (const config of ['tsconfig.json', 'tsconfig.launcher.json', 'tsconfig.sim.json']) {
    execFileSync(process.execPath, [path.join(location.game, 'node_modules/typescript/bin/tsc'), '-p', config], { cwd: location.game, stdio: 'inherit' });
  }
  for (const row of helpers) observations.push(capture(row, 'candidate'));
  if (!process.argv.includes('--skip-faults')) for (const [name, before, after, native] of faults) {
    const target = native ? world : path.join(installed, 'dist/skill-request.js'), original = fs.readFileSync(target), source = original.toString();
    assert.equal(source.split(before).length, 2, 'Fault site moved: ' + name);
    let detected = false;
    try {
      fs.writeFileSync(target, source.replace(before, after));
      try { capture(helpers[0], 'fault-' + name); }
      catch (error) {
        const detail = String(error.stdout ?? '') + String(error.stderr ?? '');
        assert(error.code === 'ERR_ASSERTION' || error.status !== undefined && /AssertionError/.test(detail)
          && !/SyntaxError|ERR_MODULE_NOT_FOUND|TypeError/.test(detail), 'Fault did not reach behavior: ' + detail);
        fs.writeFileSync(path.join(output, name + '-detected.txt'), String(error) + '\n' + detail);
        detected = true;
      }
    } finally { fs.writeFileSync(target, original); }
    assert(detected, 'Undetected installed fault: ' + name);
    reports.push({ name, detected }); console.log('Detected installed fault: ' + name);
  }
} finally {
  for (const row of helpers) if (fs.existsSync(row.helper) && fs.readFileSync(row.helper).equals(row.source)) fs.unlinkSync(row.helper);
  verifyInstalled();
}
writeJSON(path.join(artifacts, 'game-skill-request-verification.json'), {
  game: location.game, output, version: JSON.parse(fs.readFileSync(path.join(installed, 'package.json'))).version,
  packageIntegrity: location.integrity, installedRuntimeFilesMatchBuild: files.length,
  gameLauncherAndCaptureTypeChecks: true, fixtures: acceptance.fixtures, observations,
  installedFaults: reports, allInstalledFilesAndHostRestored: true,
});
console.log('Installed request policy matches all 68 original courses and 71 transitions without projection.');
