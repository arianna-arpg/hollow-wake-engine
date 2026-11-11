import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {root, sha256, materialize, verifyReference} from './reference-utils.mjs';
import {challengeReference} from './challenge-reference.mjs';
import {challengeContinuationReference} from './challenge-continuation-reference.mjs';
import {challengeFiles} from '../adapters/hollow-wake/integrate-challenges.mjs';

assert.equal(process.argv.length, 2);
fs.mkdirSync(path.join(root, '.artifacts'), {recursive: true});
const owned = fs.realpathSync(path.join(root, '.artifacts')), read = f => fs.readFileSync(path.join(root, f));
const sources = {}, tracked = f => {const bytes = read(f); sources[f] = sha256(bytes); return bytes;};
const original = challengeReference(tracked), lock = JSON.parse(tracked('baseline/source-lock.json'));
const continuation = challengeContinuationReference(tracked);
const privateSource = tracked('test/challenge-continuation-game.ts').toString();
for (const f of ['package.json', 'package-lock.json', 'src/challenges.ts', 'src/challenge-types.ts',
  'src/challenge-content.ts', 'src/challenge-owned.ts', 'src/challenge-continuation.ts',
  'scripts/challenge-continuation-reference.mjs', 'scripts/test-challenges-composed.mjs', 'scripts/prepare-game-adapter.mjs',
  'scripts/challenge-reference.mjs', 'adapters/hollow-wake/integrate-challenges.mjs',
  'adapters/hollow-wake/challenges.ts', 'adapters/hollow-wake/challengeSpec.ts',
  'adapters/hollow-wake/challenge-boundary.json']) tracked(f);
