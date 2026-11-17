import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import assert from 'node:assert/strict';
import {transform} from 'esbuild';
import {root, sha256, writeJSON} from './reference-utils.mjs';

// Select only the actor's combat frame. World simulation, AI planning,
// geography generation, account advancement and quest clocks are excluded.
const file = 'src/engine/world.ts', bytes = fs.readFileSync(path.join(root, '.reference', file));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json')));
assert.equal(sha256(bytes), lock.files[file]);
const ast = ts.createSourceFile(file, bytes.toString(), ts.ScriptTarget.Latest, true);
let loop;
function locate(n) {
  if (ts.isForOfStatement(n) && n.expression.getText(ast) === 'this.actors' && ts.isBlock(n.statement)
    && n.statement.statements.some(s => s.getText(ast) === 'const atf = this.timeflow.actorScale(a);')) {assert(!loop); loop = n;}
  ts.forEachChild(n, locate);
}
locate(ast); assert(loop);
const groups = {
  beforeTimers: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  afterTimers: [17, 18, 19],
  afterBanks: [26, 27, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38],
  afterStatuses: [45, 46, 47, 48, 49, 50, 51, 52, 53, 54],
};
const printer = ts.createPrinter({removeComments: true}), pieces = [], observations = {};
for (const [name, indexes] of Object.entries(groups)) {
  const nodes = indexes.map(i => loop.statement.statements[i]); assert(nodes.every(Boolean));
  observations[name] = nodes.map(n => ({line: ast.getLineAndCharacterOfPosition(n.getStart(ast)).line + 1, sha256: sha256(n.getText(ast))}));
  let nestedLoops = 0;
  const result = ts.transform(nodes, [context => node => {
    function visit(n) {
      if (n.kind === ts.SyntaxKind.ThisKeyword) return ts.factory.createIdentifier('w');
      if (n.getText(ast) === 'Math.random') return ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('w'), 'random');
      if (ts.isContinueStatement(n) && !nestedLoops) return ts.factory.createReturnStatement(ts.factory.createFalse());
      const inner = ts.isForStatement(n) || ts.isForOfStatement(n) || ts.isForInStatement(n) || ts.isWhileStatement(n) || ts.isDoStatement(n);
      if (inner) nestedLoops++;
      const out = ts.visitEachChild(n, visit, context);
      if (inner) nestedLoops--;
      return out;
    }
    return ts.visitNode(node, visit);
  }]);
  let source;
  try {source = result.transformed.map(n => printer.printNode(ts.EmitHint.Unspecified, n, ast)).join('\n');}
  finally {result.dispose();}
  pieces.push(`function ${name}(a, ${name === 'beforeTimers' ? 'flowDt, rawDt' : name === 'afterStatuses' ? 'dt, steeredCast' : 'dt'}) {\n${source}\n${name === 'beforeTimers' ? 'return dt;' : name === 'afterBanks' ? 'return steeredCast;' : ''}\n}`);
}
const speedLinger = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'speedLingerMul');
assert(speedLinger); pieces.push(speedLinger.getText(ast));
let js = (await transform(pieces.join('\n'), {loader: 'ts', target: 'es2022', legalComments: 'none'})).code;
const pushPlacement='a.pos = w.clampPos(vec(a.pos.x + p.vx * dt, a.pos.y + p.vy * dt), a.radius, from, { out: sc, mover: a });';
assert.equal(js.split(pushPlacement).length,2,'Knockback placement changed');
js=js.replace(pushPlacement,pushPlacement+'\n    w.deviceContacts?.record(a, from, a.pos, a.tier, a.flying || !!a.leap || w.levitating(a));');
const names = new Set();
function collect(n) {if (ts.isIdentifier(n)) names.add(n.text); ts.forEachChild(n, collect);}
collect(ts.createSourceFile('phases.js', js, ts.ScriptTarget.Latest, true));
const queries = [];
const local = new Set(['rand', 'randInt', 'chance', 'pick', 'isDormant', 'syncAttributeBequests', 'mitigateTyped', 'landLifeDamage']);
for (const statement of ast.statements.filter(ts.isImportDeclaration)) {
  const b = statement.importClause?.namedBindings;
  if (statement.importClause?.isTypeOnly || !b || !ts.isNamedImports(b)) continue;
  for (const item of b.elements) if (!item.isTypeOnly && names.has(item.name.text) && !local.has(item.name.text))
    queries.push({name: item.name.text, imported: (item.propertyName ?? item.name).text, source: statement.moduleSpecifier.text});
}
const output = 'adapters/embedded/combat-actor-phases.mjs';
const code = `// Generated ordered combat frame pieces; the owner binds SDK services.
export function createCombatActorPhases(w, q) {
  const {${queries.map(q => q.name).join(', ')}} = q;
  const rand = (a, b) => a + w.random() * (b - a), chance = p => w.random() < p;
  const randInt = (a, b) => Math.floor(a + w.random() * (b + 1 - a));
  const pick = rows => rows[Math.floor(w.random() * rows.length)];
  const isDormant = a => w.isDormant(a);
  const syncAttributeBequests = (...args) => w.bequests.sync(...args);
  const mitigateTyped = (...args) => w.damage.mitigateTyped(...args);
  const landLifeDamage = (...args) => w.damage.landLifeDamage(...args);
  const PUSH_DAMPING = w.rules.pushDamping;
  ${js}
  return {beforeTimers, afterTimers, afterBanks, afterStatuses};
}
`;
const manifest = {schemaVersion: 1, sourceCommit: lock.commit, source: file, sourceSha256: sha256(bytes), blocks: observations, localQueries: {speedLingerMul: sha256(speedLinger.getText(ast))},
  queries, outputs: {[output]: sha256(code)}, changes: ['Per-owner random source', 'Retain actor phase order',
    'Reuse SDK actor timers, status, proc, damage and bank services between these phases', 'Return from actor phase where the original continued the outer actor loop',
    'Optional prototype ground-device observer records the resolved knockback segment']};
const manifestPath = path.join(root, 'baseline/combat-actor-phases-extraction.json');
if (process.argv.includes('--check')) {
  assert.equal(fs.readFileSync(path.join(root, output), 'utf8'), code);
  assert.deepEqual(JSON.parse(fs.readFileSync(manifestPath)), manifest);
} else {
  if (process.argv.includes('--update-draft')) {
    const prior = JSON.parse(fs.readFileSync(manifestPath));
    assert.equal(sha256(fs.readFileSync(path.join(root, output))), prior.outputs[output]);
  } else assert(!fs.existsSync(path.join(root, output)), 'Refusing to overwrite actor phases');
  fs.writeFileSync(path.join(root, output), code); writeJSON(manifestPath, manifest);
}
console.log({passed: true, actorPhases: Object.keys(groups).length, queries: queries.length});
