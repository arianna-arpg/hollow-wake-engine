import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {installCharacterSources} from './install-character-sources.mjs';

const birthEntry='@hollow-wake/engine/summons/birth';
const offspringEntry='@hollow-wake/engine/summons/offspring';
const binding=" private engineSummonBirth=new EngineSummonBirth<Actor,SkillInstance,SummonDelivery,AuraDelivery['aura'],Modifier,SkillTag[],string,BuffEffect,{tags:ReturnType<typeof skillContextTags>;extra:Modifier[]}>({\n  delivery:i=>{const d=instanceDelivery(i);return d.type==='summon'?d:undefined;},context:i=>({tags:skillContextTags(i),extra:instanceMods(i)}),\n  stat:(a,key,c,base)=>a.sheet.get(key,c.tags,c.extra,base),minionsOfSkill:(a,id)=>this.minionsOfSkill(a,id),minionsOfGroup:(a,g)=>this.minionsOfGroup(a,g),\n  releaseContract:(a,schedule)=>this.releaseContract(a,schedule),kill:(a,silent)=>this.kill(a,silent),reservation:(a,i,d)=>summonReservationUnit(a,i,d),\n  maxMana:a=>a.maxMana(),availableMaxMana:a=>a.availableMaxMana(),cannotSustain:a=>this.text(a.pos,'cannot sustain','#d05050',12),\n  random:(min,max)=>rand(min,max),createMonster:(id,level,team,owner)=>this.createMonster(id,level,team,owner),lifeline:a=>this.conjurationLifeline(a),mimicsOwner:id=>!!MONSTERS[id]?.mimicOwnerForm,\n  modifier:(key,kind,value,tags)=>mod(key,kind,value,tags),setSource:(a,key,mods)=>a.sheet.setSource(key,mods),definition:id=>SKILLS[id],makeSkill:(d,level,sockets)=>makeSkillInstance(d,level,sockets),\n  forwardSockets:(i,skills)=>this.forwardSummonSockets(i,skills),inheritStats:(a,owner,i)=>this.bakeMinionOwnerStats(a,owner,i),maxLife:a=>a.maxLife(),\n  applyBloom:(a,seconds)=>a.applyStatus('blooming',0,seconds/(STATUS_DEFS.blooming?.duration||1),'bloom'),fillResources:a=>a.fillResources(),\n  clamp:(point,radius,mover)=>this.clampPos(point,radius,undefined,{mover}),actors:()=>this.actors,\n  trackStrikeRelease:(owner,body)=>{let bodies=this.strikeReleaseBodies.get(owner);if(!bodies)this.strikeReleaseBodies.set(owner,bodies=new Set());bodies.add(body);},\n  activateCrewAura:(a,i)=>{if(i.def.delivery.type==='aura')this.activateAura(a,i,i.def.delivery,a.sheet.get('aoeRadius',skillContextTags(i),instanceMods(i)));},\n  attachTethers:(a,i,owner)=>this.attachObjectTethers(a,i,owner),arrivalDamage:(point,radius,amount,color,team,tier)=>this.burstDamage(point,radius,amount,'physical',color,team,tier),\n  distance:(a,b)=>dist(a,b),heal:(a,n)=>a.healBy(n),healingText:(pos,n)=>this.text(pos,'+'+Math.round(n),'#8ae0a8',10),mendFlash:pos=>{this.flashes.push({pos,radius:90,color:'#8ae0a8',life:.25,maxLife:.25});},\n  sockets:i=>hostSockets(i),spawnBuff:i=>socketSpec(i,'spawnBuff'),addBuff:(a,b)=>a.addBuff(b),auraPool:i=>socketSpec(i,'minionAuraPool'),pick:pool=>pick(pool),\n  time:()=>this.time,accrueSummon:a=>this.sim.deadwakeField?.accrue('summon',isDeathAligned(a.faction)),presenceArrival:(a,owner,i)=>this.presenceArrival(a,owner,i),\n  arrivalFlash:(pos,radius,color)=>{this.flashes.push({pos,radius,color,life:.35,maxLife:.35});},\n });\n private engineSummonOffspring=new EngineSummonOffspring<Actor,SkillInstance,SummonDelivery>({\n  delivery:i=>{const d=instanceDelivery(i);return d.type==='summon'?d:undefined;},random:(min,max)=>rand(min,max),spawn:(a,i,o)=>this.spawnMinion(a,i,o),\n });\n";
const methods=['spawnMinion','spawnSummonOffspring','rollSummonType'];
function parse(text){
 const ast=ts.createSourceFile('world.ts',text,ts.ScriptTarget.Latest,true);
 assert.equal(ast.parseDiagnostics.length,0,'Malformed World source');
 const owners=ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');assert.equal(owners.length,1,'Expected one World');
 const owner=owners[0],found={};
 for(const name of methods){const rows=owner.members.filter(n=>ts.isMethodDeclaration(n)&&n.name?.getText(ast)===name);assert.equal(rows.length,1,'Expected one '+name);assert(rows[0].body,name+' needs a body');found[name]=rows[0];}
 const imports=ast.statements.filter(ts.isImportDeclaration).flatMap(decl=>decl.importClause?.namedBindings&&ts.isNamedImports(decl.importClause.namedBindings)?[{decl,list:decl.importClause.namedBindings}]:[]);
 const holders=imports.flatMap(row=>row.list.elements.filter(e=>e.name.text==='summonKitIds').map(spec=>({...row,spec})));
 assert.equal(holders.length,1,'Expected one summonKitIds import');
 return{ast,owner,found,holder:holders[0]};
}

