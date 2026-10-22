import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root, verifyReference, writeJSON} from './reference-utils.mjs';
import {intentWorld, intentSeals, intentBridge, integrateSkillIntent, renderIntentWorld} from '../adapters/hollow-wake/integrate-skill-intent.mjs';
const reference = path.join(root, '.reference'), lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json')));
verifyReference(reference, lock);
const original = Object.fromEntries([intentWorld, intentSeals].map(file => [file, fs.readFileSync(path.join(reference, file), 'utf8').replaceAll('\r\n', '\n')]));
const receipts = [];
for (const newline of ['\n', '\r\n']) {
  const game = fs.mkdtempSync(path.join(root, '.artifacts/intent-overlay-'));
  fs.mkdirSync(path.join(game, 'src/engine'), {recursive: true});
  const inputs = {...original, [intentWorld]: original[intentWorld] + '\n// unrelated intent marker\n'};
  for (const [file, source] of Object.entries(inputs)) fs.writeFileSync(path.join(game, file), source.replaceAll('\n', newline));
  integrateSkillIntent(game, false);
  for (const [file, source] of Object.entries(inputs)) assert.equal(fs.readFileSync(path.join(game, file), 'utf8'), source.replaceAll('\n', newline));
  for (const [file, before, after] of [
    [intentWorld, 'this.time - st.comboAt > chain.window', 'this.time - st.comboAt >= chain.window'],
    [intentWorld, "if (instanceTrigger(inst)) return false;", "if (instanceTrigger(inst)) return true;"],
    [intentSeals, 'if (castMatches(spec.shut, ctx)) return true;', 'if (castMatches(spec.shut, ctx)) return false;'],
  ]) {
    assert(inputs[file].includes(before));
    const changed = inputs[file].replace(before, after).replaceAll('\n', newline); fs.writeFileSync(path.join(game, file), changed);
    assert.throws(() => integrateSkillIntent(game), /Unreviewed/);
    assert.equal(fs.readFileSync(path.join(game, file), 'utf8'), changed); assert(!fs.existsSync(path.join(game, intentBridge)));
    for (const other of [intentWorld, intentSeals].filter(value => value !== file)) assert.equal(fs.readFileSync(path.join(game, other), 'utf8'), inputs[other].replaceAll('\n', newline));
    fs.writeFileSync(path.join(game, file), inputs[file].replaceAll('\n', newline));
  }
  integrateSkillIntent(game);
  for (const file of [intentWorld, intentSeals]) {
    const result = fs.readFileSync(path.join(game, file), 'utf8');
    assert.equal(result.includes('\r\n'), newline === '\r\n');
    assert.equal(ts.createSourceFile(file, result, ts.ScriptTarget.Latest, true).parseDiagnostics.length, 0);
  }
  assert(fs.readFileSync(path.join(game, intentWorld), 'utf8').endsWith(newline + '// unrelated intent marker' + newline));
  assert.throws(() => integrateSkillIntent(game), /Refusing to replace/);
  receipts.push({newline, dryRunPreserved:true, changedInputsRejectedBeforeWrites:true, unrelatedPreserved:true, reapplicationRefused:true});
}
assert.throws(() => renderIntentWorld(original[intentWorld] + '\n// this.comboCursors.get(actor)\n', original[intentWorld]), /New ownership-field caller/);
const retained = path.join(root, '.artifacts/m30-adapter-location.json');
if (fs.existsSync(retained)) {
  const game = JSON.parse(fs.readFileSync(retained)).game;
  assert(renderIntentWorld(fs.readFileSync(path.join(game, intentWorld), 'utf8'), original[intentWorld]).includes('sdkSkillIntent.instances.meta'));
}
verifyReference(reference, lock);
writeJSON(path.join(root, '.artifacts/skill-intent-overlay-verification.json'), {receipts, ownershipCallersGuarded:true, retainedControlChecked:fs.existsSync(retained)});
console.log('Skill-intent overlay rejects changed policies before writes and preserves unrelated World work.');
