import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {pathToFileURL} from 'node:url';
import {root, sha256, writeJSON} from './reference-utils.mjs';

/** Plain entity defaults only. No original Actor methods, AI, World, renderer,
 * global identity counter or runtime import is included in this artifact. */
export function buildCombatActorState(destination) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json')));
  const sources = {};
  const read = file => {
    const text = fs.readFileSync(path.join(root, '.reference', file), 'utf8');
    sources[file] = sha256(text); assert.equal(sources[file], lock.files[file], file);
    return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  };
  const source = read('src/engine/actor.ts'), recency = read('src/engine/recency.ts');
  const actor = source.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'Actor');
  assert(actor, 'Pinned Actor declaration missing');
  const constants = new Map();
  for (const statement of recency.statements) if (ts.isVariableStatement(statement)) {
    for (const d of statement.declarationList.declarations) if (ts.isIdentifier(d.name)) constants.set(d.name.text, d.initializer);
  }
  const kinds = constants.get('RECENT_KINDS');
  assert(ts.isAsExpression(kinds) && ts.isArrayLiteralExpression(kinds.expression));
  const recentKinds = kinds.expression.elements.map(n => {assert(ts.isStringLiteral(n)); return n.text;});
  const never = constants.get('RECENT_NEVER'); assert(ts.isNumericLiteral(never));
  const timing = {};
  for (const statement of source.statements) if (ts.isVariableStatement(statement)) {
    for (const d of statement.declarationList.declarations) {
      const key = {STANCE_PLANT_TIME: 'plantTime', BANK_STILL_GRACE: 'bankStillGrace'}[d.name.getText(source)];
      if (key) {assert(ts.isNumericLiteral(d.initializer)); timing[key] = Number(d.initializer.text);}
    }
  }
  assert.equal(Object.keys(timing).length, 2);
  const fields = [], lines = [];
  const printer = ts.createPrinter({removeComments: true});
  for (const member of actor.members) {
    if (!ts.isPropertyDeclaration(member) || !member.initializer) continue;
    assert(ts.isIdentifier(member.name));
    assert(!member.modifiers?.some(m => m.kind === ts.SyntaxKind.StaticKeyword));
    const name = member.name.text;
    fields.push(name);
    if (name === 'id') {assert.equal(member.initializer.getText(source), 'nextActorId++'); lines.push('target.id = id;'); continue;}
    if (name === 'sheet') {assert.equal(member.initializer.getText(source), 'new StatSheet()'); lines.push('target.sheet = sheet;'); continue;}
    function check(node) {
      if (ts.isNewExpression(node)) assert(['Map', 'Set', 'Float64Array'].includes(node.expression.getText(source)), 'Unexpected allocation');
      if (ts.isCallExpression(node)) assert(['vec', 'new Float64Array(RECENT_KINDS.length).fill'].includes(node.expression.getText(source)), 'Unexpected initializer call');
      if (ts.isIdentifier(node) && !ts.isTypeNode(node.parent)) {
        // Property names and erased type arguments are audited separately by
        // transpilation; executable defaults are checked for ambient access below.
        assert(!['Math', 'Date', 'performance', 'process', 'window', 'document'].includes(node.text), 'Ambient default');
      }
      ts.forEachChild(node, check);
    }
    check(member.initializer);
    lines.push(`target.${name} = ${printer.printNode(ts.EmitHint.Expression, member.initializer, source)};`);
  }
  assert(fields.length > 200 && fields.length === new Set(fields).size);
  const ctor = actor.members.find(ts.isConstructorDeclaration);
  assert.deepEqual(ctor.body.statements.map(s => printer.printNode(ts.EmitHint.Unspecified, s, source)),
    ['this.name = name;', 'this.team = team;', 'this.pos = vec(pos.x, pos.y);', 'this.life = 1;', 'this.mana = 1;']);
  const input = `const RECENT_KINDS = Object.freeze(${JSON.stringify(recentKinds)});\nconst RECENT_NEVER = ${never.text};\nconst vec = (x, y) => ({x, y});\n` +
    `export function initializeCombatActor(target, id, name, team, pos, sheet) {\n${lines.join('\n')}\n` +
    'target.name = name; target.team = team; target.pos = vec(pos.x, pos.y); target.life = 1; target.mana = 1; return target;\n}\n' +
    'export const combatRecency = Object.freeze({kinds: RECENT_KINDS, never: RECENT_NEVER});\n' +
    `export const combatActorTiming = Object.freeze(${JSON.stringify(timing)});\n`;
  const code = ts.transpileModule(input, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022}}).outputText;
  const manifest = {schemaVersion: 1, sourceCommit: lock.commit, sources, fields,
    alterations: ['identity and stat sheet supplied by the instance owner', 'initialization target supplied instead of allocating original Actor'],
    files: {'actor-state.mjs': {sha256: sha256(code), bytes: Buffer.byteLength(code)}}};
  fs.mkdirSync(destination, {recursive: true}); fs.writeFileSync(path.join(destination, 'actor-state.mjs'), code);
  writeJSON(path.join(destination, 'actor-state-manifest.json'), manifest);
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert(process.argv.length === 4 && process.argv[2] === '--out', 'Use --out <new directory>');
  const destination = path.resolve(process.argv[3]); assert(!fs.existsSync(destination), 'Refusing existing output');
  const result = buildCombatActorState(destination); console.log({fields: result.fields.length, ...result.files});
}
