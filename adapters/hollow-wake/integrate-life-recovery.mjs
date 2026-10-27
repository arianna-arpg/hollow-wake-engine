import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root, sha256} from '../../scripts/reference-utils.mjs';

export const recoveryPaths = {actor: 'src/engine/actor.ts', world: 'src/engine/world.ts', binding: 'src/engine/lifeRecoveryAdapter.ts'};
const contract = JSON.parse(fs.readFileSync(path.join(root, 'baseline/milestone-forty-two/adapter-contract.json')));
const lf = text => text.replaceAll('\r\n', '\n');
const name = node => node.name && (ts.isComputedPropertyName(node.name)
  ? ts.isStringLiteral(node.name.expression) ? node.name.expression.text : undefined : node.name.text);

export function recoveryTree(source, kind) {
  assert(kind === 'actor' || kind === 'world', 'Invalid recovery source kind');
  const ast = ts.createSourceFile(recoveryPaths[kind], source, ts.ScriptTarget.Latest, true);
  assert.equal(ast.parseDiagnostics.length, 0, 'Invalid recovery source: ' + kind);
  const owners = ast.statements.filter(n => ts.isClassDeclaration(n) && name(n) === (kind === 'actor' ? 'Actor' : 'World'));
  assert.equal(owners.length, 1, 'Ambiguous recovery owner: ' + kind);
  const owner = owners[0], members = {};
  for (const key of kind === 'actor' ? Object.keys(contract.actorMembers) : ['executeProc']) {
    const found = owner.members.filter(n => name(n) === key);
    assert.equal(found.length, 1, 'Ambiguous recovery member: ' + key);
    const node = found[0];
    assert.equal(ts.SyntaxKind[node.kind], kind === 'actor' ? contract.actorMembers[key].kind : 'MethodDeclaration', 'Invalid recovery member: ' + key);
    if (ts.isMethodDeclaration(node)) assert(node.body, 'Invalid recovery body: ' + key);
    members[key] = node;
  }
  let cases, heal;
  if (kind === 'world') {
    const switches = members.executeProc.body.statements.filter(ts.isSwitchStatement);
    assert.equal(switches.length, 1, 'Ambiguous recovery switch');
    assert.equal(switches[0].expression.getText(ast), 'fx.type', 'Unreviewed recovery discriminator');
    cases = switches[0].caseBlock.clauses;
    assert(cases.every(n => ts.isCaseClause(n) && ts.isStringLiteral(n.expression)), 'Invalid recovery cases');
    assert.deepEqual(cases.map(n => n.expression.text), Object.keys(contract.caseHashes), 'Unreviewed recovery case order');
    heal = cases.find(n => n.expression.text === 'heal');
  }
  return {ast, owner, members, cases, heal};
}

export function renderLifeRecoverySource(source, kind) {
  const input = lf(source), tree = recoveryTree(input, kind), {ast, members} = tree;
  let tapReferences = 0;
  const scan = node => {
    if (ts.isIdentifier(node) && node.text === 'SIM_TAP') tapReferences++;
    if (ts.isIdentifier(node)) assert(!contract.reservedNames.includes(node.text), 'Recovery binding collision: ' + node.text);
    if (node.name) assert(!contract.reservedNames.includes(name(node)), 'Recovery binding collision: ' + name(node));
    ts.forEachChild(node, scan);
  };
  scan(ast);
  const imports = ast.statements.filter(ts.isImportDeclaration);
  assert.equal(imports.filter(n => n.getText(ast) === contract.existingImports[kind]).length, 1, 'Unreviewed recovery import: ' + kind);
  for (const [key, node] of Object.entries(members)) {
    assert.equal(sha256(node.getText(ast)), kind === 'actor' ? contract.actorMembers[key].sha256 : contract.worldMethodSha256, 'Unreviewed recovery member: ' + key);
  }
  const edits = [{start: imports.at(-1).end, end: imports.at(-1).end, text: '\n' + contract.imports[kind].join('\n')}];
  if (kind === 'actor') {
    assert.equal(tapReferences, contract.removedActorTapImport.identifierOccurrences, 'Unreviewed recovery tap references');
    const tapImport = imports.find(n => n.getText(ast) === contract.existingImports.actor);
    edits.push({start: tapImport.getStart(ast), end: tapImport.end, text: ''});
    for (const [key, text] of [
      ['healBy', '{ return engineHealLife(this, amount, lifeRecoveryPorts, silent); }'],
      ['refillLife', '{ engineRefillLife(this, lifeRecoveryPorts); }'],
    ]) edits.push({start: members[key].body.getStart(ast), end: members[key].body.end, text});
  } else {
    for (const clause of tree.cases) assert.equal(sha256(clause.getText(ast)), contract.caseHashes[clause.expression.text], 'Unreviewed recovery case');
    edits.push({start: tree.heal.getStart(ast), end: tree.heal.end,
      text: "case 'heal': {\n        if (engineApplyProcHeal(caster, fx, lifeRecoveryPorts, caster.healBy)) noteProcCue(caster, procCue, 'gain', proc.id);\n        break;\n      }"});
  }
  edits.sort((a, b) => b.start - a.start);
  for (let i = 1; i < edits.length; i++) assert(edits[i].end <= edits[i - 1].start, 'Overlapping recovery edits');
  let output = input;
  for (const edit of edits) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  recoveryTree(output, kind);
  return output;
}

/** Validate both source files and the absent binding before writing any file. */
export function integrateLifeRecovery(game, write = true) {
  const binding = path.join(game, recoveryPaths.binding);
  assert(!fs.existsSync(binding), 'Recovery binding already exists');
  const edits = ['actor', 'world'].map(kind => {
    const file = recoveryPaths[kind], source = fs.readFileSync(path.join(game, file), 'utf8');
    return [file, renderLifeRecoverySource(source, kind).replaceAll('\n', source.includes('\r\n') ? '\r\n' : '\n')];
  });
  edits.push([recoveryPaths.binding, fs.readFileSync(path.join(root, 'adapters/hollow-wake/lifeRecoveryAdapter.ts'), 'utf8')]);
  if (write) for (const [file, text] of edits) fs.writeFileSync(path.join(game, file), text, {flag: file === recoveryPaths.binding ? 'wx' : 'w'});
  return {files: edits.map(([file]) => file), decision: contract.decision};
}
