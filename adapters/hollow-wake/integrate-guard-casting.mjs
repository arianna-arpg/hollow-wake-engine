import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root, sha256} from '../../scripts/reference-utils.mjs';
export const guardCastWorld = 'src/engine/world.ts', guardCastSkills = 'src/engine/skills.ts';
export const guardCastBridge = 'src/engine/guardCastingAdapter.ts';
const lf = source => source.replaceAll('\r\n', '\n');
const parse = (file, source) => ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
function method(ast, name) {
  const cls = ast.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'World'); assert(cls);
  const nodes = cls.members.filter(n => ts.isMethodDeclaration(n) && n.name.getText(ast) === name);
  assert.equal(nodes.length, 1, name); return nodes[0];
}
function guard(ast) {
  return method(ast, 'updateCasting').body.statements.find(ts.isSwitchStatement).caseBlock.clauses
    .find(n => ts.isCaseClause(n) && n.expression.text === 'guard');
}
function apply(source, edits) {
  for (const e of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, e.start) + e.text + source.slice(e.end);
  return source;
}
function importEdit(ast, source, text) {
  const last = ast.statements.filter(ts.isImportDeclaration).at(-1).end, line = source.indexOf('\n', last), at = line < 0 ? source.length : line;
  return {start: at, end: at, text: '\n' + text};
}
export function renderGuardWorld(source, reference) {
  const current = lf(source), original = lf(reference), ast = parse(guardCastWorld, current), base = parse(guardCastWorld, original), edits = [];
  assert(!current.includes('sdkGuardCasting'), 'Guard casting already integrated');
  const clause = guard(ast), old = guard(base); assert(clause && old);
  const text = clause.getText(ast); assert.equal(text, old.getText(base), 'Unreviewed guard case');
  const skillsImport = ast.statements.find(n => ts.isImportDeclaration(n) && n.moduleSpecifier.text === './skills'
    && n.importClause?.namedBindings && ts.isNamedImports(n.importClause.namedBindings)
    && n.importClause.namedBindings.elements.some(e => e.name.text === 'guardBashReady'));
  assert(skillsImport, 'Missing guard readiness import');
  const elements = skillsImport.importClause.namedBindings.elements, index = elements.findIndex(e => e.name.text === 'guardBashReady');
  assert(!elements[index].propertyName && index < elements.length - 1, 'Changed guard readiness import');
  edits.push({start: elements[index].getStart(ast), end: elements[index + 1].getStart(ast), text: ''});
  const start = '        const want = angleTo(a.pos, cs.aim);', end = '        // The bash tic';
  assert.equal(text.split(start).length, 2); assert.equal(text.split(end).length, 2);
  const aim = text.slice(text.indexOf(start), text.indexOf(end));
  edits.push({start: clause.getStart(ast), end: clause.end, text: "case 'guard': { this.sdkGuardCasting().advance(a, cs, dt); return; }"});
  for (const [name, body] of [
    ['refreshGuardBash', '{ this.sdkGuardCasting().refresh(a, cs); }'],
    ['aiHoldOf', '{ return guardAiHold(cs); }'],
  ]) {
    const m = method(ast, name), b = method(base, name); assert.equal(m.getText(ast), b.getText(base), 'Unreviewed ' + name);
    edits.push({start: m.body.getStart(ast), end: m.body.end, text: body});
  }
  const update = method(ast, 'updateCasting');
  edits.push({start: update.end, end: update.end, text: `

  private sdkGuardCastingRuntime?: ReturnType<typeof createGuardCasting>;
  private sdkGuardCasting(): ReturnType<typeof createGuardCasting> {
    return this.sdkGuardCastingRuntime ??= createGuardCasting({
      seated: a => !!this.seatOf(a),
      aim: (a, cs, spec, dt) => {
${aim}      },
      supports: (a, cs, dt) => this.tickChannelSupports(a, cs, dt),
      trigger: (a, cs) => this.rollTriggers(a, 'guardBeat',
        {aim: vec(cs.aim.x, cs.aim.y), sourceInst: cs.inst}),
      pulse: (a, cs, skill) => this.executeSkill(a, this.mintMetaInstance(a, cs.inst, skill),
        vec(cs.aim.x, cs.aim.y), {noCooldown: true, noRepeat: true, keepFacing: true}),
      time: () => this.time,
      lower: (a, cs) => this.guardArts.lower(a, cs.inst),
      stampCooldown: (a, cs, duration) => this.stampSkillCooldown(a, cs.inst, duration),
      deliverBash: (a, cs, bash, payload) => this.guardBash(a, cs.inst, bash, payload),
    });
  }`});
  edits.push(importEdit(ast, current, "import {createGuardCasting} from './guardCastingAdapter';\nimport {guardAiHold} from '@hollow-wake/engine/casting/guard';"));
  return apply(current, edits);
}
export function renderGuardSkills(source, reference) {
  const current = lf(source), original = lf(reference), ast = parse(guardCastSkills, current), base = parse(guardCastSkills, original);
  assert(!current.includes('sdkGuardBashReady'), 'Guard readiness already integrated');
  const find = ast => { const rows = ast.statements.filter(n => ts.isFunctionDeclaration(n) && n.name?.text === 'guardBashReady'); assert.equal(rows.length, 1); return rows[0]; };
  const fn = find(ast), old = find(base); assert.equal(fn.getText(ast), old.getText(base), 'Unreviewed guard readiness');
  return apply(current, [{start: fn.body.getStart(ast), end: fn.body.end, text: '{ return sdkGuardBashReady(cs); }'},
    importEdit(ast, current, "import {guardBashReady as sdkGuardBashReady} from '@hollow-wake/engine/casting/guard';")]);
}
export function integrateGuardCasting(game, write = true) {
  assert(!fs.existsSync(path.join(game, guardCastBridge)), 'Refusing to overwrite guard casting bridge');
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json'))), changes = [];
  for (const [file, render] of [[guardCastWorld, renderGuardWorld], [guardCastSkills, renderGuardSkills]]) {
    const reference = fs.readFileSync(path.join(root, '.reference', file)); assert.equal(sha256(reference), lock.files[file]);
    const source = fs.readFileSync(path.join(game, file), 'utf8'), after = render(source, reference.toString());
    changes.push({file, text: after.replaceAll('\n', source.includes('\r\n') ? '\r\n' : '\n')});
  }
  if (write) {
    for (const change of changes) fs.writeFileSync(path.join(game, change.file), change.text);
    fs.copyFileSync(path.join(root, 'adapters/hollow-wake/guardCastingAdapter.ts'), path.join(game, guardCastBridge));
  }
  return {files: [guardCastWorld, guardCastSkills, guardCastBridge]};
}
