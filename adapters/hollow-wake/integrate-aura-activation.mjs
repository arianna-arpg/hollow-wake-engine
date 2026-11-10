import assert from 'node:assert/strict';import ts from 'typescript';import fs from 'node:fs';import path from 'node:path';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {installCharacterSources} from './install-character-sources.mjs';
const entry='@hollow-wake/engine/auras/activation';
const binding=`
 private engineAuraActivation=new EngineAuraActivation<Actor,SkillInstance,AuraDelivery['aura'],Modifier,string,{tags:ReturnType<typeof skillContextTags>;extra:ReturnType<typeof instanceMods>}>({
  context:i=>({tags:skillContextTags(i),extra:instanceMods(i)}),duration:i=>socketSpec(i,'auraDuration'),reserveLife:i=>socketSpec(i,'reserveLife')!==undefined,
  stat:(a,k,c)=>a.sheet.get(k,c.tags,c.extra),maxLife:a=>a.maxLife(),maxMana:a=>a.maxMana(),lifeCeiling:a=>a.lifeCeiling(),availableMaxMana:a=>a.availableMaxMana(),
  laneBusy:(a,key)=>this.failNote(a,key,'already overdriven'),cannotSustain:a=>this.text(a.pos,'cannot sustain','#d05050',12),retire:(a,key)=>this.deactivateAura(a,key),
  modifier:(key,value)=>mod(key,'increased',value),time:()=>this.time,setSource:(a,key,mods)=>a.sheet.setSource(key,mods),
 });
`;
export function renderAuraActivation(source,original){
 const input=source.replaceAll('\r\n','\n'),pinned=original.replaceAll('\r\n','\n');assert(!input.includes(entry)&&!/(?:engineAuraActivation|EngineAuraActivation)/.test(input),'Activation binding collision');
 const parse=text=>{const ast=ts.createSourceFile('world.ts',text,ts.ScriptTarget.Latest,true),owners=ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');assert.equal(owners.length,1);const methods=owners[0].members.filter(n=>ts.isMethodDeclaration(n)&&n.name?.getText(ast)==='activateAura');assert.equal(methods.length,1);assert(methods[0].body);return{ast,owner:owners[0],method:methods[0]};};
 const live=parse(input),clean=parse(pinned);assert.equal(sha256(live.method.getText(live.ast)),sha256(clean.method.getText(clean.ast)),'Unreviewed activation command');
 const edits=[[live.method.body.getStart(live.ast),live.method.body.end,'{ this.engineAuraActivation.activate(caster,inst,d,aoeScale); }'],[live.owner.members.pos,live.owner.members.pos,binding],[0,0,"import {AuraActivation as EngineAuraActivation} from '"+entry+"';\n"]];
 let result=input;for(const[start,end,text]of edits.sort((a,b)=>b[0]-a[0]))result=result.slice(0,start)+text+result.slice(end);return source.includes('\r\n')?result.replaceAll('\n','\r\n'):result;
}

/** Preflight the complete activation command before installing its replacement. */
export function integrateAuraActivation(game,install=true){
 const file='src/engine/world.ts',lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),pinned=fs.readFileSync(path.join(root,'.reference',file));assert.equal(sha256(pinned),lock.files[file]);
 const before=fs.readFileSync(path.join(game,file)),after=Buffer.from(renderAuraActivation(before.toString(),pinned.toString()));
 if(install)installCharacterSources(game,[{file,before,after}]);
 return{files:[file],decision:'Aura activation retains reservation, duration eviction, borrowed identities and synchronous callback ordering. Hosts provide support admission, stats, retirement and presentation.'};
}
