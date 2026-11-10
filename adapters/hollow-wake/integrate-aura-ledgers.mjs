import assert from 'node:assert/strict';import ts from 'typescript';import fs from 'node:fs';import path from 'node:path';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {installCharacterSources} from './install-character-sources.mjs';
const entry='@hollow-wake/engine/auras/ledgers';
const normalize=source=>source.replaceAll('\r\n','\n');
function parse(source,name){const ast=ts.createSourceFile(name+'.ts',source,ts.ScriptTarget.Latest,true),found=ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text===name);assert.equal(found.length,1,name);return{ast,owner:found[0]};}
function method(view,name){const found=view.owner.members.filter(n=>ts.isMethodDeclaration(n)&&n.name?.getText(view.ast)===name);assert.equal(found.length,1,name);assert(found[0].body);return found[0];}
function finish(source,input,edits){let result=input;for(const[start,end,text]of edits.sort((a,b)=>b[0]-a[0]))result=result.slice(0,start)+text+result.slice(end);return source.includes('\r\n')?result.replaceAll('\n','\r\n'):result;}
const binding=`
 private engineAuraLedgers=new EngineAuraLedgers<Actor,LedgerSpec,DamageType,string>({
  availableMaxMana:a=>a.availableMaxMana(),insufficient:a=>this.text(a.pos,'the ledger closes','#d05050',12),
  retire:(a,id)=>this.deactivateAura(a,id),settle:(a,s,state)=>this.settleLedger(a,s,state),
  arrears:(a,due)=>{a.hitFlash=.2;a.hitFlashType=undefined;this.text(a.pos,'arrears due: '+Math.round(due),'#d05050',13);},
  kill:a=>this.kill(a),damageColor:type=>DAMAGE_COLOR[type],
  burst:(a,r,n,t,c)=>this.burstDamage(vec(a.pos.x,a.pos.y),r,n,t,c,a.team,a.tier),
  ventCue:(a,r,c)=>{this.flashes.push({pos:vec(a.pos.x,a.pos.y),radius:r,color:c,life:.35,maxLife:.35});},
  reclaimed:(a,due)=>this.text(a.pos,'reclaimed '+Math.round(due),'#4a78d8',13),
 },'lightning');
`;
export function renderAuraLedgerWorld(source,original){
 const input=normalize(source),pinned=normalize(original);assert(!input.includes(entry)&&!/(?:engineAuraLedgers|EngineAuraLedgers)/.test(input),'Ledger world collision');const live=parse(input,'World'),clean=parse(pinned,'World'),edits=[];
 for(const[name,call]of [['updateActorLedgers','this.engineAuraLedgers.update(a,dt);'],['settleLedger','this.engineAuraLedgers.settle(bearer,spec,state);']]){
  const a=method(live,name),b=method(clean,name);assert.equal(sha256(a.getText(live.ast)),sha256(b.getText(clean.ast)),'Unreviewed '+name);edits.push([a.body.getStart(live.ast),a.body.end,'{ '+call+' }']);
 }
 edits.push([live.owner.members.pos,live.owner.members.pos,binding],[0,0,"import {AuraLedgers as EngineAuraLedgers} from '"+entry+"';\n"]);return finish(source,input,edits);
}
export function renderAuraLedgerActor(source,original){
 const input=normalize(source),pinned=normalize(original);assert(!input.includes(entry)&&!/(?:engineAuraLedgerCapacity|engineBankAuraManaRegeneration)/.test(input),'Ledger actor collision');const live=parse(input,'Actor'),clean=parse(pinned,'Actor'),edits=[];
 const capacity=method(live,'ledgerCap'),pinnedCapacity=method(clean,'ledgerCap');assert.equal(sha256(capacity.getText(live.ast)),sha256(pinnedCapacity.getText(clean.ast)),'Unreviewed ledgerCap');edits.push([capacity.body.getStart(live.ast),capacity.body.end,'{ return engineAuraLedgerCapacity(this,spec); }']);
 function bank(view){const owner=method(view,'updateTimers'),found=[];const visit=n=>{if(ts.isIfStatement(n)&&n.expression.getText(view.ast)==='manaRegen > 0')found.push(n);ts.forEachChild(n,visit);};visit(owner);assert.equal(found.length,1,'Expected one mana ledger phase');const node=found[0],block=node.parent;assert(ts.isBlock(block)&&ts.isIfStatement(block.parent));const index=block.statements.indexOf(node);assert(index>0&&index<block.statements.length-1);return{node,context:[block.parent.expression.getText(view.ast),block.statements[index-1].getText(view.ast),block.statements[index+1].getText(view.ast)],signature:owner.getText(view.ast).slice(0,owner.body.getStart(view.ast)-owner.getStart(view.ast))};}
 const current=bank(live),accepted=bank(clean);assert.deepEqual(current.context,accepted.context,'Unreviewed mana ledger phase context');assert.equal(current.signature,accepted.signature,'Unreviewed timer signature');assert.equal(sha256(current.node.getText(live.ast)),sha256(accepted.node.getText(clean.ast)),'Unreviewed mana ledger phase');edits.push([current.node.getStart(live.ast),current.node.end,'manaRegen = engineBankAuraManaRegeneration(this,manaRegen,dt);']);
 edits.push([0,0,"import {auraLedgerCapacity as engineAuraLedgerCapacity,bankAuraManaRegeneration as engineBankAuraManaRegeneration} from '"+entry+"';\n"]);return finish(source,input,edits);
}

/** Preflight both host files before publishing either replacement. */
export function integrateAuraLedgers(game,install=true){
 const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
 const changes=[['src/engine/world.ts',renderAuraLedgerWorld],['src/engine/actor.ts',renderAuraLedgerActor]].map(([file,render])=>{
  const pinned=fs.readFileSync(path.join(root,'.reference',file));assert.equal(sha256(pinned),lock.files[file]);
  const before=fs.readFileSync(path.join(game,file)),after=Buffer.from(render(before.toString(),pinned.toString()));return{file,before,after};
 });
 if(install)installCharacterSources(game,changes);
 return{files:changes.map(c=>c.file),decision:'Aura ledger capacity, regeneration suppression, upkeep and settlement retain live synchronous order. Host admission, activation, spatial damage and death remain explicit services.'};
}
