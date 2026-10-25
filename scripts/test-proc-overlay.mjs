import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,verifyReference,writeJSON} from './reference-utils.mjs';
import {procPaths,procWorldTree,procBoundary,integrateProcs} from '../adapters/hollow-wake/integrate-procs.mjs';
const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(reference,lock);
const base=fs.readFileSync(path.join(reference,procPaths.world),'utf8').replaceAll('\r\n','\n'),tree=procWorldTree(base),boundary=procBoundary(tree),faults=[];
const replace=(start,end,text)=>base.slice(0,start)+text+base.slice(end);
for(const [name,node]of Object.entries(boundary.methods))faults.push([name,replace(node.body.getStart(tree.ast)+1,node.body.getStart(tree.ast)+1,' void 0; ')]);
for(const [name,nodes]of Object.entries(boundary.phases)){
 const node=nodes[0];let start=node.getStart(tree.ast),end=node.end,text=node.getText(tree.ast);
 if(['carryOuter','carryAdmission'].includes(name))text='('+text+')';
 else if(name==='carryResolution'||name==='carry')text=text.replace(' = ',' = (') .replace(/;$/,');');
 else text=text.replace('{','{ void 0;');
 assert.notEqual(text,node.getText(tree.ast));faults.push([name,replace(start,end,text)]);
}
for(const [name,node]of Object.entries(boundary.globals)){
 const text=node.getText(tree.ast),changed=name==='procIndex'?text.replace('{','{ void 0;'):text.replace('= null','= (null)');
 assert.notEqual(text,changed);faults.push([name,replace(node.getStart(tree.ast),node.end,changed)]);
}
for(const text of ['function unexpected(){return procIndex();}','function unexpected(){return PROC_INDEX;}'])faults.push(['unreviewed-registry-reader',base+'\n'+text]);
const reports=[];
for(const ending of ['\n','\r\n']){
 const game=fs.mkdtempSync(path.join(root,'.artifacts/proc-overlay-'));fs.mkdirSync(path.join(game,'src/engine'),{recursive:true});
 const file=path.join(game,procPaths.world),binding=path.join(game,procPaths.binding),source=(base+'\n// retained unrelated marker\n').replaceAll('\n',ending);
 fs.writeFileSync(file,source);integrateProcs(game,false);assert.equal(fs.readFileSync(file,'utf8'),source);assert(!fs.existsSync(binding));
 const collision=source+'\nclass WorldProcHitEvent {}\n';fs.writeFileSync(file,collision);assert.throws(()=>integrateProcs(game),/binding collision/);assert.equal(fs.readFileSync(file,'utf8'),collision);assert(!fs.existsSync(binding));
 for(const [name,value]of faults){const changed=value.replaceAll('\n',ending);fs.writeFileSync(file,changed);assert.throws(()=>integrateProcs(game),/Unreviewed/,'Source fault escaped: '+name);assert.equal(fs.readFileSync(file,'utf8'),changed);assert(!fs.existsSync(binding));}
 fs.writeFileSync(file,source);fs.writeFileSync(binding,'existing host binding');assert.throws(()=>integrateProcs(game),/already exists/);assert.equal(fs.readFileSync(file,'utf8'),source);assert.equal(fs.readFileSync(binding,'utf8'),'existing host binding');fs.unlinkSync(binding);
 integrateProcs(game);const output=fs.readFileSync(file,'utf8');assert.equal(output.includes('\r\n'),ending==='\r\n');assert(output.endsWith(ending+'// retained unrelated marker'+ending));
 const afterTree=procWorldTree(output.replaceAll('\r\n','\n')),members=t=>new Map(t.world.members.map(n=>[n.name?.getText(t.ast),n.getText(t.ast)])),before=members(tree),after=members(afterTree);
 assert.equal(after.size,before.size+2);const edited=new Set([...Object.keys(boundary.methods),'resolveHit','sweepTalentEvents']);
 for(const [name,text]of before)if(!edited.has(name))assert.equal(after.get(name),text,'Unrelated World member changed: '+name);
 const method=name=>afterTree.world.members.find(n=>n.name?.getText(afterTree.ast)===name);
 assert.equal(method('sweepTalentEvents').body.statements.at(-1).getText(afterTree.ast),boundary.talent.body.statements.at(-1).getText(tree.ast));
 const oldHit=boundary.resolve.body.statements,newHit=method('resolveHit').body.statements;assert.equal(oldHit.length,newHit.length);
 for(let i=0;i<oldHit.length;i++)if(oldHit[i]!==boundary.hit&&oldHit[i]!==boundary.outer)assert.equal(newHit[i].getText(afterTree.ast),oldHit[i].getText(tree.ast),'Unrelated hit phase '+i);
 const newOuter=newHit[oldHit.indexOf(boundary.outer)],newInner=newOuter.thenStatement.statements[2];
 assert.equal(newOuter.expression.getText(afterTree.ast),boundary.outer.expression.getText(tree.ast));
 assert.equal(newInner.thenStatement.statements.length,1);assert.equal(newInner.thenStatement.statements[0].getText(afterTree.ast),boundary.inner.thenStatement.statements.at(-1).getText(tree.ast),'Kill rewards moved or changed');
 assert.throws(()=>integrateProcs(game),/already integrated/);reports.push({ending,sourceFaultsRejected:faults.length,collisionRejectedBeforeWrites:true,unrelatedMembersAndHitPhasesPreserved:true,gaugeAndKillRewardTailsPreserved:true,duplicateRejected:true});
}
verifyReference(reference,lock);writeJSON(path.join(root,'.artifacts/proc-overlay-verification.json'),{reports,originalUnchanged:true});console.log('Proc overlay source controls passed in both newline styles: '+faults.length*2+' source faults rejected.');
