import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root} from './reference-utils.mjs';
import {sequenceContinuationControl} from './sequence-continuation-control.mjs';

// Account for the new internal bridge without weakening predecessor budgets.
// Existing controller members must remain byte-identical source. A later combat
// refactor must explicitly revise this boundary and its frozen comparison.
export function sequenceContinuationBudget(files) {
  const read = file => fs.readFileSync(path.join(root, file));
  const manifest = JSON.parse(read('baseline/sequence-continuation-control/acceptance.json'));
  const parse = file => {
    const source = ts.createSourceFile(file, read(file).toString(), ts.ScriptTarget.Latest, true);
    const classes = source.statements.filter(n => ts.isClassDeclaration(n) && n.name?.text === 'AttackSequences');
    assert.equal(classes.length, 1); return {source, controller: classes[0]};
  };
  const previous = parse(manifest.source), current = parse('src/attack-sequences.ts');
  const additions = current.controller.members.filter(n => ['continuationImported', '[sequenceContinuationState]'].includes(n.name?.getText(current.source)));
  assert.equal(additions.length, 2);
  const ordinary = current.controller.members.filter(n => !additions.includes(n));
  assert.deepEqual(ordinary.map(n => n.getText(current.source)), previous.controller.members.map(n => n.getText(previous.source)), 'Existing combat members changed; revise the frozen continuation boundary explicitly');
  assert.deepEqual(current.controller.typeParameters.map(n => n.getText(current.source)), previous.controller.typeParameters.map(n => n.getText(previous.source)));
  const control = sequenceContinuationControl(read);
  const size = name => {const matches = files.filter(f => f.path === 'dist/' + name + '.js'); assert.equal(matches.length, 1); return matches[0].size;};
  const predecessorControllerBytes = control.get('attack-sequences.js').length;
  const bridgeBytes = size('attack-sequences') + size('attack-sequence-owned') - predecessorControllerBytes;
  assert(bridgeBytes > 0 && bridgeBytes <= 2 * 1024, 'Continuation bridge exceeds its separate 2 KiB integration bound');
  return {bridgeBytes, predecessorControllerBytes, existingMembersUnchanged: true};
}
