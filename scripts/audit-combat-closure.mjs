import fs from 'node:fs';
import ts from 'typescript';
import {root, writeJSON} from './reference-utils.mjs';
import path from 'node:path';

// Development inventory; this is not a runtime or a coverage assertion.
const source = fs.readFileSync(path.join(root, '.reference/src/engine/world.ts'), 'utf8');
const ast = ts.createSourceFile('world.ts', source, ts.ScriptTarget.Latest, true);
const world = ast.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'World');
if (!world) throw Error('Pinned World declaration missing');
const methods = {};
for (const method of world.members) {
  if (!ts.isMethodDeclaration(method) || !method.body) continue;
  const calls = new Set(), properties = new Set(), names = new Set();
  function visit(node) {
    if (ts.isPropertyAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword) {
      properties.add(node.name.text);
      if (ts.isCallExpression(node.parent) && node.parent.expression === node) calls.add(node.name.text);
    }
    if (ts.isIdentifier(node)) names.add(node.text);
    ts.forEachChild(node, visit);
  }
  visit(method.body);
  methods[method.name.getText(ast)] = {
    line: ast.getLineAndCharacterOfPosition(method.getStart(ast)).line + 1,
    lines: method.getText(ast).split('\n').length,
    calls: [...calls].sort(), properties: [...properties].sort(), names: [...names].sort(),
  };
}
writeJSON(path.join(root, '.artifacts/m3-combat-closure.json'), methods);
const requested = process.argv.slice(2);
for (const name of requested) {
  if (!methods[name]) throw Error('Unknown World method: ' + name);
  const {line, lines, calls} = methods[name];
  console.log({name, line, lines, calls});
}
