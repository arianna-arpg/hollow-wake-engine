import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root, sha256, verifyReference, writeJSON} from './reference-utils.mjs';
import {readBuffExpectations} from './check-buff-contract.mjs';
import {integrate} from '../adapters/hollow-wake/integrate.mjs';
import {renderAmmunition} from '../adapters/hollow-wake/integrate-ammunition.mjs';
import {renderPaymentActor} from '../adapters/hollow-wake/integrate-resource-payment.mjs';
import {buffPaths, buffTree, integrateBuffs} from '../adapters/hollow-wake/integrate-buffs.mjs';

const {acceptance} = readBuffExpectations(), reference = path.join(root, '.reference');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'baseline/source-lock.json')));
const contract = JSON.parse(fs.readFileSync(path.join(root, 'baseline/milestone-forty-one/adapter-contract.json')));
assert.equal(contract.source, lock.commit); assert.equal(contract.sourceLockSha256, acceptance.sourceLockSha256);
assert.equal(contract.sourceBoundariesSha256, acceptance.sourceBoundaries.sha256);
verifyReference(reference, lock);
const origin = fs.mkdtempSync(path.join(root, '.artifacts/buff-overlay-origin-'));
fs.mkdirSync(path.join(origin, 'src/engine'), {recursive: true});
for (const name of ['actor', 'world']) fs.copyFileSync(path.join(reference, 'src/engine', name + '.ts'), path.join(origin, 'src/engine', name + '.ts'));
integrate(origin);
const originalActor = fs.readFileSync(path.join(reference, buffPaths.actor), 'utf8');
const base = renderPaymentActor(renderAmmunition(buffPaths.actor, fs.readFileSync(path.join(origin, buffPaths.actor), 'utf8'), originalActor), originalActor);
const skills = fs.readFileSync(path.join(reference, buffPaths.skills), 'utf8').replaceAll('\r\n', '\n');
const tree = buffTree(base), faults = [], replace = (start, end, text) => base.slice(0, start) + text + base.slice(end);
for (const [key, node] of Object.entries(tree.members)) {
  assert.equal(sha256(node.getText(tree.ast)), contract.members[key], 'Predecessor reconstruction differs: ' + key);
  faults.push([key + ':changed', replace(node.getStart(tree.ast), node.end, node.getText(tree.ast).replace(key, key + '_changed')), skills]);
  faults.push([key + ':missing', replace(node.getStart(tree.ast), node.end, ''), skills]);
  faults.push([key + ':duplicate', replace(node.end, node.end, '\n' + node.getText(tree.ast)), skills]);
  if (node.body) faults.push([key + ':body', replace(node.body.getStart(tree.ast) + 1, node.body.getStart(tree.ast) + 1, ' void 0; '), skills]);
}
for (const key of Object.keys(contract.interfaces)) {
  const node = tree.ast.statements.find(n => ts.isInterfaceDeclaration(n) && n.name.text === key);
  faults.push([key + ':missing', replace(node.getStart(tree.ast), node.end, ''), skills]);
  faults.push([key + ':duplicate', base + '\n' + node.getText(tree.ast), skills]);
  faults.push([key + ':changed', replace(node.getStart(tree.ast), node.end, node.getText(tree.ast).replace('{', '{ extra?: number;')), skills]);
}
const skillTree = ts.createSourceFile(buffPaths.skills, skills, ts.ScriptTarget.Latest, true);
const definition = skillTree.statements.find(n => ts.isInterfaceDeclaration(n) && n.name.text === 'BuffEffect');
faults.push(['BuffEffect:missing', base, skills.slice(0, definition.getStart(skillTree)) + skills.slice(definition.end)]);
faults.push(['BuffEffect:duplicate', base, skills + '\n' + definition.getText(skillTree)]);
faults.push(['BuffEffect:changed', base, skills.slice(0, definition.getStart(skillTree)) + definition.getText(skillTree).replace('{', '{ extra?: number;') + skills.slice(definition.end)]);
faults.push(['invalid-actor', base + '\nconst missing = ;', skills], ['duplicate-actor', base + '\nclass Actor {}', skills], ['invalid-skills', base, skills + '\nconst missing = ;']);
for (const key of contract.reservedNames) {
  faults.push(['binding:' + key, base + '\nconst ' + key + ' = 0;', skills]);
  faults.push(['quoted-binding:' + key, replace(tree.owner.members.end, tree.owner.members.end, '\n["' + key + '"]() {}'), skills]);
}
for (const key of contract.removedCueImports.names) {
  faults.push(['extra-cue-reference:' + key, base + '\nconst extraCue = ' + key + ';', skills]);
  faults.push(['type-only-cue-import:' + key, base.replace(key + ',', 'type ' + key + ','), skills]);
  faults.push(['aliased-cue-import:' + key, base.replace(key + ',', key + ' as otherCue,'), skills]);
}
const reports = [];
for (const ending of ['\n', '\r\n']) {
  const game = fs.mkdtempSync(path.join(root, '.artifacts/buff-overlay-'));fs.mkdirSync(path.join(game, 'src/engine'), {recursive: true});
  const actorFile = path.join(game, buffPaths.actor), skillFile = path.join(game, buffPaths.skills), bindingFile = path.join(game, buffPaths.binding);
  const marked = replace(tree.owner.members.end, tree.owner.members.end, '\n  retainedUnrelatedMarker() { return 27; }\n') + '\n// retained unrelated comment\n';
  const input = marked.replaceAll('\n', ending), originalSkills = skills.replaceAll('\n', ending);
  fs.writeFileSync(actorFile, input);fs.writeFileSync(skillFile, originalSkills);integrateBuffs(game, false);
  assert.equal(fs.readFileSync(actorFile, 'utf8'), input);assert.equal(fs.readFileSync(skillFile, 'utf8'), originalSkills);assert(!fs.existsSync(bindingFile));
  for (const [name, actor, definitionSource] of faults) {
    const changed = actor.replaceAll('\n', ending), changedSkills = definitionSource.replaceAll('\n', ending);
    fs.writeFileSync(actorFile, changed);fs.writeFileSync(skillFile, changedSkills);
    assert.throws(() => integrateBuffs(game), /Unreviewed|Ambiguous|Invalid|binding collision/, 'Source fault escaped: ' + name);
    assert.equal(fs.readFileSync(actorFile, 'utf8'), changed);assert.equal(fs.readFileSync(skillFile, 'utf8'), changedSkills);assert(!fs.existsSync(bindingFile));
  }
  fs.writeFileSync(actorFile, input);fs.writeFileSync(skillFile, originalSkills);fs.writeFileSync(bindingFile, 'existing binding');
  assert.throws(() => integrateBuffs(game), /already exists/);assert.equal(fs.readFileSync(actorFile, 'utf8'), input);assert.equal(fs.readFileSync(bindingFile, 'utf8'), 'existing binding');fs.unlinkSync(bindingFile);
  integrateBuffs(game);const output = fs.readFileSync(actorFile, 'utf8'), before = buffTree(marked), after = buffTree(output.replaceAll('\r\n', '\n'));
  assert.equal(output.includes('\r\n'), ending === '\r\n');assert(output.endsWith(ending + '// retained unrelated comment' + ending));
  assert.equal(fs.readFileSync(skillFile, 'utf8'), originalSkills);assert(fs.readFileSync(bindingFile).equals(fs.readFileSync(path.join(root, 'adapters/hollow-wake/buffAdapter.ts'))));
  const kept = after.owner.members.filter(n => !['sdkBuffRuntime', 'sdkBuffs'].includes(n.name?.getText(after.ast)));
  assert.equal(kept.length, before.owner.members.length);
  const changedNames = new Set(['addBuff', 'consumeBuffStacks', 'spendBuffs', 'syncBuffSource', 'removeBuff', 'updateTimers']);
  for (let i = 0; i < kept.length; i++) {
    const old = before.owner.members[i], next = kept[i], key = old.name?.getText(before.ast);
    if (!changedNames.has(key)) assert.equal(next.getText(after.ast), old.getText(before.ast), 'Unrelated actor member changed: ' + key);
    else {
      let signature = before.ast.text.slice(old.getStart(before.ast), old.body.getStart(before.ast));
      if (key === contract.recovery.method) {
        assert(signature.startsWith(contract.recovery.before + ' '));
        signature = contract.recovery.after + signature.slice(contract.recovery.before.length);
      }
      assert.equal(signature, after.ast.text.slice(next.getStart(after.ast), next.body.getStart(after.ast)), 'Buff method signature changed: ' + key);
    }
  }
  const loop = before.members.updateTimers.body.statements.find(n => ts.isForOfStatement(n) && n.expression.getText(before.ast) === 'this.buffs');
  assert.equal(after.members.updateTimers.getText(after.ast).replace('if (this.sdkBuffRuntime || this.buffs.size) this.sdkBuffs().advance(this, dt);', loop.getText(before.ast)), before.members.updateTimers.getText(before.ast), 'Unrelated timer code changed');
  const globals = t => t.ast.statements.filter(n => !ts.isImportDeclaration(n) && n !== t.owner).map(n => n.getText(t.ast));assert.deepEqual(globals(after), globals(before));
  const importList = t => t.ast.statements.filter(ts.isImportDeclaration).filter(n => n.moduleSpecifier.text !== './procCues').map(n => n.getText(t.ast));
  assert.deepEqual(importList(after), [...importList(before), ...contract.imports]);
  assert.throws(() => integrateBuffs(game), /already exists/);
  reports.push({newline: ending,sourceFaultsRejected: faults.length,dryRunUnchanged: true,rejectionsLeaveAllSourcesUnchanged: true,unrelatedMembersGlobalsAndImportsPreserved: true,timerPhaseAndOtherTimerCodePreserved: true,skillsAndNativePayloadTypesUnchanged: true,duplicateRejected: true});
}
verifyReference(reference, lock);
writeJSON(path.join(root, '.artifacts/buff-overlay-verification.json'), {decision: contract.decision,contractSha256: sha256(fs.readFileSync(path.join(root, 'baseline/milestone-forty-one/adapter-contract.json'))),reports,sourceFaults: reports.reduce((sum, r) => sum + r.sourceFaultsRejected, 0),reconstruction: contract.reconstruction,originalUnchanged: true});
console.log('Buff source controls passed: ' + faults.length * 2 + ' faults rejected.');
