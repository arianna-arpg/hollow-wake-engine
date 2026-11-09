import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {installCharacterSources} from './install-character-sources.mjs';
const file='src/engine/companionGrants.ts';
const binding={
  "runtime": "const runtime=new Runtime<Actor,SkillDef,SkillInstance,Actor,SummonDelivery>({\n summon:def=>def.delivery.type==='summon'?def.delivery:undefined,maxLevel:skillMaxLevel,\n grantedLevel:(owner,def)=>owner.sheet.get(companionGrantStat(def.id)),makeSkill:makeSkillInstance,\n respawnScale:(owner,inst)=>owner.sheet.get('minionRespawnTime',skillContextTags(inst),instanceMods(inst)),\n});\n",
  "wrapper": "export class CompanionGrants {\n private owners=new WeakMap<Actor,Map<string,CompanionGrant>>();\n derive(owner:Actor,defs:readonly SkillDef[],source:(id:string)=>string,retire:(body:Actor)=>void,\n   refresh:(body:Actor,inst:SkillInstance)=>void,relicSource:(id:string)=>string|undefined=()=>undefined):void {\n  const state:CompanionGrantState<SkillInstance,Actor>={grants:this.owners.get(owner)};\n  runtime.derive(state,owner,defs,source,retire,refresh,relicSource);\n  if(state.grants)this.owners.set(owner,state.grants);else this.owners.delete(owner);\n }\n update(owner:Actor,actors:readonly Actor[],dt:number,spawn:(inst:SkillInstance,delivery:SummonDelivery)=>Actor|null,retire:(body:Actor)=>void):void {\n  runtime.update({grants:this.owners.get(owner)},owner,dt,body=>actors.includes(body),spawn,retire);\n }\n}\n",
  "ports": "const reservationPorts:CompanionReservationPorts<Actor,SkillInstance,ReturnType<typeof skillContextTags>,ReturnType<typeof instanceMods>>={\n tags:skillContextTags,modifiers:instanceMods,\n  manaCost:(owner,tags,mods)=>owner.sheet.get('manaCost',tags,mods),\n  reservationMultiplier:(owner,skill,tags,mods)=>owner.sheet.get(summonReservationStat(skill.def.id),tags,mods,1),\n};\n",
  "price": "export function summonReservationUnit(actor:Actor,inst:SkillInstance,d:SummonDelivery):number {\n return companionReservationUnit(actor,inst,d,reservationPorts);\n}\n"
};
export function renderCompanionGrants(source,original){
 const input=source.replaceAll('\r\n','\n'),clean=original.replaceAll('\r\n','\n');
 assert(!input.includes('@hollow-wake/engine/companions/grants'),'Companion adapter already installed');
 assert(input.startsWith(clean),'Unreviewed companion module');
 const ast=ts.createSourceFile(file,clean,ts.ScriptTarget.Latest,true);
 const select=(kind,name)=>{const rows=ast.statements.filter(n=>kind(n)&&n.name?.text===name);assert.equal(rows.length,1,name);return rows[0];};
 const changes=[[select(ts.isClassDeclaration,'CompanionGrants'),binding.wrapper],[select(ts.isFunctionDeclaration,'summonReservationUnit'),binding.price]];
 let output=input;
 for(const[node,text]of changes.sort((a,b)=>b[0].pos-a[0].pos))output=output.slice(0,node.getStart(ast))+text.trimEnd()+output.slice(node.end);
 output="import {CompanionGrants as Runtime,companionReservationUnit,type CompanionGrantState,type CompanionReservationPorts} from '@hollow-wake/engine/companions/grants';\n"+output+'\n'+binding.runtime+binding.ports;
 return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}
export function integrateCompanionGrants(game,install=true){
 const pinned=fs.readFileSync(path.join(root,'.reference',file));
 assert.equal(sha256(pinned),JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))).files[file]);
 const before=fs.readFileSync(path.join(game,file)),after=Buffer.from(renderCompanionGrants(before.toString(),pinned.toString()));
 if(install)installCharacterSources(game,[{file,before,after}]);
 return {files:[file],decision:'Persistent companion derivation, lifetime and reservation prices use the optional SDK; host spawning, retirement, stat registration and World routing remain live.'};
}
