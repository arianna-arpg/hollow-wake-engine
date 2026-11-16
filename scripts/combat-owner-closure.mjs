import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// A linker can verify named ports while missing calls hidden inside closures.
// Inspect those calls independently. This inventory is not execution evidence.
export function inspectCombatOwner(root, owner) {
  const uses = new Map();
  let aliases;
  function access(node) {
    if (ts.isIdentifier(node)) return aliases.has(node.text) ? [] : undefined;
    if (ts.isPropertyAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword && node.name.text === 'w') return [];
    if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)) {
      const parent = access(node.expression);
      return parent && [...parent, node.argumentExpression.text];
    }
    if (!ts.isPropertyAccessExpression(node)) return;
    const parent = access(node.expression);
    return parent && [...parent, node.name.text];
  }
  const directory = path.join(root, 'adapters/embedded');
  for (const file of fs.readdirSync(directory).filter(f => /^combat-.*\.mjs$/.test(f))) {
    const ast = ts.createSourceFile(file, fs.readFileSync(path.join(directory, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    aliases = new Set(['w', 'world']);
    function collect(node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer
        && ts.isIdentifier(node.initializer) && aliases.has(node.initializer.text)) aliases.add(node.name.text);
      ts.forEachChild(node, collect);
    }
    collect(ast);
    function visit(node) {
      if (ts.isCallExpression(node)) {
        const parts = access(node.expression);
        if (parts?.length && !['host', 'observers'].includes(parts[0])) {
          const key = parts.join('.');
          if (!uses.has(key)) uses.set(key, []);
          uses.get(key).push(`${file}:${ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1}`);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  return [...uses].filter(([key]) => {
    let value = owner;
    for (const part of key.split('.')) value = value?.[part];
    return typeof value !== 'function';
  }).sort(([a], [b]) => a.localeCompare(b)).map(([call, sites]) => ({call, sites}));
}
