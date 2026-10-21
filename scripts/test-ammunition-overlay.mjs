import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root, verifyReference, writeJSON} from './reference-utils.mjs';
import {ammunitionFiles, renderAmmunition, integrateAmmunition} from '../adapters/hollow-wake/integrate-ammunition.mjs';
const reference = path.join(root, '.reference');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json')));
verifyReference(reference, lock);
const originals = Object.fromEntries(ammunitionFiles.map(file => [file, fs.readFileSync(path.join(reference, file), 'utf8').replaceAll('\r\n', '\n')]));
const receipts = [];
for (const newline of ['\n', '\r\n']) {
  const game = fs.mkdtempSync(path.join(root, '.artifacts/ammunition-overlay-'));
  const sources = {};
  for (const file of ammunitionFiles) {
    const target = path.join(game, file);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    sources[file] = (originals[file] + '\n// independent ammunition marker\n').replaceAll('\n', newline);
    fs.writeFileSync(target, sources[file]);
  }
  integrateAmmunition(game, false);
  for (const file of ammunitionFiles) assert.equal(fs.readFileSync(path.join(game, file), 'utf8'), sources[file]);
  integrateAmmunition(game);
  const integrated = {};
  for (const file of ammunitionFiles) {
    const after = fs.readFileSync(path.join(game, file), 'utf8');
    assert.equal(after.includes('\r\n'), newline === '\r\n');
    assert(after.endsWith(newline + '// independent ammunition marker' + newline));
    assert.equal(ts.createSourceFile(file, after, ts.ScriptTarget.Latest, true).parseDiagnostics.length, 0);
    integrated[file] = after;
  }
  assert(integrated[ammunitionFiles[0]].includes('this.advanceAmmunition(dt)'));
  assert(integrated[ammunitionFiles[0]].includes('if (this.sdkAmmo) { this.sdkAmmo.advance(dt); return; }'));
  assert(integrated[ammunitionFiles[1]].includes('commitAmmunitionPress(caster, inst'));
  assert(integrated[ammunitionFiles[1]].includes('caster.sdkAmmunition().restore(b, fx.amount)'));
  assert.throws(() => integrateAmmunition(game), /collision/);
  for (const file of ammunitionFiles) assert.equal(fs.readFileSync(path.join(game, file), 'utf8'), integrated[file]);
  receipts.push({lineEndings: newline === '\n' ? 'lf' : 'crlf', parsed: true, unrelatedSourcePreserved: true, reapplicationRefused: true});
}
for (const [file, before, after] of [
  [ammunitionFiles[0], 'st.count = Math.max(0, st.count - 1);', 'st.count = 0;'],
  [ammunitionFiles[0], 'if (st.timer >= uc.recharge)', 'if (st.timer > uc.recharge)'],
  [ammunitionFiles[1], 'ventRounds = bank.count;', 'ventRounds = 999;'],
  [ammunitionFiles[1], 'const add = Math.min(cap - bank.count, fx.amount ?? cap);', 'const add = 0;'],
  [ammunitionFiles[1], 'return !!uc && uc.empower === undefined', 'return !!uc && uc.empower !== undefined'],
]) {
  assert(originals[file].includes(before));
  assert.throws(() => renderAmmunition(file, originals[file].replace(before, after), originals[file]), /Unreviewed|Changed/);
}
const game = fs.mkdtempSync(path.join(root, '.artifacts/ammunition-overlay-preflight-'));
for (const file of ammunitionFiles) {
  const target = path.join(game, file);fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, originals[file] + (file === ammunitionFiles[1] ? '\n// sdkAmmunitionPress collision\n' : ''));
}
assert.throws(() => integrateAmmunition(game), /collision/);
assert.equal(fs.readFileSync(path.join(game, ammunitionFiles[0]), 'utf8'), originals[ammunitionFiles[0]], 'Second-file refusal must not modify the first file');
verifyReference(reference, lock);
writeJSON(path.join(root, '.artifacts/ammunition-overlay-verification.json'), {receipts, ownedPhaseEditsRejected: true, twoFilePreflightBeforeWrites: true, bindingCollisionsRejected: true});
console.log('Ammunition source guards preserve unrelated changes and preflight both files before writing.');
