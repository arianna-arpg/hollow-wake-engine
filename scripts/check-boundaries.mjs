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
    // An interface field (for example authored timing data named "window")
    // declares a data key; it cannot access a host API. Runtime uses still fail.
    const typeField = node.parent && ts.isPropertySignature(node.parent) && node.parent.name === node;
    if (ts.isIdentifier(node) && forbidden.has(node.text) && !typeField) throw new Error(`${relative}: host API ${node.text}`);
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
assert.ok([...reachable].every(file => path.basename(file)!=='stash-policy.ts'), 'Optional storage policy became an eager core import');
assert.ok([...reachable].every(file => !['container-layout.ts','container-policy.ts','seat-rules.ts'].includes(path.basename(file))), 'Optional container/seat rules became an eager core import');
assert.ok([...reachable].every(file => path.basename(file)!=='relic-custody.ts'), 'Optional account custody became an eager core import');
assert.ok([...reachable].every(file => path.basename(file)!=='relic-actions.ts'), 'Optional account actions became an eager core import');
assert.ok([...reachable].every(file => path.basename(file)!=='equipment-actions.ts'), 'Optional equipment actions became an eager core import');
assert.ok([...reachable].every(file => path.basename(file)!=='character-progression.ts'), 'Optional progression became an eager core import');
assert.ok([...reachable].every(file => !path.basename(file).startsWith('skill-')), 'Optional skill progression became an eager core import');
assert.ok([...reachable].every(file => !path.basename(file).startsWith('support-')), 'Optional support policy became an eager core import');
assert.ok([...reachable].every(file => !['charge-runtime.ts','resource-gauges.ts','resource-content.ts','resource-events.ts','resource-payment.ts'].includes(path.basename(file))), 'Optional resource capabilities became an eager core import');
assert.ok([...reachable].every(file => path.basename(file)!=='charged-casting.ts'), 'Optional charged casting became an eager core import');
assert.ok([...reachable].every(file => path.basename(file)!=='interactive-casting.ts'), 'Optional interactive casting became an eager core import');
assert.ok([...reachable].every(file => path.basename(file)!=='ammunition.ts'), 'Optional ammunition became an eager core import');
assert.ok([...reachable].every(file => path.basename(file)!=='channel-casting.ts'), 'Optional channel casting became an eager core import');
assert.ok([...reachable].every(file => path.basename(file)!=='guard-casting.ts'), 'Optional guard casting became an eager core import');
assert.ok([...reachable].every(file => path.basename(file)!=='cast-seals.ts'), 'Optional cast seals became an eager core import');
assert.ok([...reachable].every(file => path.basename(file)!=='casting-continuation.ts'), 'Optional casting continuation became an eager core import');
assert.ok([...reachable].every(file => !['channel-banks.ts','actor-gauges.ts'].includes(path.basename(file))), 'Optional bank/gauge sampling became an eager core import');
assert.ok([...reachable].every(file => path.basename(file)!=='actor-conditions.ts'), 'Optional actor conditions became an eager core import');
assert.ok([...reachable].every(file => !path.basename(file).startsWith('proc-')), 'Optional procs became an eager core import');
assert.ok([...reachable].every(file => path.basename(file)!=='delayed-bursts.ts'), 'Optional delayed bursts became an eager core import');
assert.ok([...reachable].every(file => !['buffs.ts', 'buff-content.ts'].includes(path.basename(file))), 'Optional buffs became an eager core import');
assert.ok([...reachable].every(file => !['resource-restoration.ts', 'resource-restoration-content.ts'].includes(path.basename(file))), 'Optional restoration became an eager core import');
assert.ok([...reachable].every(file => !['cooldowns.ts', 'cooldown-content.ts', 'cooldown-lifecycle.ts', 'ready-cooldown-bank.ts', 'sequence-recovery.ts'].includes(path.basename(file))), 'Optional cooldowns became an eager core import');
console.log(`Boundary check passed: ${files} production modules; no external runtime dependencies, host APIs, or ambient randomness.`);
