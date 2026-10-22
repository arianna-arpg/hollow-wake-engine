import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root, sha256} from '../../scripts/reference-utils.mjs';

export const intentWorld = 'src/engine/world.ts';
export const intentSeals = 'src/engine/castseal.ts';
export const intentBridge = 'src/engine/skillIntentAdapter.ts';
const lf = text => text.replaceAll('\r\n', '\n');
const parse = (file, text) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
const apply = (text, edits) => {
  for (const edit of edits.sort((a, b) => b.start - a.start)) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  return text;
};
function member(ast, name) {
  const world = ast.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'World');
  assert(world); const nodes = world.members.filter(node => node.name?.getText(ast) === name);
  assert.equal(nodes.length, 1, name); return nodes[0];
}
function removeUnused(text, file, candidates) {
  const ast = parse(file, text), edits = [];
  for (const declaration of ast.statements.filter(ts.isImportDeclaration)) {
    const bindings = declaration.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    const kept = bindings.elements.filter(element => {
      if (!candidates.has(element.name.text)) return true;
      let uses = 0; const visit = node => { if (ts.isIdentifier(node) && node.text === element.name.text && node !== element.name) uses++; ts.forEachChild(node, visit); }; visit(ast);
      return uses > 0;
    });
    if (kept.length === bindings.elements.length) continue;
    edits.push(!kept.length && !declaration.importClause.name
      ? {start: declaration.getFullStart(), end: declaration.end, text: ''}
      : {start: bindings.getStart(ast), end: bindings.end, text: '{ ' + kept.map(element => element.getText(ast)).join(', ') + ' }'});
  }
  return apply(text, edits);
}

export function renderIntentWorld(source, reference) {
  const current = lf(source), original = lf(reference), ast = parse(intentWorld, current), baseline = parse(intentWorld, original), edits = [];
  assert(!/\bsdkSkillIntent\b/.test(current), 'Skill intent already integrated or binding collision');
  const bodies = {
    castSealed: 'this.sdkSkillIntent.castSealed(caster, inst)',
    castReqRefusal: 'this.sdkSkillIntent.requirementRefusal(caster, inst)',
    skillUsable: 'this.sdkSkillIntent.hudUsable(a, inst)',
    pressUsable: 'this.sdkSkillIntent.pressUsable(caster, inst)',
    slotFaceOf: 'this.sdkSkillIntent.slotFace(caster, inst)',
    comboQueuedStep: 'this.sdkSkillIntent.queuedStep(caster, inst)',
    comboCursorOf: 'this.sdkSkillIntent.instances.cursor(caster, inst)',
    comboStepOf: 'this.sdkSkillIntent.instances.step(caster, inst, idx)',
    mintMetaInstance: 'this.sdkSkillIntent.instances.meta(caster, host, skillId)',
  };
  for (const [name, expression] of Object.entries(bodies)) {
    const node = member(ast, name), expected = member(baseline, name);
    assert.equal(node.getText(ast), expected.getText(baseline), 'Unreviewed skill-intent method ' + name);
    edits.push({start: node.body.getStart(ast), end: node.body.end, text: '{ return ' + expression + '; }'});
  }
  for (const name of ['comboCursors', 'relocationHosts']) {
    const node = member(ast, name); assert.equal(node.getText(ast), member(baseline, name).getText(baseline), 'Unreviewed ownership field ' + name);
    assert.equal((current.match(new RegExp('this\\.' + name + '\\.', 'g')) ?? []).length, name === 'comboCursors' ? 2 : 4, 'New ownership-field caller ' + name);
    edits.push({start: node.getStart(ast), end: node.end, text: name === 'comboCursors'
      ? 'private readonly sdkSkillIntent = createSkillIntent(this);'
      : 'private readonly relocationHosts = { get: (inst: SkillInstance) => this.sdkSkillIntent.instances.relocationHost(inst) };'});
  }
  const lastImport = ast.statements.filter(ts.isImportDeclaration).at(-1).end;
  edits.push({start: lastImport, end: lastImport, text: "\nimport {createSkillIntent} from './skillIntentAdapter';"});
  return removeUnused(apply(current, edits), intentWorld, new Set(['castSealShuts', 'instanceTreeMods']));
}

export function renderIntentSeals(source, reference) {
  const current = lf(source), original = lf(reference);
  assert.equal(current, original, 'Unreviewed cast-seal module');
  const ast = parse(intentSeals, current), edits = [];
  const names = {registerCastLaw: 'register(id, law)', castLawKnown: 'known(id)', castLawIds: 'ids()', castMatches: 'matches(m, ctx)', castSealShuts: 'shuts(spec, ctx)', castSealIssues: 'issues(spec, skillKnown)'};
  for (const [name, call] of Object.entries(names)) {
    const nodes = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name); assert.equal(nodes.length, 1, name);
    const node = nodes[0]; edits.push({start: node.body.getStart(ast), end: node.body.end, text: '{ return sdkCastSeals.' + call + '; }'});
  }
  const registry = ast.statements.filter(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(ast) === 'CAST_LAWS'));
  assert.equal(registry.length, 1); edits.push({start: registry[0].getStart(ast), end: registry[0].end, text: 'const sdkCastSeals = new CastSeals<CastLawCtx>(skillContextTags);'});
  const lastImport = ast.statements.filter(ts.isImportDeclaration).at(-1).end;
  edits.push({start: lastImport, end: lastImport, text: "\nimport {CastSeals} from '@hollow-wake/engine/casting/seals';"});
  return apply(current, edits);
}

export function integrateSkillIntent(game, write = true) {
  assert(!fs.existsSync(path.join(game, intentBridge)), 'Refusing to replace skill-intent bridge');
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json'))), rendered = [];
  for (const [file, render] of [[intentWorld, renderIntentWorld], [intentSeals, renderIntentSeals]]) {
    const reference = fs.readFileSync(path.join(root, '.reference', file)); assert.equal(sha256(reference), lock.files[file]);
    const source = fs.readFileSync(path.join(game, file), 'utf8');
    rendered.push({file, text: render(source, reference.toString()).replaceAll('\n', source.includes('\r\n') ? '\r\n' : '\n')});
  }
  if (write) {
    for (const {file, text} of rendered) fs.writeFileSync(path.join(game, file), text);
    fs.copyFileSync(path.join(root, 'adapters/hollow-wake/skillIntentAdapter.ts'), path.join(game, intentBridge));
  }
  return {files: [intentWorld, intentSeals, intentBridge]};
}
