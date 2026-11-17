import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {transform} from 'esbuild';
import {root, sha256, writeJSON} from './reference-utils.mjs';
import {readParitySource,parityDirectory} from './prototype-parity-tools.mjs';

const prototype=process.argv.includes('--prototype'),pinned=prototype?readParitySource():undefined;
const lock = pinned?.lock??JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json')));
const sources = {}, imports = new Map(), pieces = [];
function source(file) {
  const bytes = pinned?.files.get(file)??fs.readFileSync(path.join(root, '.reference', file));
  assert.equal(sha256(bytes), lock.files[file]); sources[file] = sha256(bytes);
  return ts.createSourceFile(file, bytes.toString(), ts.ScriptTarget.Latest, true);
}
const ai = source('src/engine/ai.ts');
const issue = ai.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'issueCommand');
assert(issue);
const cueFunctions = ['companionCueStyle', 'companionMaterial', 'companionCueVisible', 'point', 'companionCueFlash', 'companionCueSpec'];
for (const file of ['src/engine/assault.ts', 'src/engine/replenishment.ts', 'src/engine/companionCues.ts', 'src/engine/ai.ts', 'src/engine/actor.ts', 'src/engine/world.ts']) {
  const ast = source(file);
  const selection = file.endsWith('/companionCues.ts') ? cueFunctions : file.endsWith('/ai.ts') ? ['issueCommand', 'obedienceOf', 'DEFAULT_BRAIN'] : file.endsWith('/actor.ts') ? ['shellArcFactor'] : file.endsWith('/world.ts') ? ['registerConvertRule'] : undefined;
  const nodes = ast.statements.filter(n => !ts.isImportDeclaration(n) && (!selection ||
    ts.isFunctionDeclaration(n) && selection.includes(n.name?.text) || ts.isVariableStatement(n) && n.declarationList.declarations.some(d => selection.includes(d.name.getText(ast)))
    || ts.isExpressionStatement(n) && ts.isCallExpression(n.expression) && selection.includes(n.expression.expression.getText(ast))));
  if (file.endsWith('/companionCues.ts')) assert.equal(nodes.length, cueFunctions.length);
  const text = nodes.map(n => n.getText(ast).replace(/^export /, '')).join('\n');
  const js = (await transform(text, {loader: 'ts', target: 'es2022', legalComments: 'none'})).code.replaceAll('Math.random()', 'w.random()');
  pieces.push(js);
  const names = new Set();
  const collect = n => {if (ts.isIdentifier(n)) names.add(n.text); ts.forEachChild(n, collect);};
  collect(ts.createSourceFile('controllers.js', js, ts.ScriptTarget.Latest, true));
  for (const n of ast.statements.filter(ts.isImportDeclaration)) {
    const bindings = n.importClause?.namedBindings;
    if (n.importClause?.isTypeOnly || !bindings || !ts.isNamedImports(bindings)) continue;
    for (const item of bindings.elements) {
      if (item.isTypeOnly || !names.has(item.name.text) || ['issueCommand', 'mitigateTyped', 'landLifeDamage', 'registerConvertRule'].includes(item.name.text)) continue;
      const row = {name: item.name.text, imported: (item.propertyName ?? item.name).text, source: n.moduleSpecifier.text};
      if (imports.has(row.name)) assert.deepEqual(imports.get(row.name), row); else imports.set(row.name, row);
    }
  }
}
const compiled = (await transform(pieces.join('\n'), {loader: 'ts', target: 'es2022', legalComments: 'none'})).code;
const output = prototype?'adapters/embedded/combat-prototype-commands.mjs':'adapters/embedded/combat-command-controllers.mjs';
const code = `// Generated isolated combat commands. General AI planning stays in the host.
export function createCombatCommands(w, q) {
  const {${[...imports.keys()].sort().join(', ')}} = q;
  const mitigateTyped = (...args) => w.damage.mitigateTyped(...args);
  const landLifeDamage = (...args) => w.damage.landLifeDamage(...args);
  const conversions = Object.create(null);
  const registerConvertRule = (id, rule) => {conversions[id] = rule;};
  ${compiled}
  return {assaults: new Assaults(w), replenishment: new ReplenishmentClocks(), issueCommand, obedienceOf, assaultOrbitPositions, replenishShape, replenishmentActive, companionCueFlash, companionCueSpec, shellArcFactor,
    conversionIds: Object.freeze(Object.keys(conversions)), convertRuleHolds: (id, actor, inst) => conversions[id]?.(actor, inst, w) ?? false};
}
`;
const manifestPath = prototype?path.join(parityDirectory,'commands-extraction.json'):path.join(root, 'baseline/combat-command-controllers-extraction.json');
const manifest = {schemaVersion: 1, sourceCommit: lock.commit, sources, queries: [...imports.values()], outputs: {[output]: sha256(code)},
  issueCommandSha256: sha256(issue.getText(ai)), changes: ['Shared SDK damage', 'Per-owner random source', 'Extract command assignment only, without importing AI planning',
    'Extract companion cue construction without stance AI registration']};
if (process.argv.includes('--check')) {
  assert.equal(fs.readFileSync(path.join(root, output), 'utf8'), code);
  assert.deepEqual(JSON.parse(fs.readFileSync(manifestPath)), manifest);
} else {
  if (process.argv.includes('--update-draft')) {
    const previous = JSON.parse(fs.readFileSync(manifestPath));
    assert.equal(sha256(fs.readFileSync(path.join(root, output))), previous.outputs[output]);
  } else assert(!fs.existsSync(path.join(root, output)), 'Refusing to overwrite combat controllers');
  fs.writeFileSync(path.join(root, output), code); writeJSON(manifestPath, manifest);
}
console.log({passed: true, controllers: 2, queries: imports.size});
