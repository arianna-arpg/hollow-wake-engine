import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { root, listFiles, verifyReference, sha256, writeJSON } from './reference-utils.mjs';
import { requestWorld, renderRequestWorld } from '../adapters/hollow-wake/integrate-skill-request.mjs';

const pos = process.argv.indexOf('--previous-adapter');
assert(pos >= 0 && process.argv[pos + 1], 'Pass retained v0.27.1 game as --previous-adapter');
const previous = path.resolve(process.argv[pos + 1]);
const location = JSON.parse(fs.readFileSync(path.join(root, '.artifacts/adapter-location.json')));
const reference = path.join(root, '.reference'), lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json')));
const oldEngine = path.join(previous, 'node_modules/@hollow-wake/engine'), newEngine = path.join(location.tooling, 'node_modules/@hollow-wake/engine');
assert.equal(fs.realpathSync(path.join(location.game, 'node_modules/@hollow-wake/engine')), fs.realpathSync(newEngine), 'Candidate resolves another installation');
assert.notEqual(fs.realpathSync(oldEngine), fs.realpathSync(newEngine), 'Benchmark requires independent installations');
assert.equal(JSON.parse(fs.readFileSync(path.join(oldEngine, 'package.json'))).version, '0.27.1');
assert.equal(JSON.parse(fs.readFileSync(path.join(newEngine, 'package.json'))).version, '0.28.0');
const files = listFiles(path.join(root, 'dist')), previousFiles = listFiles(path.join(oldEngine, 'dist'));
function verifyInputs() {
  assert.deepEqual(listFiles(path.join(newEngine, 'dist')), files);
  assert.deepEqual(files.filter(file => !file.startsWith('skill-request.')), previousFiles);
  for (const file of files) {
    const bytes = fs.readFileSync(path.join(root, 'dist', file));
    assert(bytes.equals(fs.readFileSync(path.join(newEngine, 'dist', file))), 'Stale installed ' + file);
    if (!file.startsWith('skill-request.')) assert(bytes.equals(fs.readFileSync(path.join(oldEngine, 'dist', file))), 'Changed predecessor runtime ' + file);
  }
  assert.deepEqual(listFiles(path.join(previous, 'src')), listFiles(path.join(location.game, 'src')));
  for (const relative of listFiles(path.join(previous, 'src'))) {
    const file = 'src/' + relative, old = fs.readFileSync(path.join(previous, file), 'utf8');
    const expected = file === requestWorld ? renderRequestWorld(old, fs.readFileSync(path.join(reference, file), 'utf8')) : old;
    assert.equal(fs.readFileSync(path.join(location.game, file), 'utf8').replaceAll('\r\n', '\n'), expected.replaceAll('\r\n', '\n'), 'Host control differs ' + file);
  }
  verifyReference(reference, lock);
}
verifyInputs();
const bytes = fs.readFileSync(path.join(root, 'reference/benchmark-skill-request.ts'));
const helper = path.join(reference, 'balance/benchmark-sdk-request-' + randomUUID() + '.ts');
const validationOnly = process.argv.includes('--validate-only');
const dir = fs.mkdtempSync(path.join(root, '.artifacts/request-benchmark-')), output = path.join(dir, validationOnly ? 'validation.json' : 'benchmark.json');
try {
  fs.writeFileSync(helper, bytes, { flag: 'wx' });
  execFileSync(process.execPath, [path.join(reference, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.sim.json'], { cwd: reference, stdio: 'inherit' });
  execFileSync(process.execPath, ['--import', 'tsx', helper, previous, location.game, output, ...(validationOnly ? ['--validate-only'] : [])], { cwd: reference, stdio: 'inherit' });
  verifyInputs();
  const result = JSON.parse(fs.readFileSync(output));
  assert.equal(result.validationOnly, validationOnly);
  Object.assign(result, { helperTypesPassed: true, helperSha256: sha256(bytes), installedRuntimeFilesMatchBuild: files.length,
    predecessorRuntimeFilesUnchanged: previousFiles.length, installedArchive: location.integrity });
  writeJSON(output, result);
  writeJSON(path.join(root, '.artifacts/skill-request-' + (validationOnly ? 'benchmark-validation' : 'benchmark') + '-location.json'), { output });
} finally { if (fs.existsSync(helper) && fs.readFileSync(helper).equals(bytes)) fs.unlinkSync(helper); }
