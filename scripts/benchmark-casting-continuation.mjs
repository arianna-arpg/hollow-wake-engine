import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { root, listFiles, verifyReference, sha256, writeJSON } from './reference-utils.mjs';
import { continuationWorld, renderContinuationWorld } from '../adapters/hollow-wake/integrate-casting-continuation.mjs';

const pos = process.argv.indexOf('--previous-adapter');
assert(pos >= 0 && process.argv[pos + 1], 'Pass retained v0.29.0 game as --previous-adapter');
const previous = path.resolve(process.argv[pos + 1]);
const location = JSON.parse(fs.readFileSync(path.join(root, '.artifacts/adapter-location.json')));
const reference = path.join(root, '.reference'), lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json')));
const oldEngine = path.join(previous, 'node_modules/@hollow-wake/engine'), newEngine = path.join(location.tooling, 'node_modules/@hollow-wake/engine');
assert.equal(fs.realpathSync(path.join(location.game, 'node_modules/@hollow-wake/engine')), fs.realpathSync(newEngine), 'Candidate resolves another installation');
assert.notEqual(fs.realpathSync(oldEngine), fs.realpathSync(newEngine), 'Benchmark requires independent installations');
assert.equal(JSON.parse(fs.readFileSync(path.join(oldEngine, 'package.json'))).version, '0.29.0');
assert.equal(JSON.parse(fs.readFileSync(path.join(newEngine, 'package.json'))).version, '0.30.0');
const files = listFiles(path.join(root, 'dist')), previousFiles = listFiles(path.join(oldEngine, 'dist'));
const comparisonAt = process.argv.indexOf('--comparison-adapter');
assert(comparisonAt < 0 || process.argv[comparisonAt + 1], 'Missing comparison adapter path');
const comparison = comparisonAt < 0 ? undefined : path.resolve(process.argv[comparisonAt + 1]);
function comparisonSnapshot() {
  if (!comparison) return undefined;
  const engine = path.join(comparison, 'node_modules/@hollow-wake/engine');
  assert.notEqual(fs.realpathSync(engine), fs.realpathSync(newEngine), 'Comparison must have an independent installation');
  assert.notEqual(fs.realpathSync(engine), fs.realpathSync(oldEngine), 'Comparison must differ from the previous release');
  const runtime = Object.fromEntries(listFiles(path.join(engine, 'dist')).map(file =>
    [file, sha256(fs.readFileSync(path.join(engine, 'dist', file)))]));
  const source = Object.fromEntries(listFiles(path.join(comparison, 'src')).map(file =>
    [file, sha256(fs.readFileSync(path.join(comparison, 'src', file)))]));
  return {version: JSON.parse(fs.readFileSync(path.join(engine, 'package.json'))).version, runtime, source};
}
const comparisonBefore = comparisonSnapshot();
function verifyInputs() {
  assert.deepEqual(listFiles(path.join(newEngine, 'dist')), files);
  assert.deepEqual(files.filter(file => !file.startsWith('casting-continuation.')), previousFiles);
  for (const file of files) {
    const bytes = fs.readFileSync(path.join(root, 'dist', file));
    assert(bytes.equals(fs.readFileSync(path.join(newEngine, 'dist', file))), 'Stale installed ' + file);
    if (!file.startsWith('casting-continuation.')) assert(bytes.equals(fs.readFileSync(path.join(oldEngine, 'dist', file))), 'Changed predecessor runtime ' + file);
  }
  assert.deepEqual(listFiles(path.join(previous, 'src')), listFiles(path.join(location.game, 'src')));
  for (const relative of listFiles(path.join(previous, 'src'))) {
    const file = 'src/' + relative, old = fs.readFileSync(path.join(previous, file), 'utf8');
    const expected = file === continuationWorld ? renderContinuationWorld(old) : old;
    assert.equal(fs.readFileSync(path.join(location.game, file), 'utf8').replaceAll('\r\n', '\n'), expected.replaceAll('\r\n', '\n'), 'Host control differs ' + file);
  }
  verifyReference(reference, lock);
  assert.deepEqual(comparisonSnapshot(), comparisonBefore, 'Comparison installation changed during measurement');
}
verifyInputs();
const bytes = fs.readFileSync(path.join(root, 'reference/benchmark-casting-continuation.ts'));
const helper = path.join(reference, 'balance/benchmark-sdk-continuation-' + randomUUID() + '.ts');
const validationOnly = process.argv.includes('--validate-only');
const dir = fs.mkdtempSync(path.join(root, '.artifacts/continuation-benchmark-')), output = path.join(dir, validationOnly ? 'validation.json' : 'benchmark.json');
try {
  fs.writeFileSync(helper, bytes, { flag: 'wx' });
  execFileSync(process.execPath, [path.join(reference, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.sim.json'], { cwd: reference, stdio: 'inherit' });
  execFileSync(process.execPath, ['--import', 'tsx', helper, previous, location.game, output,
    ...(comparison ? ['--comparison-adapter', comparison] : []), ...(validationOnly ? ['--validate-only'] : [])], { cwd: reference, stdio: 'inherit' });
  verifyInputs();
  const result = JSON.parse(fs.readFileSync(output));
  assert.equal(result.validationOnly, validationOnly);
  Object.assign(result, { helperTypesPassed: true, helperSha256: sha256(bytes), installedRuntimeFilesMatchBuild: files.length,
    predecessorRuntimeFilesUnchanged: previousFiles.length, installedArchive: location.integrity,
    comparison: comparisonBefore });
  writeJSON(output, result);
  writeJSON(path.join(root, '.artifacts/casting-continuation-' + (validationOnly ? 'benchmark-validation' : 'benchmark') + '-location.json'), { output });
} finally { if (fs.existsSync(helper) && fs.readFileSync(helper).equals(bytes)) fs.unlinkSync(helper); }
