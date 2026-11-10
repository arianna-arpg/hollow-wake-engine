import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {installCharacterSources} from './install-character-sources.mjs';
const file='src/engine/world.ts';
const binding="\n private engineAuraRetirement=new EngineAuraRetirement<Actor,SkillDef,SkillInstance,NonNullable<ReturnType<Actor['activeAuras']['get']>>,GuardBashSpec,LedgerSpec>({\n"+
 "actors:()=>this.actors,removeSource:(a,key)=>a.sheet.removeSource(key),bashSpec:guardBashSpec,bash:(a,i,b,n)=>this.guardBash(a,i,b,n),\n"+
 "time:()=>this.time,maxLife:a=>a.maxLife(),skill:id=>SKILLS[id],level:effectiveSkillLevel,makeSkill:makeSkillInstance,\n"+
 "payload:(a,i,mult)=>{this.executeSkill(a,i,vec(a.pos.x,a.pos.y),{dmgMult:mult,noCooldown:true,noRepeat:true});},\n"+
 "settleLedger:(a,s,state)=>this.settleLedger(a,s,state),\n});\n";
export function renderAuraRetirement(source,original){
 const input=source.replaceAll('\r\n','\n'),clean=original.replaceAll('\r\n','\n');
 assert(!input.includes('@hollow-wake/engine/auras/retirement')&&!/\b(?:engineAuraRetirement|EngineAuraRetirement)\b/.test(input),'Retirement binding collision');
 const parse=text=>{const ast=ts.createSourceFile('world.ts',text,ts.ScriptTarget.Latest,true),worlds=ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');assert.equal(worlds.length,1);const methods=worlds[0].members.filter(n=>ts.isMethodDeclaration(n)&&n.name?.getText(ast)==='deactivateAura');assert.equal(methods.length,1);assert(methods[0].body);return{ast,world:worlds[0],method:methods[0]};};
 const live=parse(input),pinned=parse(clean);assert.equal(sha256(live.method.getText(live.ast)),sha256(pinned.method.getText(pinned.ast)),'Unreviewed aura retirement');
 const changes=[[live.method.body.getStart(live.ast),live.method.body.end,'{ this.engineAuraRetirement.retire(bearer,skillId,quietTreeRelease); }'],[live.world.members.pos,live.world.members.pos,binding],[0,0,"import {AuraRetirement as EngineAuraRetirement} from '@hollow-wake/engine/auras/retirement';\n"]];
 let output=input;for(const[start,end,text]of changes.sort((a,b)=>b[0]-a[0]))output=output.slice(0,start)+text+output.slice(end);
 return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}

export function integrateAuraRetirement(game,install=true){
 const pinned=fs.readFileSync(path.join(root,'.reference',file));
 assert.equal(sha256(pinned),JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))).files[file]);
 const before=fs.readFileSync(path.join(game,file)),after=Buffer.from(renderAuraRetirement(before.toString(),pinned.toString()));
 if(install)installCharacterSources(game,[{file,before,after}]);
 return{files:[file],decision:'Aura retirement preserves immediate source, shell, reservation, payload, ledger and debt ordering through explicit synchronous host ports. Complete private graphs, activation and durable live publication remain separate.'};
}
