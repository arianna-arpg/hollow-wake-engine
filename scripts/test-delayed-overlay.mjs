import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,sha256,verifyReference,writeJSON} from './reference-utils.mjs';
import {renderProcEffectSource} from '../adapters/hollow-wake/integrate-proc-effects.mjs';
import {renderBankWorld} from '../adapters/hollow-wake/integrate-channel-banks.mjs';
import {delayedPaths,delayedTree,integrateDelayedBursts} from '../adapters/hollow-wake/integrate-delayed-bursts.mjs';
const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(reference,lock);
const contract=JSON.parse(fs.readFileSync(path.join(root,'baseline/milestone-forty/adapter-contract.json')));
assert.equal(contract.source,lock.commit);assert.equal(contract.sourceLockSha256,sha256(fs.readFileSync(path.join(root,'baseline/source-lock.json'))));
assert.equal(contract.sourceBoundariesSha256,sha256(fs.readFileSync(path.join(root,'baseline/milestone-forty/source-boundaries.json'))));assert.equal(contract.runtimeContractSha256,sha256(fs.readFileSync(path.join(root,'baseline/milestone-forty/runtime-contract.json'))));
const base=renderBankWorld(renderProcEffectSource(fs.readFileSync(path.join(reference,delayedPaths.world),'utf8'),delayedPaths.world)),tree=delayedTree(base),faults=[];
const replace=(start,end,text)=>base.slice(0,start)+text+base.slice(end);
for(const [key,n]of Object.entries(tree.members)){
 faults.push([key+':changed',replace(n.getStart(tree.ast),n.end,n.getText(tree.ast).replace(key,key+'_changed'))]);
 faults.push([key+':missing',replace(n.getStart(tree.ast),n.end,'')]);
 faults.push([key+':duplicate',replace(n.end,n.end,'\n'+n.getText(tree.ast))]);
 if(n.body){const start=n.body.getStart(tree.ast)+1;faults.push([key+':body',replace(start,start,' void 0; ')]);}
}
for(const c of tree.cases)if(c!==tree.schedule)faults.push(['sibling:'+c.expression.text,replace(c.getStart(tree.ast),c.getStart(tree.ast),'case "unreviewed": ')]);
faults.push(['invalid-source',base+'\nconst incomplete = ;'],['duplicate-world',base+'\nclass World {}']);
for(const key of contract.reservedNames){faults.push(['binding:'+key,base+'\nconst '+key+'=0;']);faults.push(['quoted-binding:'+key,replace(tree.owner.members.end,tree.owner.members.end,'\n["'+key+'"]() {}')]);}
for(const access of ['this.pendingBursts',"this['pendingBursts']"])faults.push(['queue-reader:'+access,replace(tree.owner.members.end,tree.owner.members.end,'\nunreviewed(){return '+access+';}')]);
const reports=[];
for(const ending of ['\n','\r\n']){
 const game=fs.mkdtempSync(path.join(root,'.artifacts/delayed-overlay-'));fs.mkdirSync(path.join(game,'src/engine'),{recursive:true});const file=path.join(game,delayedPaths.world),binding=path.join(game,delayedPaths.binding),input=(base+'\n// retained unrelated marker\n').replaceAll('\n',ending);
 fs.writeFileSync(file,input);integrateDelayedBursts(game,false);assert.equal(fs.readFileSync(file,'utf8'),input);assert(!fs.existsSync(binding));
 for(const [name,value]of faults){const changed=value.replaceAll('\n',ending);fs.writeFileSync(file,changed);assert.throws(()=>integrateDelayedBursts(game),/Unreviewed|Ambiguous|Invalid|binding collision/,'Source fault escaped: '+name);assert.equal(fs.readFileSync(file,'utf8'),changed);assert(!fs.existsSync(binding));}
 fs.writeFileSync(file,input);fs.writeFileSync(binding,'existing binding');assert.throws(()=>integrateDelayedBursts(game),/already exists/);assert.equal(fs.readFileSync(file,'utf8'),input);assert.equal(fs.readFileSync(binding,'utf8'),'existing binding');fs.unlinkSync(binding);
 integrateDelayedBursts(game);const output=fs.readFileSync(file,'utf8');assert.equal(output.includes('\r\n'),ending==='\r\n');assert(output.endsWith(ending+'// retained unrelated marker'+ending));
 const parsed=ts.createSourceFile(delayedPaths.world,output.replaceAll('\r\n','\n'),ts.ScriptTarget.Latest,true),world=parsed.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World'),members=new Map(world.members.map(n=>[n.name?.getText(parsed),n]));
 assert.equal(world.members.length,tree.owner.members.length+1);const changed=new Set(['executeProc','loadZone','updatePendingBursts']);
 for(const before of tree.owner.members){const key=before.name?.getText(tree.ast);if(!changed.has(key))assert.equal(members.get(key).getText(parsed),before.getText(tree.ast),'Unrelated World member changed: '+key);else assert.equal(base.slice(before.getStart(tree.ast),before.body.getStart(tree.ast)),parsed.text.slice(members.get(key).getStart(parsed),members.get(key).body.getStart(parsed)),'Method signature changed: '+key);}
 const afterExecute=members.get('executeProc'),afterSwitch=afterExecute.body.statements.find(ts.isSwitchStatement);
 assert.equal(afterExecute.body.statements.length,tree.members.executeProc.body.statements.length);
 for(let i=0;i<afterExecute.body.statements.length;i++)if(tree.members.executeProc.body.statements[i]!==tree.dispatch)assert.equal(afterExecute.body.statements[i].getText(parsed),tree.members.executeProc.body.statements[i].getText(tree.ast),'Executor context or rider tail changed');
 assert.equal(afterSwitch.expression.getText(parsed),tree.dispatch.expression.getText(tree.ast));assert.equal(afterSwitch.caseBlock.clauses.length,22);
 for(let i=0;i<22;i++)if(tree.cases[i]!==tree.schedule)assert.equal(afterSwitch.caseBlock.clauses[i].getText(parsed),tree.cases[i].getText(tree.ast),'Sibling executor changed');
 assert.equal(members.get('loadZone').getText(parsed).replace('this.delayedBurstEngine.reset(this)','this.pendingBursts = []'),tree.members.loadZone.getText(tree.ast),'Unrelated zone loading changed');
 const globals=(ast,world)=>ast.statements.filter(n=>!ts.isImportDeclaration(n)&&n!==world).map(n=>n.getText(ast));assert.deepEqual(globals(parsed,world),globals(tree.ast,tree.owner));
 assert.throws(()=>integrateDelayedBursts(game),/already exists/);reports.push({newline:ending,faultsRejected:faults.length,dryRunUnchanged:true,allRejectionsLeaveSourcesUnchanged:true,other21CasesUnchanged:true,otherWorldMembersAndGlobalsUnchanged:true,signaturesAndFrameOrderUnchanged:true,zoneResetOnly:true,duplicateRejected:true});
}
verifyReference(reference,lock);writeJSON(path.join(root,'.artifacts/delayed-overlay-verification.json'),{decision:contract.decision,reconstruction:'Pinned original with the approved ward and bank transformations; all five guarded member hashes equal the retained M39 installation.',reports,sourceFaults:reports.reduce((n,r)=>n+r.faultsRejected,0),originalUnchanged:true});console.log('Delayed source controls passed: '+faults.length*2+' faults rejected.');
