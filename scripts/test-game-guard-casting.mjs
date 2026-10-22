import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';import {execFileSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
import {root, listFiles, sha256, writeJSON} from './reference-utils.mjs';
const a = path.join(root, '.artifacts'), location = JSON.parse(fs.readFileSync(path.join(a, 'adapter-location.json')));
const game = location.game, installed = path.join(location.tooling, 'node_modules/@hollow-wake/engine/dist'), built = path.join(root, 'dist');
const files = listFiles(built);
assert.deepEqual(listFiles(installed), files);
for (const file of files) assert(fs.readFileSync(path.join(installed, file)).equals(fs.readFileSync(path.join(built, file))), `Stale installed guard-casting: ${file}`);
const output = fs.mkdtempSync(path.join(a, 'game-guard-casting-'));
const bytes = fs.readFileSync(path.join(root, 'reference/export-guard-casting.ts'));
const helper = path.join(game, 'balance', 'sdk-guard-casting-' + randomUUID() + '.ts');
const expected = gunzipSync(fs.readFileSync(path.join(root, 'baseline/milestone-twenty-eight/guard-casting.json.gz')));
const faults = [
  ['unearned-bash', 'if (bashArmed(state) && bashLine(state))', 'if (bashLine(state))'],
  ['pulse-carry-lost', 'state.guardPulseT += interval;', 'state.guardPulseT = interval;'],
  ['inverted-payload-uses-remaining', 'state.bashLow ? capacity - shield : shield', 'shield'],
  ['release-cooldown-omitted', 'p.stampCooldown(actor, state, cooldown);', 'void cooldown;'],
  ['warning-never-releases', "state.held = finite(p.time(), 'Guard world time') + 1e-9 < finite(state.aiGuardReleaseAt, 'Guard warning deadline');", 'state.held = true;'],
];
const target = path.join(installed, 'guard-casting.js'), original = fs.readFileSync(target, 'utf8'), reports = [];
const capture = label => {
  const file = path.join(output, label + '.json');
  execFileSync(process.execPath, ['--import', 'tsx', helper, file], {cwd: game, stdio: 'pipe'});
  return fs.readFileSync(file);
};
try {
  fs.writeFileSync(helper, bytes, {flag: 'wx'});
  for (const config of ['tsconfig.json', 'tsconfig.launcher.json', 'tsconfig.sim.json']) {
    execFileSync(process.execPath, [path.join(game, 'node_modules/typescript/bin/tsc'), '-p', config], {cwd: game, stdio: 'inherit'});
  }
  assert(capture('accepted').equals(expected), 'Installed guard-casting observations changed');
  for (const [name, before, after] of faults) {
    assert(original.includes(before), 'Moved guard-casting fault: ' + name);
    let detected = false;
    try {
      fs.writeFileSync(target, original.replace(before, after));
      try { detected = !capture('fault-' + name).equals(expected); }
      catch (error) {
        const detail = String(error.stdout ?? '') + String(error.stderr ?? '');
        assert(error.status !== undefined && /AssertionError/.test(detail) && !/SyntaxError|ERR_MODULE_NOT_FOUND/.test(detail), 'Fault must reach behavior: ' + detail);
        detected = true;
      }
    } finally { fs.writeFileSync(target, original); }
    assert(detected, 'Undetected guard-casting fault: ' + name);
    reports.push({name, detected});
  }
} finally {
  if (fs.existsSync(helper) && fs.readFileSync(helper).equals(bytes)) fs.unlinkSync(helper);
}
for (const file of files) assert(fs.readFileSync(path.join(installed, file)).equals(fs.readFileSync(path.join(built, file))), `Guard casting fault was not restored: ${file}`);
writeJSON(path.join(a, 'game-guard-casting-verification.json'), {game, output,
  version: JSON.parse(fs.readFileSync(path.join(location.tooling, 'node_modules/@hollow-wake/engine/package.json'))).version,
  packageIntegrity: location.integrity, installedRuntimeFilesMatchBuild: files.length, gameLauncherAndCaptureTypeChecks: true,
  fixtureSha256: sha256(expected), courses: 53, transitions: 256, readinessCases: 284, actualGameGuardBashesPulsesAndWarnings: true, installedFaults: reports, allInstalledFilesRestored: true});
console.log('Installed guard-casting matches the original; five behavioral faults detected and restored.');
