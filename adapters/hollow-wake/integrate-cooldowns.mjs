import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {sha256} from '../../scripts/reference-utils.mjs';
import {cooldownTree,readCooldownExpectations} from '../../scripts/check-cooldown-contract.mjs';
export const cooldownPath='src/engine/world.ts';
export const cooldownDecision='Delegate the cooldown proc transition over borrowed live state; preserve native power, cue, rider and timer phases';
export const cooldownImport="import {applyProcCooldown as engineApplyProcCooldown} from '@hollow-wake/engine/combat/cooldowns';";
const {boundary}=readCooldownExpectations();

export function renderCooldownSource(source){
  const input=source.replaceAll('\r\n','\n'),tree=cooldownTree(input),{ast,method,clause}=tree;
  const scan=node=>{
    if(ts.isIdentifier(node))assert(!boundary.reservedNames.includes(node.text),'Cooldown binding collision');
    if(node.name){const name=ts.isComputedPropertyName(node.name)?node.name.expression.text:node.name.text;
      assert(!boundary.reservedNames.includes(name),'Cooldown binding collision');}
    ts.forEachChild(node,scan);
  };scan(ast);
  assert.equal(sha256(method.getText(ast)),boundary.predecessor.methodSha256,'Unreviewed cooldown method');
  assert.deepEqual(tree.cases.map(node=>node.expression.text),Object.keys(boundary.predecessor.caseHashes),'Unreviewed cooldown case order');
  for(const node of tree.cases)assert.equal(sha256(node.getText(ast)),boundary.predecessor.caseHashes[node.expression.text],'Unreviewed cooldown branch');
  const imports=ast.statements.filter(ts.isImportDeclaration);
  assert.equal(imports.filter(node=>node.getText(ast)===boundary.existingImport).length,1,'Unreviewed cooldown predecessor import');
  const edits=[{start:clause.getStart(ast),end:clause.end,
    text:"case 'cooldown': {\n        if (engineApplyProcCooldown(caster, fx, inst)) noteProcCue(caster, procCue, 'gain', proc.id);\n        break;\n      }"},
    {start:imports.at(-1).end,end:imports.at(-1).end,text:'\n'+cooldownImport}].sort((a,b)=>b.start-a.start);
  assert(edits[1].end<=edits[0].start,'Overlapping cooldown edits');
  let output=input;for(const edit of edits)output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);
  cooldownTree(output);return output;
}
/** All inspection finishes before any source write. Repeat application fails. */
export function integrateCooldowns(game,write=true){
  const file=path.join(game,cooldownPath),source=fs.readFileSync(file,'utf8'),
    output=renderCooldownSource(source).replaceAll('\n',source.includes('\r\n')?'\r\n':'\n');
  if(write)fs.writeFileSync(file,output);return {files:[cooldownPath],decision:cooldownDecision};
}
