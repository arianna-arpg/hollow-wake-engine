import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { root, listFiles } from './reference-utils.mjs';

const forbidden = new Set(['window', 'document', 'localStorage', 'fetch', 'requestAnimationFrame', 'performance', 'process', 'Date']);
let files = 0;
for (const relative of listFiles(path.join(root, 'src')).filter(file => file.endsWith('.ts'))) {
  const file = path.join(root, 'src', relative);
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const visit = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      const specifier = node.moduleSpecifier.text;
      assert.ok(specifier.startsWith('./') || specifier.startsWith('../'), `${relative}: external import ${specifier}`);
      const resolved = path.resolve(path.dirname(file), specifier);
      assert.ok(resolved.startsWith(path.join(root, 'src') + path.sep), `${relative}: import escapes production source`);
    }
    if (ts.isIdentifier(node) && forbidden.has(node.text)) throw new Error(`${relative}: host API ${node.text}`);
    if (ts.isPropertyAccessExpression(node) && node.expression.getText(source) === 'Math' && node.name.text === 'random') {
      throw new Error(`${relative}: process-wide random source`);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) throw new Error(`${relative}: dynamic production import`);
    ts.forEachChild(node, visit);
  };
  visit(source);
  files++;
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(Object.keys(manifest.dependencies ?? {}).length, 0, 'Production dependencies require an explicit architecture decision');
const reachable = new Set();
function entryGraph(file) {
  if (reachable.has(file)) return; reachable.add(file);
  const source = ts.createSourceFile(file, fs.readFileSync(file,'utf8'), ts.ScriptTarget.Latest, true);
  for (const node of source.statements) if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
    if (node.isTypeOnly || node.importClause?.isTypeOnly) continue;
    entryGraph(path.resolve(path.dirname(file), node.moduleSpecifier.text.replace(/\.js$/,'.ts')));
  }
}
entryGraph(path.join(root,'src/index.ts'));
assert.ok([...reachable].every(file => !path.basename(file).startsWith('item-')), 'Optional item implementation became an eager core import');
assert.ok([...reachable].every(file => !path.basename(file).startsWith('passive-')), 'Optional passive policy became an eager core import');
assert.ok([...reachable].every(file => path.basename(file)!=='inventory-host.ts'), 'Optional live inventory host became an eager core import');
console.log(`Boundary check passed: ${files} production modules; no external runtime dependencies, host APIs, or ambient randomness.`);
