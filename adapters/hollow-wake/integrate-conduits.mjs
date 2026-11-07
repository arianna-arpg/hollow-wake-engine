import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {installCharacterSources} from './install-character-sources.mjs';

const file = 'src/engine/actor.ts';
const binding = "import {advanceConduits as sdkAdvanceConduits} from '@hollow-wake/engine/resources/conduits';";
function locate(source) {
  const ast = ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  const one = (nodes, label) => {
    assert.equal(nodes.length,1,'Expected one '+label);
    return nodes[0];
  };
  const actor = one(ast.statements.filter(n=>ts.isClassDeclaration(n) && n.name?.text==='Actor'),'Actor');
  const method = name => one(actor.members.filter(n=>ts.isMethodDeclaration(n) && n.name.getText(ast)===name),name);
  const declaration = name => one(ast.statements.filter(n=>ts.isVariableStatement(n) &&
    n.declarationList.declarations.some(d=>d.name.getText(ast)===name)),name);
  const skills = ast.statements.filter(n=>ts.isImportDeclaration(n) && n.moduleSpecifier.text==='./skills');
  const poolType = one(skills.flatMap(n=>Array.from(n.importClause?.namedBindings?.elements??[]))
    .filter(s=>s.isTypeOnly && s.name.text==='ConduitPool'),'ConduitPool import');
  return {ast,update:method('updateConduits'),tick:method('tickConduit'),
    modes:declaration('HELD_PUMP_MODES'),pools:declaration('CONDUIT_POOLS'),poolType};
}

export function renderConduits(source, original) {
  const input=source.replaceAll('\r\n','\n'), pinned=original.replaceAll('\r\n','\n');
  assert(!input.includes('sdkAdvanceConduits'),'Conduit binding already installed');
  const live=locate(input), base=locate(pinned);
  const edits=[];
  for (const [key, replacement] of [
    ['update','\n  private updateConduits(dt: number): void {\n    sdkAdvanceConduits(this, dt, conduitReaders, CONDUIT_CFG);\n  }'],
    ['tick',''],['modes','\n\nconst conduitReaders = {specs: instanceConduits, tags: (inst: SkillInstance) => skillContextTags(inst), modifiers: instanceMods};'],
    ['pools',''],
  ]) {
    const node=live[key], reviewed=base[key];
    assert.equal(node.getFullText(live.ast),reviewed.getFullText(base.ast),'Unreviewed conduit declaration: '+key);
    edits.push([node.getFullStart(),node.end,replacement]);
  }
  const spec=live.poolType;
  assert.equal(input[spec.end],',','Unexpected final ConduitPool import');
  edits.push([spec.getStart(live.ast),spec.end+1,'']);
  let output=input;
  for (const [start,end,replacement] of edits.sort((a,b)=>b[0]-a[0])) output=output.slice(0,start)+replacement+output.slice(end);
  output=binding+'\n'+output;
  return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}

export function integrateConduits(game, install=true) {
  const original=fs.readFileSync(path.join(root,'.reference',file));
  const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
  assert.equal(sha256(original),lock.files[file]);
  const before=fs.readFileSync(path.join(game,file));
  const after=Buffer.from(renderConduits(before.toString(),original.toString()));
  if (install) installCharacterSources(game,[{file,before,after}]);
  return {files:[file], decision:'Actor resource ticks use SDK conduits and the original skill admission, stat and recovery services.'};
}
