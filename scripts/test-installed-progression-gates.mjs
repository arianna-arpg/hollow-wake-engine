import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { execFileSync } from 'node:child_process';
import { root, sha256, writeJSON } from './reference-utils.mjs';
import { prepareVocationFaultGame } from './vocation-installed-fault-tools.mjs';
import { prepareVocationObserver, captureVocationObserver } from './vocation-reference.mjs';

const [flag, file] = process.argv.slice(2);
assert.equal(flag, '--location');
const location = JSON.parse(fs.readFileSync(path.resolve(file)));
assert(location.progressionGateDecision, 'Prepare an integrated gate game first');
execFileSync(process.execPath, [path.join(root, 'scripts/test-reference-progression-gates.mjs'), '--game', location.game], {
  cwd: root, stdio: 'inherit', windowsHide: true,
});
const { directory, game, copy, verifyUnchanged } = prepareVocationFaultGame(location, 'installed-progression-gates-');
const { fixtures } = JSON.parse(fs.readFileSync(path.join(root, 'baseline/progression-gates/acceptance.json')));
const baseline = fixtures.gates, entry = prepareVocationObserver('gates', game, directory, fixtures);
const target = path.join(copy, 'dist/progression-gates.js'), bytes = fs.readFileSync(target);
const source = bytes.toString(), ast = ts.createSourceFile(target, source, ts.ScriptTarget.Latest, true);
const definitions = fs.readFileSync(path.join(root, 'scripts/test-progression-gate-source-faults.mjs'), 'utf8');
const definitionsAst = ts.createSourceFile('faults.mjs', definitions, ts.ScriptTarget.Latest, true);
const declaration = definitionsAst.statements.filter(ts.isVariableStatement)
  .flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(definitionsAst) === 'faults');
assert(declaration && ts.isArrayLiteralExpression(declaration.initializer));
const faults = declaration.initializer.elements.map(row => {
  assert(ts.isArrayLiteralExpression(row));
  return row.elements.map(value => {
    assert(ts.isStringLiteral(value));
    return value.text;
  });
});
assert.deepEqual(faults.map(row => row[0]), baseline.faults.map(row => row.name));
const expected = new Map(baseline.faults.map(row => [row.name, row.sha256]));
function installedExpression(text) {
  return text
    .replaceAll('gateRowMet(a, row, ownedUnlock)', 'gateRowMet(a, row, ownedUnlock, context)')
    .replaceAll('cls?.name', 'className')
    .replace(/\b(reachedLevelKey|classLevelLedgerKey|vocationUnlockKey|questDoneKey)\b/g, 'context.$1')
    .replaceAll('LEDGER_VOCATION_PREFIX', 'context.vocationPrefix')
    .replaceAll('LEDGER_QUEST_DONE_PREFIX', 'context.questDonePrefix')
    .replaceAll('LEDGER_QUESTS_COMPLETED', 'context.questsCompletedKey');
}
const results = [];
let passed = false;
try {
  assert.equal(captureVocationObserver(entry, directory, 'positive').sha256, baseline.sha256);
  for (const [name, method, originalNeedle, originalReplacement] of faults) {
    const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === method);
    assert(node, method);
    const body = node.getText(ast), needle = installedExpression(originalNeedle);
    const expression = new RegExp(needle.split(/\s+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'g');
    const matches = [...body.matchAll(expression)];
    assert.equal(matches.length, 1, name + ' must select exactly one installed expression');
    const modified = body.replace(expression, () => installedExpression(originalReplacement));
    fs.writeFileSync(target, source.slice(0, node.getStart(ast)) + modified + source.slice(node.end));
    try {
      const observed = captureVocationObserver(entry, directory, name);
      assert.notEqual(observed.sha256, baseline.sha256, name + ' survived');
      assert.equal(observed.sha256, expected.get(name), name + ' diverged from the original fault');
      results.push({ name, method, sha256: observed.sha256, matchedOriginalFault: true });
      writeJSON(path.join(directory, 'progress.json'), { results });
    } finally {
      fs.writeFileSync(target, bytes);
    }
  }
  assert.equal(captureVocationObserver(entry, directory, 'restored').sha256, baseline.sha256);
  passed = true;
} finally {
  assert(fs.readFileSync(target).equals(bytes));
  verifyUnchanged();
  const report = { passed, directory, results, sourceRestored: true, packageRestored: true, baselineSha256: baseline.sha256 };
  writeJSON(path.join(directory, 'verification.json'), report);
  writeJSON(path.join(root, '.artifacts/installed-progression-gates-latest.json'), report);
  console.log({ passed, directory, faults: results.length });
}
