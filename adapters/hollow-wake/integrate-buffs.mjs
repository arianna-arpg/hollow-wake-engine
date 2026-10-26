import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root, sha256} from '../../scripts/reference-utils.mjs';

export const buffPaths = {actor: 'src/engine/actor.ts', skills: 'src/engine/skills.ts', binding: 'src/engine/buffAdapter.ts'};
const contract = JSON.parse(fs.readFileSync(path.join(root, 'baseline/milestone-forty-one/adapter-contract.json')));
const lf = value => value.replaceAll('\r\n', '\n');
const name = node => node.name && (ts.isComputedPropertyName(node.name)
  ? ts.isStringLiteral(node.name.expression) ? node.name.expression.text : undefined : node.name.text);

function parse(file, source) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  assert.equal(ast.parseDiagnostics.length, 0, 'Invalid buff source: ' + file);
  return ast;
}

export function buffTree(source) {
  const ast = parse(buffPaths.actor, source);
  const classes = ast.statements.filter(n => ts.isClassDeclaration(n) && name(n) === 'Actor');
  assert.equal(classes.length, 1, 'Ambiguous buff Actor');
  const owner = classes[0], members = {};
  for (const key of Object.keys(contract.members)) {
    const found = owner.members.filter(n => name(n) === key);
    assert.equal(found.length, 1, 'Ambiguous buff member: ' + key);
    const node = found[0];
    assert(['buffs', 'gainEvents'].includes(key) ? ts.isPropertyDeclaration(node) : ts.isMethodDeclaration(node) && node.body, 'Invalid buff member: ' + key);
    members[key] = node;
  }
  return {ast, owner, members};
}

function checkInterface(ast, key, hash) {
  const nodes = ast.statements.filter(n => ts.isInterfaceDeclaration(n) && name(n) === key);
  assert.equal(nodes.length, 1, 'Ambiguous buff interface: ' + key);
  assert.equal(sha256(nodes[0].getText(ast)), hash, 'Unreviewed buff interface: ' + key);
}

