import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {installCharacterSources} from './install-character-sources.mjs';
import {renderMemoryRewards} from './integrate-memory-rewards.mjs';

const file='meta/unlocks.ts',parse=source=>ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
const guards=JSON.parse(fs.readFileSync(path.join(root,'baseline/unlock-lifecycle/adapter-source-guards.json')));
assert.equal(guards.sourceLockSha256,sha256(fs.readFileSync(path.join(root,'baseline/source-lock.json'))));
const names=guards.names,accepted=new Map(Object.entries(guards.methods).map(([name,hashes])=>[name,new Set(hashes)])),knownImports=new Set(guards.knownImports);
let context=fs.readFileSync(path.join(root,'adapters/hollow-wake/unlock-context.txt'),'utf8')
 .replace('__RUNTIME__',"'@hollow-wake/engine/progression/unlocks'")
 .replace(' questDoneKey, vocationUnlockKey,',' questDoneKey, vocationUnlockKey, isClassUnlocked as engineUnlockClassUnlocked,')
 .replace('isClassUnlocked: (a, id) => isClassUnlocked(a, id)','isClassUnlocked: (a, id) => engineUnlockClassUnlocked(a, id)');
assert(context.includes('isClassUnlocked as engineUnlockClassUnlocked')&&!context.includes('__RUNTIME__'));
function apply(source,edits){let result=source;for(const [start,end,text]of edits.sort((a,b)=>b[0]-a[0]))result=result.slice(0,start)+text+result.slice(end);return result;}
function localIdentifier(node){
 if(!ts.isIdentifier(node))return false;
 const parent=node.parent;
 return !((ts.isPropertyAccessExpression(parent)||ts.isPropertyAssignment(parent)||ts.isPropertySignature(parent)||ts.isMethodSignature(parent))&&parent.name===node);
}

/** Accept only the frozen original methods or reviewed earlier SDK delegations.
 * Keep host content live, preserve unrelated declarations/imports and perform
 * both unlock and memory writes with the shared transactional installer. */
export function renderUnlockLifecycle(source){
 const input=source.replaceAll('\r\n','\n'),ast=parse(input);
 assert(!/\b(engineUnlocks|UnlockLifecycle|engineUnlockClassUnlocked)\b/.test(input),'Unlock binding name collision');
 const edits=[],imports=ast.statements.filter(ts.isImportDeclaration);assert(imports.length);
 for(const name of names){
  const matches=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
  assert.equal(matches.length,1,name);const node=matches[0];
  assert(node.body&&accepted.get(name)?.has(sha256(node.getText(ast))),'Unreviewed unlock method '+name);
  // Earlier integrations already delegate these operations to shared SDK
  // services. Retain their reviewed host ports and live callback ordering.
  if(['pendingClassUnlocks','acknowledgeClassUnlock','claimClassUnlock','settleClassUnlocks'].includes(name)
    &&node.body.getText(ast).includes('engineClaims.'))continue;
  if(['reconcileClassBundleGems','isSkillUnlockedForSelection'].includes(name)
    &&node.body.getText(ast).includes('engineClassRewards.'))continue;
  const args=node.parameters.map(p=>{assert(ts.isIdentifier(p.name),name);return p.name.text;});
  if(['applyUnlock','investUnlock'].includes(name))args.push('Math.random');
  edits.push([node.body.getStart(ast),node.body.end,'{ return engineUnlocks.'+name+'('+args.join(', ')+'); }']);
 }
 for(const name of ['classMilestoneCache','levelMilestoneCache','engineClaimPorts']){
  const node=ast.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)===name));
  if(node)assert(accepted.get(name)?.has(sha256(node.getText(ast))),'Unreviewed unlock helper '+name);
 }
 edits.push([imports.at(-1).end,imports.at(-1).end,'\n'+context]);
 let output=apply(input,edits);
 // Retire a private helper only when no host extension still refers to it.
 for(;;){
  const parsed=parse(output),counts=new Map();
  function visit(node){if(ts.isImportDeclaration(node))return;if(localIdentifier(node))counts.set(node.text,(counts.get(node.text)??0)+1);ts.forEachChild(node,visit);}
  visit(parsed);const removals=[];
  for(const node of parsed.statements){
   if(node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))continue;
   if(ts.isFunctionDeclaration(node)&&names.includes(node.name?.text)&&counts.get(node.name.text)===1)removals.push([node.getStart(parsed),node.end,'']);
   if(ts.isVariableStatement(node)&&node.declarationList.declarations.length===1){
    const name=node.declarationList.declarations[0].name.getText(parsed);
    if(['classMilestoneCache','levelMilestoneCache','engineClaimPorts'].includes(name)&&counts.get(name)===1)removals.push([node.getStart(parsed),node.end,'']);
   }
  }
  if(!removals.length)break;output=apply(output,removals);
 }
 const parsed=parse(output),used=new Set();
 function visit(node){if(ts.isImportDeclaration(node))return;if(localIdentifier(node))used.add(node.text);ts.forEachChild(node,visit);}
 visit(parsed);const pruning=[];
 for(const node of parsed.statements.filter(ts.isImportDeclaration)){
  const clause=node.importClause,bindings=clause?.namedBindings;if(!bindings)continue;
  const module=node.moduleSpecifier.text;
  const retire=name=>knownImports.has(module+'#'+name)&&!used.has(name);
  if(ts.isNamedImports(bindings)){
   const kept=bindings.elements.filter(item=>!retire(item.name.text));if(kept.length===bindings.elements.length)continue;
   if(kept.length||clause.name)pruning.push([bindings.getStart(parsed),bindings.end,'{ '+kept.map(n=>n.getText(parsed)).join(', ')+' }']);
   else pruning.push([node.getStart(parsed),node.end,clause.isTypeOnly?'':"import "+node.moduleSpecifier.getText(parsed)+';']);
  }else if(ts.isNamespaceImport(bindings)&&retire(bindings.name.text)&&!clause.name){
   pruning.push([node.getStart(parsed),node.end,clause.isTypeOnly?'':"import "+node.moduleSpecifier.getText(parsed)+';']);
  }
 }
 output=apply(output,pruning);assert.equal(parse(output).parseDiagnostics.length,0);
 return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}
export function integrateUnlockLifecycle(game,install=true){
 const changes=[['src/meta/unlocks.ts',renderUnlockLifecycle],['src/meta/memoryUnlocks.ts',renderMemoryRewards]].map(([file,render])=>{
  const before=fs.readFileSync(path.join(game,file));return {file,before,after:Buffer.from(render(before.toString('utf8')))};
 });
 if(install)installCharacterSources(game,changes);
 return {files:changes.map(row=>row.file),decision:'complete unlock and memory policy with live host content, explicit random and guarded prior SDK delegation replacement'};
}
