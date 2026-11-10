import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';import {root,sha256} from '../../scripts/reference-utils.mjs';
import {installCharacterSources} from './install-character-sources.mjs';
const file='src/engine/world.ts';
const binding="const engineBodyLevels=new EngineBodyLevels<Actor,SkillInstance,Modifier,NonNullable<Actor['plySpec']>>({\n definition:id=>MONSTERS[id],growth:()=>MONSTER_LEVEL_SCALE,bossPoise:()=>DEFENSE_CFG.poise,modifier:mod,\n setSource:(a,key,mods)=>a.sheet.setSource(key,mods),setBase:(a,key,n)=>a.sheet.setBase(key,n),maxLife:a=>a.maxLife(),\n});\n";
/** Guard complete level methods while preserving other installed host adapters. */
export function renderBodyLevels(source,original){
 const input=source.replaceAll('\r\n','\n'),clean=original.replaceAll('\r\n','\n');
 assert(!input.includes('@hollow-wake/engine/bodies/levels')&&!/\b(?:engineBodyLevels|EngineBodyLevels|engineBodySkillLevel)\b/.test(input),'Body-level adapter already installed or binding collision');
 const parse=text=>{const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true),worlds=ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');assert.equal(worlds.length,1,'Expected one World');
  const select=(nodes,name)=>{const found=nodes.filter(n=>(ts.isMethodDeclaration(n)||ts.isFunctionDeclaration(n))&&n.name?.getText(ast)===name);assert.equal(found.length,1,name);assert(found[0].body,name);return found[0];};
  return{ast,world:worlds[0],methods:[select(worlds[0].members,'stampMonsterLevel'),select(worlds[0].members,'relevelActor'),select(ast.statements,'monsterSkillLevelOf')]};};
 const live=parse(input),pinned=parse(clean),changes=[];
 for(let n=0;n<live.methods.length;n++){
  const method=live.methods[n],name=method.name.getText(live.ast);assert.equal(sha256(method.getText(live.ast)),sha256(pinned.methods[n].getText(pinned.ast)),'Unreviewed body-level method '+name);
  const replacement=name==='stampMonsterLevel'?'{ engineBodyLevels.stamp(a,def,level); }':name==='relevelActor'?'{ engineBodyLevels.relevel(a,level); }':'{ return engineBodySkillLevel(level); }';changes.push([method.body.getStart(live.ast),method.body.end,replacement]);
 }
 const importNode=live.ast.statements.filter(n=>ts.isImportDeclaration(n)&&n.moduleSpecifier.text==='./plies');assert.equal(importNode.length,1,'Expected one plies import');
 const names=importNode[0].importClause?.namedBindings;assert(names&&ts.isNamedImports(names));const removed=names.elements.filter(n=>n.name.text==='plyCountOf');assert.equal(removed.length,1);assert(!removed[0].propertyName,'Unexpected ply alias');
 changes.push([names.getStart(live.ast),names.end,'{ '+names.elements.filter(n=>n!==removed[0]).map(n=>n.getText(live.ast)).join(', ')+' }']);
 changes.push([live.world.getStart(live.ast),live.world.getStart(live.ast),binding]);
 changes.push([0,0,"import {BodyLevels as EngineBodyLevels,bodySkillLevel as engineBodySkillLevel} from '@hollow-wake/engine/bodies/levels';\n"]);
 let output=input;for(const[start,end,text]of changes.sort((a,b)=>b[0]-a[0]))output=output.slice(0,start)+text+output.slice(end);
 return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}

export function integrateBodyLevels(game,install=true){
 const pinned=fs.readFileSync(path.join(root,'.reference',file));
 assert.equal(sha256(pinned),JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))).files[file]);
 const before=fs.readFileSync(path.join(game,file)),after=Buffer.from(renderBodyLevels(before.toString(),pinned.toString()));
 if(install)installCharacterSources(game,[{file,before,after}]);
 return{files:[file],decision:'Fresh-body level stamps, in-place releveling and the native skill ladder use one optional SDK service. Definitions, stat writes, body construction and live effects remain explicit host responsibilities.'};
}