export function renderBuffActor(source) {
  const input = lf(source), tree = buffTree(input), {ast, owner, members} = tree;
  const cueReferences = Object.fromEntries(contract.removedCueImports.names.map(key => [key, 0]));
  const scan = node => {
    if (ts.isIdentifier(node)) {
      assert(!contract.reservedNames.includes(node.text), 'Buff binding collision: ' + node.text);
      if (Object.hasOwn(cueReferences, node.text)) cueReferences[node.text]++;
    }
    if (node.name) assert(!contract.reservedNames.includes(name(node)), 'Buff binding collision: ' + name(node));
    ts.forEachChild(node, scan);
  };
  scan(ast);
  assert.deepEqual(cueReferences, contract.removedCueImports.identifierOccurrences, 'Unreviewed buff cue reference');
  for (const [key, node] of Object.entries(members)) assert.equal(sha256(node.getText(ast)), contract.members[key], 'Unreviewed buff member: ' + key);
  for (const [key, hash] of Object.entries(contract.interfaces)) checkInterface(ast, key, hash);
  const statements = members.updateTimers.body.statements;
  const loops = statements.filter(n => ts.isForOfStatement(n) && n.expression.getText(ast) === 'this.buffs');
  assert.equal(loops.length, 1, 'Ambiguous buff timer phase');
  const loop = loops[0], phase = statements.indexOf(loop);
  assert(phase > 0 && phase < statements.length - 1, 'Invalid buff timer adjacency');
  for (const [node, hash] of [[loop, contract.timer.loopSha256], [statements[phase - 1], contract.timer.beforeSha256], [statements[phase + 1], contract.timer.afterSha256]]) {
    assert.equal(sha256(node.getText(ast)), hash, 'Unreviewed buff timer phase');
  }
  const imports = ast.statements.filter(ts.isImportDeclaration), cueImports = imports.filter(n => n.moduleSpecifier.text === contract.removedCueImports.module);
  assert.equal(cueImports.length, 1, 'Ambiguous buff cue import');
  const cueImport = cueImports[0], bindings = cueImport.importClause?.namedBindings;
  assert(cueImport.importClause && !cueImport.importClause.isTypeOnly && bindings && ts.isNamedImports(bindings), 'Invalid buff cue import');
  for (const key of contract.removedCueImports.names) {
    const removed = bindings.elements.filter(n => n.name.text === key);
    assert.equal(removed.length, 1, 'Ambiguous buff cue import: ' + key);
    assert(!removed[0].isTypeOnly && !removed[0].propertyName, 'Invalid buff cue import: ' + key);
  }
  const remaining = bindings.elements.filter(n => !contract.removedCueImports.names.includes(n.name.text));
  assert(remaining.length, 'Invalid remaining cue import');
  const runtimeType = 'EngineBuffRuntime<Modifier, SkillTag, BuffEffect, Actor>';
  const bodies = {
    addBuff: '{ this.sdkBuffs().grant(this, def, durationScale, chainDepth, tags); }',
    consumeBuffStacks: '{ if (this.sdkBuffRuntime || this.buffs.size) this.sdkBuffs().consume(this, id, n); }',
    spendBuffs: '{ if (this.buffs.size) this.sdkBuffs().spend(this, on, tags, skillId); }',
    syncBuffSource: '{ this.sdkBuffs().synchronize(this, id); }',
    removeBuff: '{ if (this.sdkBuffRuntime || this.buffs.size) this.sdkBuffs().remove(this, id); }',
  };
  const edits = Object.entries(bodies).map(([key, text]) => ({start: members[key].body.getStart(ast), end: members[key].body.end, text}));
  const recoveryAccess = members.syncBuffSource.modifiers?.filter(n => n.kind === ts.SyntaxKind.PrivateKeyword);
  assert.equal(recoveryAccess?.length, 1, 'Invalid buff recovery visibility');
  edits.push({start: recoveryAccess[0].getStart(ast), end: recoveryAccess[0].end, text: 'public'});
  edits.push(
    {start: imports.at(-1).end, end: imports.at(-1).end, text: '\n' + contract.imports.join('\n')},
    {start: bindings.getStart(ast), end: bindings.end, text: '{ ' + remaining.map(n => n.getText(ast)).join(', ') + ' }'},
    {start: members.buffs.end, end: members.buffs.end, text: `\n  private sdkBuffRuntime?: ${runtimeType};\n  private sdkBuffs(): ${runtimeType} {\n    return this.sdkBuffRuntime ??= new EngineBuffRuntime<Modifier, SkillTag, BuffEffect, Actor>(buffPorts);\n  }`},
    {start: loop.getStart(ast), end: loop.end, text: 'if (this.sdkBuffRuntime || this.buffs.size) this.sdkBuffs().advance(this, dt);'},
  );
  edits.sort((a, b) => b.start - a.start);
  for (let i = 1; i < edits.length; i++) assert(edits[i].end <= edits[i - 1].start, 'Overlapping buff edits');
  let output = input;
  for (const edit of edits) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  const rendered = buffTree(output);
  assert.equal(rendered.owner.members.length, owner.members.length + 2, 'Invalid buff member count');
  return output;
}

/** All shape/hash/collision checks finish before either target file is written. */
export function integrateBuffs(game, write = true) {
  const binding = path.join(game, buffPaths.binding);
  assert(!fs.existsSync(binding), 'Buff binding already exists');
  const skills = parse(buffPaths.skills, lf(fs.readFileSync(path.join(game, buffPaths.skills), 'utf8')));
  checkInterface(skills, 'BuffEffect', contract.buffEffectSha256);
  const source = fs.readFileSync(path.join(game, buffPaths.actor), 'utf8');
  const output = renderBuffActor(source).replaceAll('\n', source.includes('\r\n') ? '\r\n' : '\n');
  const ports = fs.readFileSync(path.join(root, 'adapters/hollow-wake/buffAdapter.ts'), 'utf8');
  if (write) {
    fs.writeFileSync(path.join(game, buffPaths.actor), output);
    fs.writeFileSync(binding, ports, {flag: 'wx'});
  }
  return {files: [buffPaths.actor, buffPaths.binding], decision: contract.decision, repair: contract.repair};
}
