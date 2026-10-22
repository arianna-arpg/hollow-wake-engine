import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { root, listFiles, sha256, verifyReference, writeJSON } from './reference-utils.mjs';

const pos = process.argv.indexOf('--previous-adapter');
assert(pos >= 0 && process.argv[pos + 1], 'Pass the retained v0.27.0 game with --previous-adapter');
const previous = path.resolve(process.argv[pos + 1]), artifacts = path.join(root, '.artifacts');
const location = JSON.parse(fs.readFileSync(path.join(artifacts, 'adapter-location.json')));
const oldEngine = path.join(previous, 'node_modules/@hollow-wake/engine');
const newEngine = path.join(location.tooling, 'node_modules/@hollow-wake/engine');
assert.equal(JSON.parse(fs.readFileSync(path.join(oldEngine, 'package.json'))).version, '0.27.0');
assert.equal(JSON.parse(fs.readFileSync(path.join(newEngine, 'package.json'))).version, '0.27.1');
const reference = path.join(root, '.reference');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json')));
const allowed = new Set(['support-rules.js', 'support-rules.js.map']);
function controls() {
  verifyReference(reference, lock);
  assert.equal(fs.realpathSync(path.join(location.game, 'node_modules/@hollow-wake/engine')),
    fs.realpathSync(newEngine), 'Candidate game does not resolve the verified runtime');
  const files = listFiles(path.join(root, 'dist'));
  assert.deepEqual(listFiles(path.join(newEngine, 'dist')), files);
  assert.deepEqual(listFiles(path.join(oldEngine, 'dist')), files);
  const changed = [], modules = {};
  for (const file of files) {
    const built = fs.readFileSync(path.join(root, 'dist', file));
    assert(built.equals(fs.readFileSync(path.join(newEngine, 'dist', file))), 'Stale candidate: ' + file);
    const old = fs.readFileSync(path.join(oldEngine, 'dist', file));
    if (!built.equals(old)) { assert(allowed.has(file), 'Unexpected runtime change: ' + file); changed.push(file); }
    if (allowed.has(file)) modules[file] = { previous: sha256(old), candidate: sha256(built) };
  }
  assert.deepEqual(changed, [...allowed]);
  const sources = listFiles(path.join(location.game, 'src'));
  assert.deepEqual(sources, listFiles(path.join(previous, 'src')));
  const hashes = sources.map(file => {
    const bytes = fs.readFileSync(path.join(location.game, 'src', file));
    assert(bytes.equals(fs.readFileSync(path.join(previous, 'src', file))), 'Changed host source: ' + file);
    return [file, sha256(bytes)];
  });
  for (const file of ['package.json', 'tsconfig.json', 'tsconfig.sim.json']) {
    assert(fs.readFileSync(path.join(location.game, file)).equals(fs.readFileSync(path.join(previous, file))), 'Changed host configuration: ' + file);
  }
  return { runtimeFiles: files.length, unchangedRuntimeFiles: files.length - changed.length,
    changedRuntimeFiles: changed, modules, identicalHostSources: sources.length,
    hostSourcesSha256: sha256(Buffer.from(JSON.stringify(hashes))) };
}
const before = controls(), output = fs.mkdtempSync(path.join(artifacts, 'support-admission-benchmark-'));
const results = [];
for (let run = 1; run <= 2; run++) for (const name of ['skill-intent', 'supports']) {
  // Reuse the existing complete workloads verbatim, including receipt assertions.
  const source = fs.readFileSync(path.join(root, 'reference/benchmark-' + name + '.ts'));
  const helper = path.join(reference, 'balance/benchmark-support-admission-' + randomUUID() + '.ts');
  const file = path.join(output, name + '-run' + run + '.json');
  try {
    fs.writeFileSync(helper, source, { flag: 'wx' });
    execFileSync(process.execPath, [path.join(reference, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.sim.json'], { cwd: reference, stdio: 'inherit' });
    execFileSync(process.execPath, ['--import', 'tsx', helper, previous, location.game, file], { cwd: reference, stdio: 'inherit' });
    const result = JSON.parse(fs.readFileSync(file));
    result.scope = result.scope.replaceAll('v0.26', 'v0.27.0').replaceAll('v0.16.1', 'v0.27.0');
    result.candidateVersion = '0.27.1';
    result.helperSha256 = sha256(source); result.helperTypesPassed = true;
    writeJSON(file, result);
    results.push({ run, workload: name, file: path.basename(file), helperSha256: result.helperSha256 });
  } finally { if (fs.existsSync(helper) && fs.readFileSync(helper).equals(source)) fs.unlinkSync(helper); }
}
assert.deepEqual(controls(), before, 'Controls changed during measurement');
writeJSON(path.join(output, 'verification.json'), { controls: before, results,
  scope: 'Two complete rotating runs of each unchanged workload. All original/retained/candidate gameplay receipts match. Desktop development-runtime measurements; no allocation, whole-frame or target-device claim.' });
writeJSON(path.join(artifacts, 'support-admission-benchmark-location.json'), { output });
console.log('Support-admission measurements and source/runtime controls verified.');