/** Prepare the complete change before any checkout mutation. */
export function renderSummonBirth(source,original){
 const input=source.replaceAll('\r\n','\n'),pinned=original.replaceAll('\r\n','\n');
 assert(!input.includes(birthEntry)&&!input.includes(offspringEntry)&&! /\b(?:engineSummonBirth|EngineSummonBirth|engineSummonOffspring|EngineSummonOffspring)\b/.test(input),'Summon binding collision');
 const live=parse(input),clean=parse(pinned);
 for(const name of methods)assert.equal(sha256(live.found[name].getText(live.ast)),sha256(clean.found[name].getText(clean.ast)),'Unreviewed '+name);
 assert.equal(live.holder.spec.getText(live.ast),clean.holder.spec.getText(clean.ast),'Unreviewed summonKitIds alias');
 assert.equal(live.holder.decl.moduleSpecifier.getText(live.ast),clean.holder.decl.moduleSpecifier.getText(clean.ast),'Unreviewed summonKitIds source');
 assert.equal(live.holder.decl.importClause.isTypeOnly,clean.holder.decl.importClause.isTypeOnly,'Unreviewed summonKitIds import kind');
 const edits=[
  [live.found.spawnMinion.body.getStart(live.ast),live.found.spawnMinion.body.end,'{ return this.engineSummonBirth.spawn(caster,inst,overrides); }'],
  [live.found.spawnSummonOffspring.body.getStart(live.ast),live.found.spawnSummonOffspring.body.end,'{ this.engineSummonOffspring.spawn(parent,act); }'],
  [live.found.rollSummonType.getFullStart(),live.found.rollSummonType.end,''],
  [live.owner.members.pos,live.owner.members.pos,'\n'+binding+'\n'],
  [0,0,"import {SummonBirth as EngineSummonBirth} from '"+birthEntry+"';\nimport {SummonOffspring as EngineSummonOffspring} from '"+offspringEntry+"';\n"],
 ];
 const {decl,list,spec}=live.holder,index=list.elements.indexOf(spec),elements=list.elements;
 if(elements.length===1){assert(!decl.importClause.name,'Unexpected default import on summonKitIds');edits.push([decl.getFullStart(),decl.end,'']);}
 else if(index<elements.length-1)edits.push([spec.getStart(live.ast),elements[index+1].getStart(live.ast),'']);
 else edits.push([elements[index-1].end,spec.end,'']);
 let result=input,last=input.length;
 for(const[start,end,text]of edits.sort((a,b)=>b[0]-a[0])){assert(end<=last&&start<=end,'Overlapping summon edits');result=result.slice(0,start)+text+result.slice(end);last=start;}
 const output=ts.createSourceFile('world.ts',result,ts.ScriptTarget.Latest,true);assert.equal(output.parseDiagnostics.length,0,'Malformed delegated World');
 const leftovers=[];const visit=node=>{if(ts.isIdentifier(node)&&['summonKitIds','rollSummonType'].includes(node.text))leftovers.push(node.text);ts.forEachChild(node,visit);};visit(output);
 assert.deepEqual(leftovers,[],'Host still uses removed summon helper');
 return source.includes('\r\n')?result.replaceAll('\n','\r\n'):result;
}

export function integrateSummonBirth(game,install=true){
 const file='src/engine/world.ts',lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),pinned=fs.readFileSync(path.join(root,'.reference',file));
 assert.equal(sha256(pinned),lock.files[file]);
 const before=fs.readFileSync(path.join(game,file)),after=Buffer.from(renderSummonBirth(before.toString(),pinned.toString()));
 if(install)installCharacterSources(game,[{file,before,after}]);
 return{files:[file],decision:'Summon birth and offspring preserve admission, reservation, identity and synchronous effect order. The host retains body factories, authoritative rosters, placement, damage, death, presentation and durable publication.'};
}
