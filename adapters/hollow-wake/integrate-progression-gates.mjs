import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { root, sha256 } from '../../scripts/reference-utils.mjs';
import { installCharacterSources } from './install-character-sources.mjs';

const file = 'meta/gates.ts';
const { methods } = JSON.parse(fs.readFileSync(path.join(root, 'baseline/progression-gates/acceptance.json'))).fixtures.gates;
const argumentsByMethod = {
  ledgerPrefixHeld: 'a, prefix, n',
  gateRowMet: 'a, row, ownedUnlock, engineGateContext',
  gateRowLabel: 'row, engineGateContext',
  gateMet: 'a, rows, mode, ownedUnlock, engineGateContext',
  gateLevelNeeds: 'rows',
  gateClassLevelNeeds: 'rows',
  gateRowProgress: 'a, row, ownedUnlock, engineGateContext',
};
const context = `
import * as engineGates from '@hollow-wake/engine/progression/gates';
// Resolve imports lazily because account and unlock modules form a cycle.
const engineGateContext: engineGates.GateContext = {
  get reachedLevelKey() { return reachedLevelKey; },
  get classLevelLedgerKey() { return classLevelLedgerKey; },
  get vocationUnlockKey() { return vocationUnlockKey; },
  get questDoneKey() { return questDoneKey; },
  get vocationPrefix() { return LEDGER_VOCATION_PREFIX; },
  get questDonePrefix() { return LEDGER_QUEST_DONE_PREFIX; },
  get questsCompletedKey() { return LEDGER_QUESTS_COMPLETED; },
  className: (id: string) => CLASSES.find(definition => definition.id === id)?.name,
};
`;

export function renderProgressionGates(source) {
  const input = source.replaceAll('\r\n', '\n');
  const ast = ts.createSourceFile(file, input, ts.ScriptTarget.Latest, true);
  assert(!/\b(engineGates|engineGateContext)\b/.test(input), 'Gate binding name collision');
  const imports = ast.statements.filter(ts.isImportDeclaration);
  assert(imports.length, 'Missing gate imports');
  const edits = [[imports.at(-1).end, imports.at(-1).end, context]];
  const reviewed = new Set(), declarations = new Map();
  for (const [qualified, digest] of Object.entries(methods)) {
    const name = qualified.split('#')[1];
    const matches = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.equal(matches.length, 1, qualified);
    const declaration = matches[0];
    assert(declaration.body && sha256(declaration.getText(ast)) === digest, 'Unreviewed gate function ' + name);
    declarations.set(name, declaration);
    reviewed.add(declaration);
    if (name !== 'highestStampedLevel') {
      assert(argumentsByMethod[name], name);
      edits.push([declaration.body.getStart(ast), declaration.body.end,
        '{ return engineGates.' + name + '(' + argumentsByMethod[name] + '); }']);
    }
  }
  let helperUsed = false;
  function visit(node) {
    if (reviewed.has(node)) return;
    if (ts.isIdentifier(node) && node.text === 'highestStampedLevel') helperUsed = true;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!helperUsed) {
    const helper = declarations.get('highestStampedLevel');
    edits.push([helper.getFullStart(), helper.end, '']);
  }
  let output = input;
  for (const [start, end, text] of edits.sort((left, right) => right[0] - left[0])) {
    output = output.slice(0, start) + text + output.slice(end);
  }
  return source.includes('\r\n') ? output.replaceAll('\n', '\r\n') : output;
}

export function integrateProgressionGates(game, install = true) {
  const relative = 'src/' + file, before = fs.readFileSync(path.join(game, relative));
  const after = Buffer.from(renderProgressionGates(before.toString('utf8')));
  if (install) installCharacterSources(game, [{ file: relative, before, after }]);
  return { files: [relative], decision: 'live progression requirements, labels, progress and milestone derivation' };
}
