import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root, verifyReference, writeJSON } from './reference-utils.mjs';
import { integrateProgressionGates } from '../adapters/hollow-wake/integrate-progression-gates.mjs';

const reference = path.join(root, '.reference');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json')));
verifyReference(reference, lock);
const original = fs.readFileSync(path.join(reference, 'src/meta/gates.ts'), 'utf8').replaceAll('\r\n', '\n');
const directory = fs.mkdtempSync(path.join(root, '.artifacts/progression-gate-overlay-'));
const results = [];
for (const scenario of ['install', 'crlf', 'unreviewed', 'collision', 'helper-used', 'rename-failure', 'editor-change', 'installer-lock', 'retry']) {
  const game = path.join(directory, scenario), file = path.join(game, 'src/meta/gates.ts');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let source = original + '\n// Independent host note.\n';
  if (scenario === 'crlf') source = source.replaceAll('\n', '\r\n');
  if (scenario === 'unreviewed') source = source.replace('n = 1', 'n = 2');
  if (scenario === 'collision') source += '\nconst engineGateContext = {};\n';
  if (scenario === 'helper-used') source += '\nexport const localProgress = highestStampedLevel;\n';
  fs.writeFileSync(file, source);
  const before = fs.readFileSync(file);
  const scratch = path.join(game, '.hollow-wake-character-install');
  if (scenario === 'installer-lock') {
    fs.mkdirSync(scratch);
    fs.writeFileSync(path.join(scratch, 'other-installer'), 'retain');
  }
  if (['unreviewed', 'collision'].includes(scenario)) {
    assert.throws(() => integrateProgressionGates(game, false));
  } else {
    assert.deepEqual(integrateProgressionGates(game, false).files, ['src/meta/gates.ts']);
  }
  assert(fs.readFileSync(file).equals(before));
  const rename = fs.renameSync, write = fs.writeFileSync;
  if (['rename-failure', 'retry'].includes(scenario)) {
    fs.renameSync = () => { throw new Error('Injected destination lock'); };
  }
  if (scenario === 'editor-change') {
    fs.writeFileSync = (target, ...args) => {
      const result = write(target, ...args);
      if (String(target).endsWith('0.candidate')) write(file, 'Independent concurrent edit');
      return result;
    };
  }
  try {
    if (['install', 'crlf', 'helper-used'].includes(scenario)) integrateProgressionGates(game);
    else assert.throws(() => integrateProgressionGates(game));
  } finally {
    fs.renameSync = rename;
    fs.writeFileSync = write;
  }
  if (scenario === 'retry') {
    assert(fs.readFileSync(file).equals(before));
    integrateProgressionGates(game);
  }
  if (['install', 'crlf', 'helper-used', 'retry'].includes(scenario)) {
    const installed = fs.readFileSync(file), text = installed.toString();
    assert(!installed.equals(before));
    assert(text.includes('// Independent host note.'));
    assert(text.includes('@hollow-wake/engine/progression/gates'));
    assert.equal(text.includes('function highestStampedLevel'), scenario === 'helper-used');
    if (scenario === 'crlf') assert(!/(?<!\r)\n/.test(text));
    assert.throws(() => integrateProgressionGates(game));
    assert(fs.readFileSync(file).equals(installed));
  } else if (scenario === 'editor-change') {
    assert.equal(fs.readFileSync(file, 'utf8'), 'Independent concurrent edit');
  } else {
    assert(fs.readFileSync(file).equals(before));
  }
  if (scenario === 'installer-lock') {
    assert.equal(fs.readFileSync(path.join(scratch, 'other-installer'), 'utf8'), 'retain');
  } else {
    assert(!fs.existsSync(scratch));
  }
  results.push(scenario);
}
verifyReference(reference, lock);
const report = { passed: true, directory, results };
writeJSON(path.join(directory, 'verification.json'), report);
writeJSON(path.join(root, '.artifacts/progression-gate-overlay-latest.json'), report);
console.log(report);
