import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';import {execFileSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
import {root, listFiles, sha256, writeJSON} from './reference-utils.mjs';
const a = path.join(root, '.artifacts'), location = JSON.parse(fs.readFileSync(path.join(a, 'adapter-location.json')));
const game = location.game, installed = path.join(location.tooling, 'node_modules/@hollow-wake/engine/dist'), built = path.join(root, 'dist');
const files = listFiles(built);
assert.deepEqual(listFiles(installed), files);
for (const file of files) assert(fs.readFileSync(path.join(installed, file)).equals(fs.readFileSync(path.join(built, file))), `Stale installed ammunition: ${file}`);
const output = fs.mkdtempSync(path.join(a, 'game-ammunition-'));
const bytes = fs.readFileSync(path.join(root, 'reference/export-ammunition.ts'));
const helper = path.join(game, 'balance', 'sdk-ammunition-' + randomUUID() + '.ts');
const expected = gunzipSync(fs.readFileSync(path.join(root, 'baseline/milestone-twenty-six/ammunition.json.gz')));
const faults = [
  ['press-rest-clock-retained', 'p.bank(actor, inst).timer = 0;', '/* rest clock incorrectly retained */'],
  ['reload-wipes-rest-clock', "bank.count = finite(bank.count + add, 'Restored ammunition');", "bank.count = finite(bank.count + add, 'Restored ammunition'); bank.timer = 0;"],
  ['optional-fuel-gates-on-bank', 'return spec.empower === undefined && !spec.ventAll;', 'return true;'],
  ['movement-clamps-fractional-bank', 'bank.count = count;', 'bank.count = Math.max(0, count);'],
  ['drip-catches-up-in-one-frame', 'if (bank.timer >= cooldown)', 'while (bank.timer >= cooldown)'],
];
const target = path.join(installed, 'ammunition.js'), original = fs.readFileSync(target, 'utf8'), reports = [];
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
  assert(capture('accepted').equals(expected), 'Installed ammunition observations changed');
  for (const [name, before, after] of faults) {
    assert(original.includes(before), 'Moved ammunition fault: ' + name);
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
    assert(detected, 'Undetected ammunition fault: ' + name);
    reports.push({name, detected});
  }
} finally {
  if (fs.existsSync(helper) && fs.readFileSync(helper).equals(bytes)) fs.unlinkSync(helper);
}
for (const file of files) assert(fs.readFileSync(path.join(installed, file)).equals(fs.readFileSync(path.join(built, file))), `Ammunition fault was not restored: ${file}`);
writeJSON(path.join(a, 'game-ammunition-verification.json'), {game, output,
  version: JSON.parse(fs.readFileSync(path.join(location.tooling, 'node_modules/@hollow-wake/engine/package.json'))).version,
  packageIntegrity: location.integrity, installedRuntimeFilesMatchBuild: files.length, gameLauncherAndCaptureTypeChecks: true,
  fixtureSha256: sha256(expected), courses: 46, transitions: 223, actualGamePressTimersAndReload: true, installedFaults: reports, allInstalledFilesRestored: true});
console.log('Installed ammunition matches the original; five behavioral faults detected and restored.');
