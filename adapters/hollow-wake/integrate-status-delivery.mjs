import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root, sha256} from '../../scripts/reference-utils.mjs';
import {statusDeliveryTree} from './status-delivery-tree.mjs';

const accepted = JSON.parse(fs.readFileSync(path.join(root, 'baseline/status-delivery/acceptance.json')));
const boundaryBytes = fs.readFileSync(path.join(root, accepted.sourceBoundary));
assert.equal(sha256(boundaryBytes), accepted.sourceBoundarySha256);
const boundary = JSON.parse(boundaryBytes);
function removeUnusedTreeImport(source) {
  const ast = ts.createSourceFile('world.ts', source, ts.ScriptTarget.Latest, true);
  let references = 0;
  const visit = node => {if (ts.isIdentifier(node) && node.text === 'instanceTreeOver') references++; ts.forEachChild(node, visit);}; visit(ast);
  if (references !== 1) return source;
  const imports = ast.statements.filter(ts.isImportDeclaration);
  for (const decl of imports) {
    const names = decl.importClause?.namedBindings;
    if (!names || !ts.isNamedImports(names)) continue;
    const index = names.elements.findIndex(n => n.name.text === 'instanceTreeOver');
    if (index < 0) continue;
    const nodes = names.elements;
    if (nodes.length === 1) {
      assert(!decl.importClause.name, 'Cannot remove a default import');
      return source.slice(0, decl.getStart(ast)) + source.slice(decl.end);
    }
    const last = index === nodes.length - 1;
    const start = last ? nodes[index - 1].end : nodes[index].getFullStart();
    const end = last ? nodes[index].end : nodes[index + 1].getFullStart();
    return source.slice(0, start) + source.slice(end);
  }
  throw Error('Unresolved orphan instanceTreeOver identifier');
}
export function renderStatusDelivery(source, preflight = false) {
  const {input, ast, branches, field, retirement} = statusDeliveryTree(source);
  assert(!/\b(?:engineStatusDelivery|bindStatusDelivery)\b/.test(input), 'Status delivery binding collision');
  const expected = boundary.maps[preflight ? 'original' : 'installed'];
  for (const [name, branch] of Object.entries(branches)) assert.equal(sha256(branch.getText(ast)), expected.branches[name].sha256, 'Unreviewed status delivery: ' + name);
  assert.equal(sha256(field.getText(ast)), expected.recallIdentity.fieldSha256, 'Unreviewed recall identity owner');
  assert.equal(sha256(retirement.getText(ast)), expected.recallIdentity.retirementSha256, 'Unreviewed recall retirement');
  if (preflight) return source;
  const retirementBefore = 'this.recallTreeSpears.get(p.inst) !== inst';
  assert.equal(retirement.getText(ast).split(retirementBefore).length, 2);
  const imports = ast.statements.filter(ts.isImportDeclaration);
  const edits = [
    {start: imports.at(-1).end, end: imports.at(-1).end, text: "\nimport {bindStatusDelivery} from './statusDelivery';"},
    {start: branches.siphonStatus.thenStatement.getStart(ast), end: branches.siphonStatus.thenStatement.end,
      text: '{\n        this.engineStatusDelivery.siphon(caster, fx, aoeScale, def, tags, extra, cosmeticColor);\n      }'},
    {start: branches.recallImpales.thenStatement.getStart(ast), end: branches.recallImpales.thenStatement.end,
      text: '{\n        this.engineStatusDelivery.recall(caster, inst, fx, aoeScale, def);\n      }'},
    {start: field.getStart(ast), end: field.end, text: 'private readonly engineStatusDelivery = bindStatusDelivery(this);'},
    {start: retirement.getStart(ast), end: retirement.end,
      text: retirement.getText(ast).replace(retirementBefore, '!this.engineStatusDelivery.isReturnedFrom(p.inst, inst)')},
  ].sort((a, b) => a.start - b.start);
  for (let i = 1; i < edits.length; i++) assert(edits[i - 1].end <= edits[i].start);
  let output = input;
  for (const edit of edits.reverse()) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  output = removeUnusedTreeImport(output);
  assert.equal(ts.createSourceFile('world.ts', output, ts.ScriptTarget.Latest, true).parseDiagnostics.length, 0);
  assert(!/\brecallTreeSpears\b/.test(output), 'Legacy recall ownership survived');
  return source.includes('\r\n') ? output.replaceAll('\n', '\r\n') : output;
}
export const statusDeliveryDecision = 'Delegate complete caster-side siphoning and Impale recall with exact-instance returned-spear ownership; compose native transplant, mitigation, flight and retirement through synchronous ports';
export function integrateStatusDelivery(game, write = true) {
  const target = 'src/engine/statusDelivery.ts';
  assert(!fs.existsSync(path.join(game, target)), 'Status delivery binding already exists');
  const output = renderStatusDelivery(fs.readFileSync(path.join(game, 'src/engine/world.ts'), 'utf8'), !write);
  const binding = fs.readFileSync(path.join(root, 'adapters/hollow-wake/statusDelivery.ts'));
  if (write) {
    fs.writeFileSync(path.join(game, 'src/engine/world.ts'), output);
    fs.writeFileSync(path.join(game, target), binding, {flag: 'wx'});
  }
  return {files: ['src/engine/world.ts', target], decision: statusDeliveryDecision};
}
