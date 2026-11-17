import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256} from './reference-utils.mjs';
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
  // November adds optional buff attribution without changing continuation
  // storage. Pin those three reviewed members separately; every other ordinary
  // member still has to match the preserved predecessor byte for byte.
  const revision=JSON.parse(read('baseline/prototype-parity/sequence-boundary-revision.json'));
  const before=new Map(previous.controller.members.map(n=>[n.name?.getText(previous.source)??'constructor',n.getText(previous.source)]));
  const revised=[];
  for(const member of ordinary){
    const name=member.name?.getText(current.source)??'constructor',source=member.getText(current.source),accepted=Object.hasOwn(revision.members,name)?revision.members[name]:undefined;
    if(accepted){assert.equal(before.has(name)?sha256(before.get(name)):null,accepted.before);assert.equal(sha256(source),accepted.after);revised.push(name);}
    else assert.equal(source,before.get(name),'Unreviewed sequence member change: '+name);
    before.delete(name);
  }
  assert.equal(before.size,0,'A predecessor sequence member was removed');
  assert.deepEqual(revised.sort(),Object.keys(revision.members).sort());
  assert.deepEqual(current.controller.typeParameters.map(n => n.getText(current.source)), previous.controller.typeParameters.map(n => n.getText(previous.source)));
  const control = sequenceContinuationControl(read);
  const size = name => {const matches = files.filter(f => f.path === 'dist/' + name + '.js'); assert.equal(matches.length, 1); return matches[0].size;};
  const predecessorControllerBytes = control.get('attack-sequences.js').length;
  const bridgeBytes = size('attack-sequences') + size('attack-sequence-owned') - predecessorControllerBytes;
  assert(bridgeBytes > 0 && bridgeBytes <= 2 * 1024, 'Continuation bridge exceeds its separate 2 KiB integration bound');
  return {bridgeBytes, predecessorControllerBytes, unchangedExceptReviewedSourceAttribution:revised};
}
