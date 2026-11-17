import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {transform} from 'esbuild';
import {root, sha256, writeJSON} from './reference-utils.mjs';
import {renderChargedCasting} from '../adapters/hollow-wake/integrate-charged-casting.mjs';
import {renderChannelCasting} from '../adapters/hollow-wake/integrate-channel-casting.mjs';
import {renderGuardWorld} from '../adapters/hollow-wake/integrate-guard-casting.mjs';

const lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json')));
const sources = {}, declarations = [], queryImports = new Map(), sdkImports = new Map();
const read = file => {const bytes = fs.readFileSync(path.join(root, file)); sources[file] = sha256(bytes); return bytes.toString();};
const original = read('.reference/src/engine/world.ts');
assert.equal(sources['.reference/src/engine/world.ts'], lock.files['src/engine/world.ts']);
const parse = text => ts.createSourceFile('binding.ts', text, ts.ScriptTarget.Latest, true);
const worldAst = parse(original);
const printer = ts.createPrinter({removeComments: true});
const importsFrom = (ast, names) => {
  for (const node of ast.statements.filter(ts.isImportDeclaration)) {
    const bindings = node.importClause?.namedBindings;
    if (node.importClause?.isTypeOnly || !bindings || !ts.isNamedImports(bindings)) continue;
    for (const item of bindings.elements) {
      if (item.isTypeOnly || !names.has(item.name.text)) continue;
      const row = {name: item.name.text, imported: (item.propertyName ?? item.name).text, source: node.moduleSpecifier.text};
      const table = row.source.startsWith('@') ? sdkImports : queryImports;
      if (table.has(row.name)) assert.deepEqual(table.get(row.name), row);
      else table.set(row.name, row);
    }
  }
};
async function add(text, imports) {
  const result = ts.transform(parse(text), [context => node => {
    function visit(n) {
      if (n.kind === ts.SyntaxKind.ThisKeyword) return ts.factory.createIdentifier('w');
      return ts.visitEachChild(n, visit, context);
    }
    return ts.visitNode(node, visit);
  }]);
  let js;
  try {js = (await transform(printer.printFile(result.transformed[0]), {loader: 'ts', target: 'es2022', legalComments: 'none'})).code.replaceAll('Math.random()', 'w.random()');}
  finally {result.dispose();}
  const names = new Set();
  const collect = n => {if (ts.isIdentifier(n)) names.add(n.text); ts.forEachChild(n, collect);};
  collect(parse(js)); importsFrom(imports, names); declarations.push(js);
}
function objectArgument(ast, factory) {
  const matches = [];
  const visit = n => {
    if ((ts.isNewExpression(n) || ts.isCallExpression(n)) && n.expression.getText(ast) === factory) {
      for (const arg of n.arguments ?? []) if (ts.isObjectLiteralExpression(arg)) matches.push(arg);
    }
    ts.forEachChild(n, visit);
  };
  visit(ast); assert.equal(matches.length, 1, factory); return matches[0];
}
for (const [name, file, factory, omit] of [
  ['request', 'skill-request-ports.txt', 'SkillRequest', []],
  ['dispatch', 'skill-dispatch-ports.txt', 'SkillDispatch', []],
  ['continuation', 'casting-continuation-ports.txt', 'CastingContinuation', ['finesse']],
]) {
  const ast = parse('class Ports {' + read('adapters/hollow-wake/' + file) + '}');
  // Continuation has a second configuration object; select its port record by
  // the number of properties instead of accepting an ambiguous factory match.
  const records = [];
  const visit = n => {if (ts.isNewExpression(n) && n.expression.getText(ast) === factory) records.push(n.arguments[0]); ts.forEachChild(n, visit);};
  visit(ast); assert.equal(records.length, 1); const record = records[0];
  const kept = record.properties.filter(p => !omit.includes(p.name?.getText(ast)));
  await add(`const ${name} = ${printer.printNode(ts.EmitHint.Expression, ts.factory.updateObjectLiteralExpression(record, kept), ast)};`, worldAst);
}
for (const [name, render, adapter, factory] of [
  ['chargedEffects', renderChargedCasting, 'chargedCastingAdapter', 'createChargedCasting'],
  ['channelEffects', renderChannelCasting, 'channelCastingAdapter', 'createChannelCasting'],
  ['guardEffects', renderGuardWorld, 'guardCastingAdapter', 'createGuardCasting'],
]) {
  // The reviewed integrators operate on strings; no game checkout is changed.
  const rendered = parse(render(original, original));
  const record = objectArgument(rendered, factory);
  await add(`const ${name} = ${printer.printNode(ts.EmitHint.Expression, record, rendered)};`, rendered);
  const ast = parse(read('adapters/hollow-wake/' + adapter + '.ts'));
  const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === factory);
  assert(fn); await add(fn.getText(ast).replace(/^export /, ''), ast);
}
const intentAst = parse(read('adapters/hollow-wake/skillIntentAdapter.ts'));
const instances = objectArgument(intentAst, 'SkillInstances');
await add(`const instances = new SkillInstances(${printer.printNode(ts.EmitHint.Expression, instances, intentAst)});`, intentAst);
const intent = objectArgument(intentAst, 'SkillIntent');
const intentKept = intent.properties.filter(p => !['castSeal', 'sealShuts'].includes(p.name?.getText(intentAst)));
await add(`const intentPorts = ${printer.printNode(ts.EmitHint.Expression, ts.factory.updateObjectLiteralExpression(intent, intentKept), intentAst)};`, intentAst);
// Source adapters refer to the world name only in the intent closure.
for (const name of ['rand', 'randInt', 'chance', 'pick', 'vec', 'convertRuleHolds']) queryImports.delete(name);
for (const [source, names] of [['./skills', ['TRIGGER_CFG', 'BASH_CFG', 'CONCENTRATION_CFG', 'LOS_CFG']]]) {
  for (const name of names) if (!queryImports.has(name)) {
    const known = worldAst.statements.filter(ts.isImportDeclaration).flatMap(n => {
      const b = n.importClause?.namedBindings;
      return b && ts.isNamedImports(b) ? b.elements.filter(e => e.name.text === name).map(e => ({name, imported: (e.propertyName ?? e.name).text, source: n.moduleSpecifier.text})) : [];
    });
    assert.equal(known.length, 1, name); queryImports.set(name, known[0]);
  }
}
const sdkLines = [...sdkImports.values()].map(row => `import {${row.imported === row.name ? row.name : row.imported + ' as ' + row.name}} from '${row.source}';`);
const code = `// Generated from reviewed casting adapters; all callbacks target the SDK owner.
${sdkLines.join('\n')}
export function combatCastingBindings(w, q) {
  const world = w;
  const convertRuleHolds = (...args) => w.convertRuleHolds(...args);
  const {${[...queryImports.keys()].sort().join(', ')}} = q;
  const vec = (x, y) => ({x, y});
  const rand = (a, b) => a + w.random() * (b - a);
  const randInt = (a, b) => Math.floor(a + w.random() * (b + 1 - a));
  const chance = p => w.random() < p;
  const pick = values => values[Math.floor(w.random() * values.length)];
  ${declarations.join('\n')}
  continuation.finesse = actor => w.host.intent?.finesse?.(actor.id);
  channelEffects.beforeRelease = (actor, state) => {
    w.channelFormations?.release(actor, state);
    if (!actor.dead) w.frameArts?.release(actor, state.inst);
  };
  intentPorts.castSeal = () => w.host.castSeal?.current();
  intentPorts.sealShuts = (spec, actor, inst) => w.host.castSeal.shuts(spec, actor.id, inst.def.id);
  return {request, dispatch, continuation, instances, intent: new SkillIntent(instances, intentPorts),
    charged: createChargedCasting(chargedEffects), channel: createChannelCasting(channelEffects), guard: createGuardCasting(guardEffects)};
}
`;
// These named constructors are used in the generated assembly itself.
assert(sdkImports.has('SkillInstances'));
const finalCode = `import {SkillIntent} from '@hollow-wake/engine/casting/intent';\n` + code;
for (const file of ['integrate-charged-casting', 'integrate-channel-casting', 'integrate-guard-casting']) read('adapters/hollow-wake/' + file + '.mjs');
const output = 'adapters/embedded/combat-casting-bindings.mjs', manifestPath = path.join(root, 'baseline/combat-casting-bindings-extraction.json');
const manifest = {schemaVersion: 1, sourceCommit: lock.commit, sources, queries: [...queryImports.values()], outputs: {[output]: sha256(finalCode)},
  changes: ['Compose existing SDK casting controllers', 'Per-owner random source', 'Host intent and cast seal projections instead of general AI or geography']};
if (process.argv.includes('--check')) {
  assert.equal(fs.readFileSync(path.join(root, output), 'utf8'), finalCode);
  assert.deepEqual(JSON.parse(fs.readFileSync(manifestPath)), manifest);
} else {
  if (process.argv.includes('--update-draft')) {
    const previous = JSON.parse(fs.readFileSync(manifestPath));
    assert.equal(sha256(fs.readFileSync(path.join(root, output))), previous.outputs[output]);
  } else assert(!fs.existsSync(path.join(root, output)), 'Refusing to overwrite casting bindings');
  fs.writeFileSync(path.join(root, output), finalCode); writeJSON(manifestPath, manifest);
}
console.log({passed: true, castingControllers: 7, queries: queryImports.size});
