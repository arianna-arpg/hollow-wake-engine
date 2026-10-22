import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { root, listFiles, verifyReference, sha256, writeJSON } from './reference-utils.mjs';
import { intentWorld, intentSeals, intentBridge, renderIntentWorld, renderIntentSeals } from '../adapters/hollow-wake/integrate-skill-intent.mjs';
const pos = process.argv.indexOf('--previous-adapter');
assert(pos >= 0 && process.argv[pos + 1], 'Pass retained v0.26 game as --previous-adapter');
const previous = path.resolve(process.argv[pos + 1]);
const location = JSON.parse(fs.readFileSync(path.join(root, '.artifacts/adapter-location.json')));
const reference = path.join(root, '.reference'), lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json')));
const oldEngine = path.join(previous, 'node_modules/@hollow-wake/engine'), newEngine = path.join(location.tooling, 'node_modules/@hollow-wake/engine');
assert.equal(JSON.parse(fs.readFileSync(path.join(oldEngine, 'package.json'))).version, '0.26.0');
assert.equal(JSON.parse(fs.readFileSync(path.join(newEngine, 'package.json'))).version, '0.27.0');
const files = listFiles(path.join(root, 'dist'));
assert.deepEqual(listFiles(path.join(newEngine, 'dist')), files);
for (const file of files) {
  const bytes = fs.readFileSync(path.join(root, 'dist', file));
  assert(bytes.equals(fs.readFileSync(path.join(newEngine, 'dist', file))), 'Stale installed ' + file);
  if (!/^(cast-seals|skill-instances|skill-intent)\./.test(file)) assert(bytes.equals(fs.readFileSync(path.join(oldEngine, 'dist', file))), 'Changed prior runtime ' + file);
}
for (const file of new Set([...Object.keys(lock.files), ...location.files])) {
  if (file === intentBridge) {
    assert(fs.readFileSync(path.join(location.game, file)).equals(fs.readFileSync(path.join(root, 'adapters/hollow-wake', path.basename(file))))); continue;
  }
  const old = fs.readFileSync(path.join(previous, file), 'utf8'), actual = fs.readFileSync(path.join(location.game, file), 'utf8');
  const render = file === intentWorld ? renderIntentWorld : file === intentSeals ? renderIntentSeals : null;
  const expected = render ? render(old, fs.readFileSync(path.join(reference, file), 'utf8')) : old;
  assert.equal(actual.replaceAll('\r\n', '\n'), expected.replaceAll('\r\n', '\n'), 'Game control differs ' + file);
}
verifyReference(reference, lock);
const bytes = fs.readFileSync(path.join(root, 'reference/benchmark-skill-intent.ts'));
const helper = path.join(reference, 'balance/benchmark-sdk-intent-' + randomUUID() + '.ts');
const dir = fs.mkdtempSync(path.join(root, '.artifacts/intent-benchmark-')), output = path.join(dir, 'benchmark.json');
try {
  fs.writeFileSync(helper, bytes, { flag: 'wx' });
  execFileSync(process.execPath, [path.join(reference, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.sim.json'], { cwd: reference, stdio: 'inherit' });
  execFileSync(process.execPath, ['--import', 'tsx', helper, previous, location.game, output], { cwd: reference, stdio: 'inherit' });
  verifyReference(reference, lock);
  const result = JSON.parse(fs.readFileSync(output));
  result.helperTypesPassed = true; result.helperSha256 = sha256(bytes);
  result.installedRuntimeFilesMatchBuild = files.length; result.priorRuntimeFilesUnchanged = listFiles(path.join(oldEngine, 'dist')).length;
  writeJSON(output, result); writeJSON(path.join(root, '.artifacts/skill-intent-benchmark-location.json'), { output });
} finally { if (fs.existsSync(helper) && fs.readFileSync(helper).equals(bytes)) fs.unlinkSync(helper); }
