import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';

export const restorationPaths={actor:'src/engine/actor.ts',world:'src/engine/world.ts',binding:'src/engine/resourceRestorationAdapter.ts'};
export const restorationDecision='M43: delegate shield/poise gains and immediate/proc restoration over borrowed state; preserve native invocation, cue/event order and partial failures';
export const restorationImports={
  actor:["import {gainEnergyShield as engineGainEnergyShield, gainPoise as engineGainPoise} from '@hollow-wake/engine/combat/restoration';",
    "import {resourceRestorationPorts} from './resourceRestorationAdapter';"],
  world:["import {applyInstantRestoration as engineApplyInstantRestoration, applyProcRestoration as engineApplyProcRestoration} from '@hollow-wake/engine/combat/restoration';",
    "import {resourceRestorationPorts} from './resourceRestorationAdapter';"],
};
const contract=JSON.parse(fs.readFileSync(path.join(root,'baseline/milestone-forty-three/adapter-contract.json')));
const lf=text=>text.replaceAll('\r\n','\n');
const name=node=>node.name&&(ts.isComputedPropertyName(node.name)
  ?ts.isStringLiteral(node.name.expression)?node.name.expression.text:undefined:node.name.text);

export function restorationTree(source,kind){
  assert(kind==='actor'||kind==='world','Invalid restoration source kind');
  const ast=ts.createSourceFile(restorationPaths[kind],source,ts.ScriptTarget.Latest,true);
  assert.equal(ast.parseDiagnostics.length,0,'Invalid restoration source: '+kind);
  const owners=ast.statements.filter(n=>ts.isClassDeclaration(n)&&name(n)===(kind==='actor'?'Actor':'World'));
  assert.equal(owners.length,1,'Ambiguous restoration owner: '+kind);
  const owner=owners[0],members={},spec=kind==='actor'?contract.actorMembers:contract.worldMembers;
  for(const[key,expected]of Object.entries(spec)){
    const found=owner.members.filter(n=>name(n)===key);assert.equal(found.length,1,'Ambiguous restoration member: '+key);
    const node=found[0];assert.equal(ts.SyntaxKind[node.kind],expected.kind,'Invalid restoration member: '+key);
    if(ts.isMethodDeclaration(node))assert(node.body,'Invalid restoration body: '+key);members[key]=node;
  }
  let cases,restore;
  if(kind==='world'){
    const switches=members.executeProc.body.statements.filter(ts.isSwitchStatement);assert.equal(switches.length,1,'Ambiguous restoration switch');
    assert.equal(switches[0].expression.getText(ast),'fx.type','Unreviewed restoration discriminator');cases=switches[0].caseBlock.clauses;
    assert(cases.every(n=>ts.isCaseClause(n)&&ts.isStringLiteral(n.expression)),'Invalid restoration cases');
    assert.deepEqual(cases.map(n=>n.expression.text),Object.keys(contract.caseHashes),'Unreviewed restoration case order');
    restore=cases.find(n=>n.expression.text==='restore');
  }
  return {ast,owner,members,cases,restore};
}
export function renderResourceRestorationSource(source,kind){
  const input=lf(source),tree=restorationTree(input,kind),{ast,members}=tree;
  const scan=node=>{
    if(ts.isIdentifier(node))assert(!contract.reservedNames.includes(node.text),'Restoration binding collision: '+node.text);
    if(node.name)assert(!contract.reservedNames.includes(name(node)),'Restoration binding collision: '+name(node));
    ts.forEachChild(node,scan);
  };scan(ast);
  const imports=ast.statements.filter(ts.isImportDeclaration);
  assert.equal(imports.filter(n=>n.getText(ast)===contract.existingImports[kind]).length,1,'Unreviewed restoration import: '+kind);
  for(const[key,node]of Object.entries(members))assert.equal(sha256(node.getText(ast)),
    (kind==='actor'?contract.actorMembers:contract.worldMembers)[key].sha256,'Unreviewed restoration member: '+key);
  const edits=[{start:imports.at(-1).end,end:imports.at(-1).end,text:'\n'+restorationImports[kind].join('\n')}];
  if(kind==='actor'){
    for(const[key,text]of [['gainEs','{ return engineGainEnergyShield(this, amount, resourceRestorationPorts); }'],
      ['gainPoise','{ return engineGainPoise(this, amount, resourceRestorationPorts); }']])
      edits.push({start:members[key].body.getStart(ast),end:members[key].body.end,text});
  }else{
    for(const clause of tree.cases)assert.equal(sha256(clause.getText(ast)),contract.caseHashes[clause.expression.text],'Unreviewed restoration case');
    edits.push({start:members.applyRestore.body.getStart(ast),end:members.applyRestore.body.end,
      text:"{ return engineApplyInstantRestoration<Actor, SkillTag[], import('../data/feedingCues').FeedingCueSpec>(target, fx, resourceRestorationPorts, opts); }"});
    edits.push({start:tree.restore.getStart(ast),end:tree.restore.end,
      text:"case 'restore': {\n        if (engineApplyProcRestoration(caster, fx, resourceRestorationPorts)) noteProcCue(caster, procCue, 'gain', proc.id);\n        break;\n      }"});
  }
  edits.sort((a,b)=>b.start-a.start);for(let i=1;i<edits.length;i++)assert(edits[i].end<=edits[i-1].start,'Overlapping restoration edits');
  let output=input;for(const edit of edits)output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);
  restorationTree(output,kind);return output;
}
/** Reject all unreviewed inputs before writing either source file or binding. */
export function integrateResourceRestoration(game,write=true){
  const binding=path.join(game,restorationPaths.binding);assert(!fs.existsSync(binding),'Restoration binding already exists');
  const edits=['actor','world'].map(kind=>{
    const file=restorationPaths[kind],source=fs.readFileSync(path.join(game,file),'utf8');
    return [file,renderResourceRestorationSource(source,kind).replaceAll('\n',source.includes('\r\n')?'\r\n':'\n')];
  });
  edits.push([restorationPaths.binding,fs.readFileSync(path.join(root,'adapters/hollow-wake/resourceRestorationAdapter.ts'),'utf8')]);
  if(write)for(const[file,text]of edits)fs.writeFileSync(path.join(game,file),text,{flag:file===restorationPaths.binding?'wx':'w'});
  return {files:edits.map(([file])=>file),decision:restorationDecision};
}
