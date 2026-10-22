import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { root, verifyReference, writeJSON } from './reference-utils.mjs';
import { requestWorld, integrateSkillRequest, renderRequestWorld } from '../adapters/hollow-wake/integrate-skill-request.mjs';

const reference = path.join(root, '.reference'), lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json')));
verifyReference(reference, lock);
const original = fs.readFileSync(path.join(reference, requestWorld), 'utf8').replaceAll('\r\n', '\n');
function method(source) {
  const ast = ts.createSourceFile(requestWorld, source, ts.ScriptTarget.Latest, true);
  return ast.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'World').members.find(n => n.name?.getText(ast) === 'useSkill');
}
const receipts = [];
for (const newline of ['\n', '\r\n']) {
  const game = fs.mkdtempSync(path.join(root, '.artifacts/request-overlay-'));
  fs.mkdirSync(path.join(game, 'src/engine'), { recursive: true });
  const source = original + '\n// unrelated request marker\n', file = path.join(game, requestWorld);
  const input = source.replaceAll('\n', newline); fs.writeFileSync(file, input);
  integrateSkillRequest(game, false); assert.equal(fs.readFileSync(file, 'utf8'), input);
  for (const [before, after] of [
    ['hold.struggle += GRAB_CFG.break.mashPress', 'hold.struggle += 0'],
    ["caster.life > dv.lockAboveLife", "caster.life >= dv.lockAboveLife"],
    ['if (caster.reserves && caster.reserveSpecs)', 'if (caster.reserves)'],
  ]) {
    assert(source.includes(before)); const changed = source.replace(before, after).replaceAll('\n', newline); fs.writeFileSync(file, changed);
    assert.throws(() => integrateSkillRequest(game), /Unreviewed/); assert.equal(fs.readFileSync(file, 'utf8'), changed);
  }
  fs.writeFileSync(file, input); integrateSkillRequest(game);
  const output = fs.readFileSync(file, 'utf8'), normalized = output.replaceAll('\r\n', '\n');
  assert.equal(output.includes('\r\n'), newline === '\r\n');
  assert(normalized.endsWith('\n// unrelated request marker\n'));
  const before = method(source), after = method(normalized);
  assert.equal(source.slice(before.body.statements[16].getFullStart(), before.end),
    normalized.slice(after.body.statements[2].getFullStart(), after.end), 'Host continuation changed');
  assert.throws(() => integrateSkillRequest(game), /already integrated/);
  receipts.push({ newline, dryRunPreserved: true, changedInputsRejectedBeforeWrites: true, hostContinuationPreserved: true, reapplicationRefused: true });
}
assert.throws(() => renderRequestWorld(original + '\n// sdkRequestResult\n', original), /collision/);
const retained = path.join(root, '.artifacts/m32-adapter-location.json');
if (fs.existsSync(retained)) {
  const game = JSON.parse(fs.readFileSync(retained)).game;
  assert(renderRequestWorld(fs.readFileSync(path.join(game, requestWorld), 'utf8'), original).includes('sdkSkillRequest.preflight'));
}
verifyReference(reference, lock);
writeJSON(path.join(root, '.artifacts/skill-request-overlay-verification.json'), { receipts, retainedControlChecked: fs.existsSync(retained) });
console.log('Request overlay preserves the host continuation and refuses changed authority before writes.');