const work = fs.mkdtempSync(path.join(owned, 'challenges-composed-owned-'));
const game = path.join(work, 'game'), location = path.join(work, 'location.json');
const report = {passed: false, composed: true, sources}, logs = {};
const run = (label, args, cwd = game) => {
  console.log('Checking ' + label);
  const c = spawnSync(process.execPath, args, {cwd, encoding: 'utf8', windowsHide: true, timeout: 20 * 60 * 1000,
    maxBuffer: 8 * 1024 * 1024, env: {...process.env, TEMP: work, TMP: work, TMPDIR: work,
      NPM_CONFIG_CACHE: path.join(work, 'npm-cache'), NODE_COMPILE_CACHE: path.join(work, 'compile-cache'), NPM_CONFIG_IGNORE_SCRIPTS: 'true'}});
  logs[label] = {stdout: c.stdout ?? '', stderr: c.stderr ?? ''};
  assert(!c.error && !c.signal && c.status === 0, label + ': ' + JSON.stringify(logs[label]).slice(-7000));
  return logs[label];
};
try {
  verifyReference(path.join(root, '.reference'), lock); materialize(null, lock, game); verifyReference(game, lock);
  run('prepare', [path.join(root, 'scripts/prepare-game-adapter.mjs'), '--game', game, '--location-out', location,
    '--scratch-root', work, '--reuse-tools', path.join(root, '.reference/node_modules')], root);
  const installed = JSON.parse(fs.readFileSync(location)); assert(installed.challengesDecision);
  report.archiveSha256 = sha256(fs.readFileSync(installed.archive)); report.changedFiles = installed.files;
  const installedFiles = new Map(challengeFiles.map(file => [file, fs.readFileSync(path.join(game, file))]));
  const observer = path.join(game, 'balance/hwe-challenges.ts'); fs.writeFileSync(observer, original.source);
  const tsc = path.join(game, 'node_modules/typescript/bin/tsc'), cli = path.join(game, 'balance/cli.ts');
  const controlSmoke = path.join(work, 'smoke-control'), candidateSmoke = path.join(work, 'smoke-candidate');
  function course(label) {
    let accepted;
    for (let i = 1; i <= 2; i++) {
      const output = path.join(work, label + '-' + i + '.json');
      const log = run(label + '-' + i, ['--import', 'tsx', observer, output]);
      assert.deepEqual(log, original.log); const bytes = fs.readFileSync(output);
      if (accepted) assert(bytes.equals(accepted)); else accepted = bytes;
    }
    return accepted;
  }
  let control;
  // Keep every other installed SDK capability identical. Restore only these two
  // original implementation files for the control, never the current SDK twice.
  for (const file of challengeFiles) fs.writeFileSync(path.join(game, file), read('.reference/' + file));
  try {
    run('control-types', [tsc, '--noEmit', '-p', 'tsconfig.sim.json']);
    control = course('control-course');
    run('control-smoke', ['--import', 'tsx', cli, 'run', '--suite', 'smoke', '--out', controlSmoke]);
  } finally {for (const [file, bytes] of installedFiles) fs.writeFileSync(path.join(game, file), bytes);}
  for (const [file, bytes] of installedFiles) assert(fs.readFileSync(path.join(game, file)).equals(bytes));
  report.controlRestored = true;
  const continuationObserver = path.join(game, 'balance/hwe-challenge-continuation.ts');
  const privateObserver = path.join(game, 'balance/hwe-challenge-continuation-private.ts');
  fs.writeFileSync(continuationObserver, continuation.source); fs.writeFileSync(privateObserver, privateSource);
  for (const config of ['tsconfig.json', 'tsconfig.launcher.json', 'tsconfig.sim.json']) run('types-' + config, [tsc, '--noEmit', '-p', config]);
  report.types = true; report.typeConfigs = ['game', 'launcher', 'simulation'];
  const candidate = course('installed-course'); assert(candidate.equals(control), 'Composed controller changed observed behavior');
  report.observations = 61; report.originalReferenceMatch = candidate.equals(original.expected);
  report.observationSha256 = sha256(candidate);
  for (let i = 1; i <= 2; i++) {
    const output = path.join(work, 'continuation-' + i + '.json');
    assert.deepEqual(run('continuation-' + i, ['--import', 'tsx', continuationObserver, output]), continuation.log);
    assert(fs.readFileSync(output).equals(continuation.expected));
    assert.deepEqual(run('private-' + i, ['--import', 'tsx', privateObserver]), {
      stdout: 'Challenge private continuation: 5 courses, 30 stages passed\n', stderr: continuation.log.stderr,
    });
  }
  report.continuation = {originalObservations: 13, privateCourses: 5, privateStages: 30, freshProcesses: 2};
  run('installed-smoke', ['--import', 'tsx', cli, 'run', '--suite', 'smoke', '--out', candidateSmoke]);
  const summarize = directory => {const {startedAt, ...value} = JSON.parse(fs.readFileSync(path.join(directory, 'report.json'))); assert.equal(typeof startedAt, 'string'); return value;};
  assert.deepEqual(summarize(candidateSmoke), summarize(controlSmoke));
  const expected = fs.readFileSync(path.join(controlSmoke, 'episodes.json')), actual = fs.readFileSync(path.join(candidateSmoke, 'episodes.json'));
  assert(actual.equals(expected)); const episodes = JSON.parse(actual); assert.equal(episodes.length, 25); assert(episodes.every(e => e.ended !== 'error'));
  report.smoke = {episodes: 25, exactEpisodes: true, episodesSha256: sha256(actual), normalizedReportsEqual: true};
  report.passed = true;
} catch (error) {report.failure = String(error); process.exitCode = 1;}
finally {
  try {
    verifyReference(path.join(root, '.reference'), lock);
    report.inputsUnchanged = Object.entries(sources).every(([f, h]) => sha256(read(f)) === h);
    report.passed = report.passed && report.inputsUnchanged;
  } catch (error) {
    report.passed = false; report.inputsUnchanged = false;
    report.failure = [report.failure, String(error)].filter(Boolean).join('\n'); process.exitCode = 1;
  }
  assert.equal(path.dirname(fs.realpathSync(work)), owned); assert(!fs.existsSync(path.join(work, '.git')));
  fs.rmSync(work, {recursive: true, maxRetries: 3}); report.cleaned = true;
  const bytes = gzipSync(JSON.stringify(logs), {level: 9}); report.logsSha256 = sha256(bytes);
  fs.writeFileSync(path.join(owned, 'challenges-composed.logs.json.gz'), bytes);
  fs.writeFileSync(path.join(owned, 'challenges-composed.json'), JSON.stringify(report, null, 2) + '\n');
}
assert(report.passed, report.failure ?? 'Verified inputs changed');
console.log({passed: true, composed: true, observations: report.observations, originalReferenceMatch: report.originalReferenceMatch,
  typeConfigs: report.typeConfigs, smoke: report.smoke, cleaned: true});
