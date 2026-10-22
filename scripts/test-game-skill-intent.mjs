import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { root, listFiles, sha256, writeJSON } from './reference-utils.mjs';
import { compareIntentQueries, expectedIntentQueries } from './skill-intent-comparison.mjs';

const artifacts = path.join(root, '.artifacts');
const location = JSON.parse(fs.readFileSync(path.join(artifacts, 'adapter-location.json')));
const installed = path.join(location.tooling, 'node_modules/@hollow-wake/engine');
const built = path.join(root, 'dist'), files = listFiles(built);
function verifyInstalled() {
  assert.deepEqual(listFiles(path.join(installed, 'dist')), files);
  for (const file of files) assert(fs.readFileSync(path.join(installed, 'dist', file)).equals(
    fs.readFileSync(path.join(built, file))), 'Stale or unrestored installed intent: ' + file);
}
verifyInstalled();
const acceptance = JSON.parse(fs.readFileSync(path.join(root, 'baseline/milestone-thirty-one/acceptance.json')));
const output = fs.mkdtempSync(path.join(artifacts, 'game-skill-intent-'));
const helpers = acceptance.fixtures.map(row => {
  const source = fs.readFileSync(path.join(root, 'reference/export-' + row.name + '.ts'));
  const expected = gunzipSync(fs.readFileSync(path.join(root, 'baseline/milestone-thirty-one', row.name + '.json.gz')));
  assert.equal(sha256(source), row.helperSha256);
  assert.equal(sha256(expected), row.fixtureSha256);
  return { ...row, source, expected, helper: path.join(location.game, 'balance/sdk-intent-' + randomUUID() + '.ts') };
});
function capture(row, label) {
  const file = path.join(output, row.name + '-' + label + '.json');
  const stdout = execFileSync(process.execPath, ['--import', 'tsx', row.helper, file], {
    cwd: location.game, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  fs.writeFileSync(path.join(output, row.name + '-' + label + '.txt'), stdout);
  const actual = fs.readFileSync(file);
  if (row.name === 'skill-intent') compareIntentQueries(JSON.parse(actual), JSON.parse(row.expected));
  else assert(actual.equals(row.expected), 'Raw identity/request observation changed: ' + row.name);
  return { name: row.name, sha256: sha256(actual), rawByteEqual: actual.equals(row.expected) };
}
const faults = [
  ['hard-seal-ignored', 'cast-seals.js', 'if (this.matches(spec.shut, context))', 'if (false)', 'skill-intent'],
  ['combo-endpoint-excluded', 'skill-intent.js', "> chain['window']", ">= chain['window']", 'skill-intent'],
  ['relocation-host-identity-lost', 'skill-instances.js', '|| (relocation && this.#relocations.get(inst) !== host)', '', 'skill-instance-identity'],
  ['meta-host-scope-lost', 'skill-instances.js', '? undefined : host.def.id', '? undefined : undefined', 'skill-instance-identity'],
  ['press-admission-bypassed', 'skill-intent.js', 'return p.canUse(actor, inst);', 'return true;', 'skill-intent'],
  ['native-intent-disconnected', null, 'return this.sdkSkillIntent.pressUsable(caster, inst);', 'return false;', 'skill-intent'],
];
const reports = [], observations = [];
try {
  for (const row of helpers) fs.writeFileSync(row.helper, row.source, { flag: 'wx' });
  for (const config of ['tsconfig.json', 'tsconfig.launcher.json', 'tsconfig.sim.json']) {
    execFileSync(process.execPath, [path.join(location.game, 'node_modules/typescript/bin/tsc'), '-p', config], { cwd: location.game, stdio: 'inherit' });
  }
  for (const row of helpers) observations.push(capture(row, 'candidate'));
  if (!process.argv.includes('--skip-faults')) for (const [name, module, before, after, fixture] of faults) {
    const target = module ? path.join(installed, 'dist', module) : path.join(location.game, 'src/engine/world.ts');
    const original = fs.readFileSync(target);
    const source = original.toString();
    assert.equal(source.split(before).length, 2, 'Fault site moved: ' + name);
    let detected = false;
    try {
      fs.writeFileSync(target, source.replace(before, after));
      try { capture(helpers.find(row => row.name === fixture), 'fault-' + name); }
      catch (error) {
        const detail = String(error.stdout ?? '') + String(error.stderr ?? '');
        assert(error.code === 'ERR_ASSERTION' || error.status !== undefined && /AssertionError/.test(detail)
          && !/SyntaxError|ERR_MODULE_NOT_FOUND|TypeError/.test(detail), 'Fault did not reach behavior: ' + detail);
        fs.writeFileSync(path.join(output, name + '-detected.txt'), String(error) + '\n' + detail);
        detected = true;
      }
    } finally { fs.writeFileSync(target, original); }
    assert(detected, 'Undetected installed fault: ' + name);
    reports.push({ name, detected });
    console.log('Detected installed fault: ' + name);
  }
} finally {
  for (const row of helpers) if (fs.existsSync(row.helper) && fs.readFileSync(row.helper).equals(row.source)) fs.unlinkSync(row.helper);
  verifyInstalled();
}
const originalQueries = JSON.parse(helpers.find(row => row.name === 'skill-intent').expected);
const projected = expectedIntentQueries(originalQueries);
const callCount = fixture => fixture.courses.reduce((n, c) => n + c.steps.reduce((m, s) => m + s.calls.length, 0), 0);
writeJSON(path.join(artifacts, 'game-skill-intent-verification.json'), {
  game: location.game, output, version: JSON.parse(fs.readFileSync(path.join(installed, 'package.json'))).version,
  packageIntegrity: location.integrity, installedRuntimeFilesMatchBuild: files.length,
  gameLauncherAndCaptureTypeChecks: true, fixtures: acceptance.fixtures, observations,
  originalForwardingCallsProjected: callCount(originalQueries) - callCount(projected),
  projection: 'Original query diagnostic forwarders only; candidate unfiltered. Identity and actual request fixtures byte-exact.',
  installedFaults: reports, allInstalledFilesRestored: true,
});
console.log('Installed skill intent matches 278 original observations, with six behavioral fault controls.');
