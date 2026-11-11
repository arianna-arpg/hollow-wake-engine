import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {installCharacterSources} from './install-character-sources.mjs';
const entry='@hollow-wake/engine/bodies/factory';
const binding=" private engineBodyFactory=new EngineBodyFactory<Actor,MonsterDef,SkillInstance,Modifier,NonNullable<Actor['reserves']> extends Map<string,infer R>?R:never,Team>({\n  definition:id=>MONSTERS[id],allocate:(name,team,pos)=>new Actor(name,team,pos),\n  statusRelay:()=>this.relayStatus,bombardMinted:()=>{this.bombardMintRev++;},enemyTeam:'enemy',\n  modifier:(stat,kind,value)=>mod(stat,kind,value),sympathyStat:link=>sympathyStat(link),\n  stampLevel:(a,d,level)=>this.stampMonsterLevel(a,d,level),applyPartyScale:a=>this.applyPartyScale(a),\n  random:()=>Math.random(),randomBetween:(min,max)=>rand(min,max),chance:value=>chance(value),\n  tellSpecs:(d,variant)=>tellSpecsOf(d,variant),weight:()=>DEFENSE_CFG.weight,\n  density:d=>defDensity(d),breathes:d=>defBreathes(d),zoneTagging:()=>this.zoneGenTagging,\n  appearance:id=>this.npcDialogues.appearanceFor(id),squishSpec:d=>squishSpecOf(d),makeReserve:spec=>makeReserve(spec),\n  startTone:(spec,random)=>rollStartTone(spec,random),applyAttunement:a=>a.applyStatus(attunedStatus(a.tone!),0,TUNE_CFG.holdScale,'attunement'),\n  rollItem:options=>rollItem(options),armAmbush:(a,spec)=>this.armAmbush(a,spec),turnSpeed:d=>monsterTurnSpeed(d),\n  time:()=>this.time,skillLevel:level=>monsterSkillLevelOf(level),skills:SKILLS,supports:SUPPORTS,\n  makeSkill:(def,level)=>makeSkillInstance(def,level),validTreeNodes:(def,pins)=>validTreeNodes(def,pins),choices:CHOICE_GROUPS,xpScale:XP_SCALE,\n });\n";
function parse(text){
 const ast=ts.createSourceFile('world.ts',text,ts.ScriptTarget.Latest,true);assert.equal(ast.parseDiagnostics.length,0,'Malformed World source');
 const owners=ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');assert.equal(owners.length,1,'Expected one World');
 const owner=owners[0],methods=owner.members.filter(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)==='createMonster');assert.equal(methods.length,1,'Expected one createMonster');assert(methods[0].body,'Expected createMonster body');
 return{ast,owner,method:methods[0]};
}
export function renderBodyFactory(source,original){
 const input=source.replaceAll('\r\n','\n'),pinned=original.replaceAll('\r\n','\n');
 assert(!input.includes(entry)&&! /\b(?:EngineBodyFactory|engineBodyFactory)\b/.test(input),'Body factory binding collision');
 const live=parse(input),clean=parse(pinned);assert.equal(sha256(live.method.getText(live.ast)),sha256(clean.method.getText(clean.ast)),'Unreviewed createMonster');
 const edits=[[live.method.body.getStart(live.ast),live.method.body.end,'{ return this.engineBodyFactory.create(defId,level,team,owner,spawn); }'],[live.owner.members.pos,live.owner.members.pos,'\n'+binding+'\n'],[0,0,"import {BodyFactory as EngineBodyFactory} from '"+entry+"';\n"]];
 let output=input,last=input.length;
 for(const[start,end,value]of edits.sort((a,b)=>b[0]-a[0])){assert(end<=last&&start<=end,'Overlapping body factory edits');output=output.slice(0,start)+value+output.slice(end);last=start;}
 assert.equal(ts.createSourceFile('world.ts',output,ts.ScriptTarget.Latest,true).parseDiagnostics.length,0,'Malformed delegated World');
 return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}
export function integrateBodyFactory(game,install=true){
 const file='src/engine/world.ts',lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),pinned=fs.readFileSync(path.join(root,'.reference',file));assert.equal(sha256(pinned),lock.files[file]);
 const before=fs.readFileSync(path.join(game,file)),after=Buffer.from(renderBodyFactory(before.toString(),pinned.toString()));
 if(install)installCharacterSources(game,[{file,before,after}]);
 return{files:[file],decision:'Ordered body assembly preserves content identity, random draws and partial writes. Allocation/defaults, identity, party authority, appearance, status, item services and world publication remain explicit host boundaries.'};
}
