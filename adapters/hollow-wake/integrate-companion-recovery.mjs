import {installCharacterSources} from './install-character-sources.mjs';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';import {root,sha256} from '../../scripts/reference-utils.mjs';
const file='src/engine/world.ts';
const binding="\n private engineCompanionRecovery=new EngineCompanionRecovery<Actor,ActiveStatus>({\n"+
 "rules:()=>COMPANION_CFG.recovery,actors:()=>this.actors,status:id=>STATUS_DEFS[id],\n"+
 "cleanse:a=>{a.cleanseDebuffs();},endStatus:(a,id)=>a.endStatus(id),\n"+
 "applyStatus:(a,id,dps,scale,name)=>a.applyStatus(id,dps,scale,name),maxLife:a=>a.maxLife(),\n"+
 "revivalCue:a=>this.showRecoveryCue(a,'revive',this.companionBonds.host(a)),\n});\n";
export function renderCompanionRecovery(source,original){
 const input=source.replaceAll('\r\n','\n'),clean=original.replaceAll('\r\n','\n');
 assert(!input.includes('@hollow-wake/engine/companions/recovery')&&!/\b(?:engineCompanionRecovery|EngineCompanionRecovery)\b/.test(input),'Companion recovery already installed or binding collision');
 const parse=text=>{const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true),worlds=ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');assert.equal(worlds.length,1,'Expected one World');
  const methods=['reviveCompanion','recoverCompanion'].map(name=>{const found=worlds[0].members.filter(n=>ts.isMethodDeclaration(n)&&n.name?.getText(ast)===name);assert.equal(found.length,1,name);assert(found[0].body,name);return found[0];});
  return{ast,world:worlds[0],methods};};
 const live=parse(input),pinned=parse(clean),changes=[];
 for(let n=0;n<live.methods.length;n++){
  const method=live.methods[n],name=method.name.getText(live.ast);assert.equal(sha256(method.getText(live.ast)),sha256(pinned.methods[n].getText(pinned.ast)),'Unreviewed companion recovery method '+name);
  const replacement=name==='reviveCompanion'?'{ this.engineCompanionRecovery.revive(a,frac); }':'{ this.engineCompanionRecovery.recover(a); }';changes.push([method.body.getStart(live.ast),method.body.end,replacement]);
 }
 const imports=live.ast.statements.filter(n=>ts.isImportDeclaration(n)&&n.moduleSpecifier.text==='./companionSpec');assert.equal(imports.length,1,'Expected one companion policy import');
 const names=imports[0].importClause?.namedBindings;assert(names&&ts.isNamedImports(names));const removed=names.elements.filter(n=>n.name.text==='companionRecoverySeconds');assert.equal(removed.length,1);assert(!removed[0].propertyName,'Unexpected recovery helper alias');
 changes.push([names.getStart(live.ast),names.end,'{ '+names.elements.filter(n=>n!==removed[0]).map(n=>n.getText(live.ast)).join(', ')+' }']);
 changes.push([live.world.members.pos,live.world.members.pos,binding]);
 changes.push([0,0,"import {CompanionRecovery as EngineCompanionRecovery} from '@hollow-wake/engine/companions/recovery';\n"]);
 let output=input;for(const[start,end,text]of changes.sort((a,b)=>b[0]-a[0]))output=output.slice(0,start)+text+output.slice(end);
 return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}

export function integrateCompanionRecovery(game,install=true){
 const pinned=fs.readFileSync(path.join(root,'.reference',file));
 assert.equal(sha256(pinned),JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))).files[file]);
 const before=fs.readFileSync(path.join(game,file)),after=Buffer.from(renderCompanionRecovery(before.toString(),pinned.toString()));
 if(install)installCharacterSources(game,[{file,before,after}]);
 return{files:[file],decision:'Companion recovery and revival use an optional SDK command service. Hosts own current body presence, status effects, bond lookup, presentation and scheduling. No actor acquisition or private graph cloning is replayed.'};
}
