import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {build, version as esbuildVersion} from 'esbuild';
import {root, sha256} from './reference-utils.mjs';
import {challengeTargetingContracts} from '../test/challenge-targeting-contracts.mjs';
import {makeChallengeTargetingScene as scene} from '../test/challenge-targeting-workload.mjs';

const measured = process.argv[2] === '--measure';
assert(process.argv.length === (measured ? 3 : 2), 'Only --measure is accepted; omitted means correctness checks only');
fs.mkdirSync(path.join(root, '.artifacts'), {recursive: true});
const owned = fs.realpathSync(path.join(root, '.artifacts'));
const work = fs.mkdtempSync(path.join(owned, 'challenge-targeting-benchmark-owned-'));
const sources = {}, read = file => {const bytes = fs.readFileSync(path.join(root, file)); sources[file] = sha256(bytes); return bytes;};
const report = {passed: false, measured, sources, courses: [],
  environment: {node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model, esbuild: esbuildVersion},
  scope: 'Public controller updates with synthetic host ports; comparison to the published SDK predecessor, not original-game acceptance.',
  limits: ['Setup, compilation, rendering, physics and actual host damage execution are outside the timed region.',
    'Positions remain stable during synchronous selection. Stateful coordinate getters are not qualified.',
    'Elapsed time does not establish allocation volume, whole-game speedup or physical-device performance.']};
try {
  for (const file of ['scripts/benchmark-challenge-targeting.mjs', 'test/challenge-targeting-workload.mjs',
    'test/challenge-targeting-contracts.mjs', 'scripts/reference-utils.mjs', 'package.json', 'package-lock.json']) read(file);
  const provenance = JSON.parse(read('baseline/challenge-targeting/provenance.json'));
  const archive = read('baseline/challenge-targeting/previous-sdk.ts.gz'), previous = gunzipSync(archive);
  assert.equal(sha256(archive), provenance.archiveSha256); assert.equal(sha256(previous), provenance.sourceSha256);
  for (const [file, hash] of Object.entries(provenance.sharedRuntimeDependencies)) assert.equal(sha256(read(file)), hash, file);
  report.baseline = provenance;
  const variants = [['previous', previous.toString()], ['candidate', read('src/challenges.ts').toString()]], outputs = [];
  report.variants = Object.fromEntries(variants.map(([name, contents]) => [name, sha256(contents)]));
  for (const [name, contents] of variants) {
    const result = await build({stdin: {contents, resolveDir: path.join(root, 'src'), sourcefile: 'challenges.ts', loader: 'ts'},
      bundle: true, platform: 'node', format: 'esm', target: 'es2022', write: false, logLevel: 'silent'});
    assert.equal(result.outputFiles.length, 1);
    const file = path.join(work, name + '.mjs'); fs.writeFileSync(file, result.outputFiles[0].contents);
    outputs.push((await import(pathToFileURL(file).href)).Challenges);
  }
  const contracts = outputs.map(Challenges => challengeTargetingContracts({Challenges}));
  assert.deepEqual(contracts[0], contracts[1]); assert.equal(contracts[0].contracts, 18);
  report.targetingContracts = contracts[0].contracts;
  const median = values => {
    const sorted = [...values].sort((a, b) => a - b), middle = sorted.length / 2;
    return (sorted[Math.floor(middle)] + sorted[Math.ceil(middle) - 1]) / 2;
  };
  for (const [enemies, devices, fields] of [[0, 0, false], [0, 1, false], [16, 1, false],
    [64, 4, false], [256, 8, false], [64, 4, true], [256, 8, true]]) {
    const pair = outputs.map(C => scene(C, enemies, devices, fields));
    for (let frame = 0; frame < 120; frame++) {
      pair.forEach(s => s.tick(1)); assert.deepEqual(pair[0].observe(), pair[1].observe());
    }
    const course = {enemies, devices, fields, matchedFrames: 120, samples: []};
    if (measured) {
      const frames = devices === 0 ? 90000 : 900, warmupFrames = devices === 0 ? 3000 : 300;
      outputs.forEach(C => scene(C, enemies, devices, fields).tick(warmupFrames));
      course.warmupFrames = warmupFrames;
      for (let round = 0; round < 12; round++) {
        const rigs = outputs.map(C => scene(C, enemies, devices, fields)), timings = [];
        const order = round % 2 ? [1, 0] : [0, 1];
        for (const which of order) {
          const start = performance.now(); rigs[which].tick(frames); timings[which] = performance.now() - start;
        }
        assert.deepEqual(rigs[0].observe(), rigs[1].observe());
        course.samples.push({round, frames, order: order.map(i => variants[i][0]),
          ms: Object.fromEntries(variants.map(([name], i) => [name, timings[i]]))});
      }
      course.medianMs = Object.fromEntries(variants.map(([name]) => [name, median(course.samples.map(r => r.ms[name]))]));
      course.ratio = course.medianMs.previous / course.medianMs.candidate;
    }
    report.courses.push(course);
  }
  report.passed = true;
} catch (error) {report.failure = String(error); process.exitCode = 1;}
finally {
  try {
    report.inputsUnchanged = Object.entries(sources).every(([file, hash]) => sha256(fs.readFileSync(path.join(root, file))) === hash);
    report.passed &&= report.inputsUnchanged;
  } catch (error) {report.passed = false; report.failure = String(error);}
  assert.equal(path.dirname(fs.realpathSync(work)), owned); assert(!fs.existsSync(path.join(work, '.git')));
  fs.rmSync(work, {recursive: true, maxRetries: 3}); report.cleaned = true;
  fs.writeFileSync(path.join(owned, 'challenge-targeting-' + (measured ? 'benchmark' : 'check') + '.json'), JSON.stringify(report, null, 2) + '\n');
}
assert(report.passed, report.failure ?? 'Verified inputs changed');
console.log({passed: true, measured, targetingContracts: report.targetingContracts, cleaned: report.cleaned,
  courses: report.courses.map(({samples, ...row}) => row)});
