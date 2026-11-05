import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {installCharacterSources} from './install-character-sources.mjs';

const file='meta/memoryUnlocks.ts';
const {methods}=JSON.parse(fs.readFileSync(path.join(root,'baseline/unlock-lifecycle/acceptance.json'))).fixtures.memory;
const argumentsByMethod={
 memoryCatalog:'engineMemoryContext',
 memoryDiscovered:'a, kind, id, engineMemoryContext',
 memorySecondaryOwned:'a, kind, id, engineMemoryContext',
 memoryProgressionOpen:'a, engineMemoryContext',
 memorySecondaryOpen:'a, kind, id, mechanic, engineMemoryContext',
 memoryCommissionReady:'a, kind, id, need, engineMemoryContext',
 memoryUnlockCandidates:'a, def, engineMemoryContext',
 grantMemoryUnlock:'a, def, random, engineMemoryContext',
 awakenMemoryFromDrop:'a, id, rarity, engineMemoryContext',
 memoryAccessView:'a, engineMemoryContext',
};
const context=`
import * as engineMemories from '@hollow-wake/engine/progression/memories';
// Imported account/content values are resolved at the point of use.
const engineMemoryContext: engineMemories.MemoryRewardContext = {
  get config() { return MEMORY_UNLOCK_CFG; },
  get unlockAllFeature() { return FEATURE.UNLOCK_ALL_GEMS; },
  catalogue: () => engineMemories.buildMemoryCatalog(Object.values(SKILLS), Object.values(SUPPORTS)),
  progressionOpen: ledger => powerProgressionOpen(ledger, 'awakening'),
  gemDropKey: id => gemDropKey(id),
  canAwakenSkill: id => Object.hasOwn(SKILLS, id) && !SKILLS[id].noDrop,
};
`;

export function renderMemoryRewards(source){
 const input=source.replaceAll('\r\n','\n');
 const ast=ts.createSourceFile(file,input,ts.ScriptTarget.Latest,true);
 assert(!/\b(engineMemories|engineMemoryContext)\b/.test(input),'Memory binding name collision');
 const imports=ast.statements.filter(ts.isImportDeclaration);
 assert(imports.length,'Missing memory imports');
 const edits=[[imports.at(-1).end,imports.at(-1).end,context]];
 assert.deepEqual(Object.keys(argumentsByMethod).sort(),Object.keys(methods).map(key=>key.split('#')[1]).sort());
 for(const [qualified,digest]of Object.entries(methods)){
  const name=qualified.split('#')[1];
  const matches=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
  assert.equal(matches.length,1,qualified);
  const node=matches[0];
  assert(node.body&&sha256(node.getText(ast))===digest,'Unreviewed memory function '+name);
  const call=name==='memoryCatalog'
   ? 'buildMemoryCatalog(Object.values(SKILLS), Object.values(SUPPORTS), MEMORY_UNLOCK_CFG.excluded)'
   : name+'('+argumentsByMethod[name]+')';
  edits.push([node.body.getStart(ast),node.body.end,'{ return engineMemories.'+call+'; }']);
 }
 let output=input;
 for(const [start,end,text]of edits.sort((left,right)=>right[0]-left[0]))output=output.slice(0,start)+text+output.slice(end);
 const reduced=ts.createSourceFile(file,output,ts.ScriptTarget.Latest,true);
 const used=new Set();
 function visit(node){
  if(ts.isImportDeclaration(node))return;
  if(ts.isIdentifier(node))used.add(node.text);
  ts.forEachChild(node,visit);
 }
 visit(reduced);
 const retired=new Set(['isSkillUnlockedForDrop','isSupportUnlockedForDrop']);
 const pruning=[];
 for(const declaration of reduced.statements.filter(ts.isImportDeclaration)){
  const bindings=declaration.importClause?.namedBindings;
  if(!bindings||!ts.isNamedImports(bindings))continue;
  const kept=bindings.elements.filter(node=>!retired.has(node.name.text)||used.has(node.name.text));
  if(kept.length===bindings.elements.length)continue;
  assert(kept.length,'Unexpected empty memory import');
  pruning.push([bindings.getStart(reduced),bindings.end,'{ '+kept.map(node=>node.getText(reduced)).join(', ')+' }']);
 }
 for(const [start,end,text]of pruning.reverse())output=output.slice(0,start)+text+output.slice(end);
 assert.equal(ts.createSourceFile(file,output,ts.ScriptTarget.Latest,true).parseDiagnostics.length,0);
 return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}

export function integrateMemoryRewards(game,install=true){
 const relative='src/'+file,before=fs.readFileSync(path.join(game,relative));
 const after=Buffer.from(renderMemoryRewards(before.toString('utf8')));
 if(install)installCharacterSources(game,[{file:relative,before,after}]);
 return {files:[relative],decision:'memory discovery, weighted rewards, awakening, receipts and secondary access'};
}
