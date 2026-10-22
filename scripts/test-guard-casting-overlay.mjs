import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root, verifyReference, writeJSON} from './reference-utils.mjs';
import {guardCastWorld, guardCastSkills, guardCastBridge, renderGuardWorld, renderGuardSkills, integrateGuardCasting} from '../adapters/hollow-wake/integrate-guard-casting.mjs';
const reference = path.join(root, '.reference'), lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json')));
verifyReference(reference, lock);
const originals = new Map([guardCastWorld, guardCastSkills].map(file => [file, fs.readFileSync(path.join(reference, file), 'utf8').replaceAll('\r\n', '\n')])), receipts = [];
for (const newline of ['\n', '\r\n']) {
  const game = fs.mkdtempSync(path.join(root, '.artifacts/guard-overlay-')), inputs = new Map();
  for (const [file, original] of originals) {
    const source = (original + '\n// independent guard marker\n').replaceAll('\n', newline), target = path.join(game, file);
    fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, source); inputs.set(file, source);
  }
  integrateGuardCasting(game, false);
  for (const [file, input] of inputs) assert.equal(fs.readFileSync(path.join(game, file), 'utf8'), input);
  const skillFile = path.join(game, guardCastSkills), changed = inputs.get(guardCastSkills).replace('held + 1e-6 >= armAt', 'held > armAt');
  fs.writeFileSync(skillFile, changed); assert.throws(() => integrateGuardCasting(game), /Unreviewed guard readiness/);
  assert.equal(fs.readFileSync(path.join(game, guardCastWorld), 'utf8'), inputs.get(guardCastWorld));
  assert(!fs.existsSync(path.join(game, guardCastBridge))); fs.writeFileSync(skillFile, inputs.get(guardCastSkills));
  integrateGuardCasting(game);
  for (const file of originals.keys()) {
    const after = fs.readFileSync(path.join(game, file), 'utf8');
    assert.equal(after.includes('\r\n'), newline === '\r\n'); assert(after.endsWith(newline + '// independent guard marker' + newline));
    assert.equal(ts.createSourceFile(file, after, ts.ScriptTarget.Latest, true).parseDiagnostics.length, 0);
  }
  const world = fs.readFileSync(path.join(game, guardCastWorld), 'utf8');
  for (const text of ['this.sdkGuardCasting().advance(a, cs, dt)', 'this.sdkGuardCasting().refresh(a, cs)', 'return guardAiHold(cs)']) assert(world.includes(text));
  assert.throws(() => integrateGuardCasting(game), /Refusing to overwrite/);
  receipts.push({lineEndings: newline === '\n' ? 'lf' : 'crlf',parsed: true, unrelatedSourcePreserved: true, allInputsPreflightedBeforeWrites: true, reapplicationRefused: true});
}
const world = originals.get(guardCastWorld), skills = originals.get(guardCastSkills);
assert.throws(() => renderGuardWorld(world.replace('cs.guardPulseT += spec.pulse.interval;', 'cs.guardPulseT = 0;'), world), /Unreviewed guard case/);
assert.throws(() => renderGuardWorld(world.replace('const hold = cs.aiHold ?? Infinity;', 'const hold = 0;'), world), /Unreviewed aiHoldOf/);
assert.throws(() => renderGuardWorld(world.replace('const inverted = a.sheet.get(\'bashInvert\', tags, extra) > 0;', 'const inverted = false;'), world), /Unreviewed refreshGuardBash/);
assert.throws(() => renderGuardSkills(skills.replace('held + 1e-6 >= armAt', 'held > armAt'), skills), /Unreviewed guard readiness/);
verifyReference(reference, lock); writeJSON(path.join(root, '.artifacts/guard-casting-overlay-verification.json'), {receipts, ownedLifecycleArmingHoldAndReadinessChangesRejected: true});
console.log('Guard overlay preserves unrelated source and guards both files before writing.');
