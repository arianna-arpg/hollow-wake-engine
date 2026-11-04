import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root, sha256} from '../../scripts/reference-utils.mjs';
import {procDeliveryTree} from './proc-delivery-tree.mjs';
import {installWorldBinding} from './install-world-binding.mjs';

const acceptance = JSON.parse(fs.readFileSync(path.join(root, 'baseline/proc-delivery/acceptance.json')));
const boundaryBytes = fs.readFileSync(path.join(root, acceptance.sourceBoundary));
assert.equal(sha256(boundaryBytes), acceptance.sourceBoundarySha256);
const boundary = JSON.parse(boundaryBytes);

export function renderProcDelivery(source, preflight = false) {
  const {input, ast, methods} = procDeliveryTree(source);
  assert(!/\b(?:bindProcDelivery|engineProcDelivery)\b/.test(input), 'Proc delivery binding collision');
  const method = methods.executeProc;
  assert.equal(sha256(method.getText(ast)), boundary.maps[preflight ? 'original' : 'predecessor'].methods.executeProc.sha256, 'Unreviewed proc dispatcher');
  if (preflight) return source;
  const imports = ast.statements.filter(ts.isImportDeclaration);
  const edits = [
    {start: imports.at(-1).end, end: imports.at(-1).end, text: "\nimport {bindProcDelivery} from './procDelivery';"},
    {start: method.getStart(ast), end: method.getStart(ast), text: 'private readonly engineProcDelivery = bindProcDelivery(this);\n  '},
    {start: method.body.getStart(ast), end: method.body.end, text: '{\n    this.engineProcDelivery.execute(proc, caster, inst, target, depth, aim);\n  }'},
  ];
  // Remove only imports whose last use was inside this exact method. Count
  // import identifiers and outside uses once, preserving unrelated imports.
  const inside = new Set(), outside = new Map();
  function visit(node) {
    if (ts.isIdentifier(node)) {
      if (node.pos >= method.body.pos && node.end <= method.body.end) inside.add(node.text);
      else outside.set(node.text, (outside.get(node.text) ?? 0) + 1);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const declaration of imports) {
    const names = declaration.importClause?.namedBindings;
    if (!names || !ts.isNamedImports(names)) continue;
    const kept = names.elements.filter(n => !inside.has(n.name.text) || outside.get(n.name.text) !== 1);
    if (kept.length === names.elements.length) continue;
    if (kept.length) edits.push({start: names.getStart(ast), end: names.end, text: '{' + kept.map(n => n.getText(ast)).join(', ') + '}'});
    else {
      assert(!declaration.importClause.name, 'Default import requires review');
      edits.push({start: declaration.getStart(ast), end: declaration.end, text: ''});
    }
  }
  edits.sort((a, b) => a.start - b.start);
  for (let i = 1; i < edits.length; i++) assert(edits[i - 1].end <= edits[i].start);
  let output = input;
  for (const edit of edits.reverse()) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  assert.equal(ts.createSourceFile('world.ts', output, ts.ScriptTarget.Latest, true).parseDiagnostics.length, 0);
  return source.includes('\r\n') ? output.replaceAll('\n', '\r\n') : output;
}
export const procDeliveryDecision = 'Delegate all 22 proc effect branches and the ordered rider tail over live actor state and synchronous host services';
export function integrateProcDelivery(game, write = true) {
  const target = 'src/engine/procDelivery.ts';
  assert(!fs.existsSync(path.join(game, target)), 'Proc delivery binding already exists');
  const world = path.join(game, 'src/engine/world.ts');
  const source = fs.readFileSync(world, 'utf8');
  const output = renderProcDelivery(source, !write);
  const binding = fs.readFileSync(path.join(root, 'adapters/hollow-wake/procDelivery.ts'));
  if (write) installWorldBinding(game, world, source, output, path.join(game, target), binding);
  return {files: ['src/engine/world.ts', target], decision: procDeliveryDecision};
}
