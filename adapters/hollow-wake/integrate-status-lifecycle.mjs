import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
const boundary=JSON.parse(fs.readFileSync(path.join(root,'adapters/hollow-wake/status-boundary.json')));
export const statusDecision='Delegate actor-owned status application, clocks, expiry, cleanse, queries and arithmetic; host retains definitions, random stream, pop presentation and World effect execution';
export function statusTree(source){
  const input=source.replaceAll('\r\n','\n'),ast=ts.createSourceFile('actor.ts',input,ts.ScriptTarget.Latest,true);assert.equal(ast.parseDiagnostics.length,0);
  const owners=ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='Actor');assert.equal(owners.length,1);
  const member=name=>{const list=owners[0].members.filter(n=>n.name?.getText(ast)===name);assert.equal(list.length,1,'Ambiguous status method: '+name);assert(ts.isMethodDeclaration(list[0])&&list[0].body);return list[0];};
  const statements=member('updateTimers').body.statements;
  const starts=statements.filter(n=>n.getText(ast).startsWith('let dot:')),ends=statements.filter(n=>n.getText(ast)==='this.flying = fly;');assert.equal(starts.length,1);assert.equal(ends.length,1);
  const start=starts[0].getStart(ast),end=ends[0].end;assert(end>start);
  return {input,ast,member,start,end};
}
export function renderStatusActor(source){
  const {input,ast,member,start,end}=statusTree(source);assert(!/\bstatusLifecycle\b/.test(input),'Status binding collision');
  const prior=input.includes(boundary.predecessor.import);
  assert.equal(sha256(input.slice(start,end)),prior?boundary.predecessor.tickSha256:boundary.tickSha256,'Unreviewed status tick block');
  const edits=[{start,end,text:'const dot = statusLifecycle.tickStatuses(this, dt, chronoDt, onDotTick);'}];
  for(const [name,entry]of Object.entries(boundary.methods)){
    const node=member(name);assert.equal(sha256(node.getText(ast)),prior?(boundary.predecessor.methods[name]??entry.sha256):entry.sha256,'Unreviewed status method: '+name);
    edits.push({start:node.body.getStart(ast),end:node.body.end,text:'{ return statusLifecycle.'+name+'(this'+(entry.args?', '+entry.args:'')+'); }'});
  }
  if(prior){const imports=ast.statements.filter(n=>ts.isImportDeclaration(n)&&n.getText(ast)===boundary.predecessor.import);assert.equal(imports.length,1);edits.push({start:imports[0].getStart(ast),end:imports[0].end,text:''});}
  let output=input;for(const e of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,e.start)+e.text+output.slice(e.end);
  output="import {statusLifecycle} from './statusLifecycle';\n"+output;
  const parsed=ts.createSourceFile('actor.ts',output,ts.ScriptTarget.Latest,true);assert.equal(parsed.parseDiagnostics.length,0,'Invalid rendered status Actor');
  const retired=new Set(['noteProcPop','chance','STATUS_RELAY_IDS','WET_STAND_STATUSES','bankFracOf']),counts=new Map();
  const visit=node=>{const propertyName=node.parent&&((ts.isPropertySignature(node.parent)||ts.isPropertyAssignment(node.parent))&&node.parent.name===node||ts.isPropertyAccessExpression(node.parent)&&node.parent.name===node);
    if(ts.isIdentifier(node)&&retired.has(node.text)&&!propertyName)counts.set(node.text,(counts.get(node.text)??0)+1);ts.forEachChild(node,visit);};visit(parsed);
  const imports=[];for(const node of parsed.statements){if(!ts.isImportDeclaration(node))continue;const names=node.importClause?.namedBindings;if(!names||!ts.isNamedImports(names))continue;
    const keep=names.elements.filter(n=>!retired.has(n.name.text)||counts.get(n.name.text)!==1);if(keep.length===names.elements.length)continue;
    if(!keep.length){assert(!node.importClause.name);imports.push({start:node.getStart(parsed),end:node.end,text:''});}
    else imports.push({start:names.getStart(parsed),end:names.end,text:'{ '+keep.map(n=>n.getText(parsed)).join(', ')+' }'});
  }
  for(const e of imports.sort((a,b)=>b.start-a.start))output=output.slice(0,e.start)+e.text+output.slice(e.end);
  return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}
export function renderStatusHelpers(source){
  const input=source.replaceAll('\r\n','\n');assert.equal(sha256(input),boundary.statusSha256,'Unreviewed status definitions/helpers');
  const ast=ts.createSourceFile('status.ts',input,ts.ScriptTarget.Latest,true),edits=[];
  const calls={bankFracOf:'engineBankFracOf(s, def)',statusRuptureRadius:'engineStatusRuptureRadius(s)',tuneAilmentChance:'engineTuneAilmentChance(id, authored, AILMENT_TUNING)',baselineStatusDps:'engineStatusBaselineDps(STATUS_DEFS[id], level)'};
  for(const[name,call]of Object.entries(calls)){const nodes=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.equal(nodes.length,1);assert(nodes[0].body);edits.push({start:nodes[0].body.getStart(ast),end:nodes[0].body.end,text:'{ return '+call+'; }'});}
  let output=input;for(const e of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,e.start)+e.text+output.slice(e.end);
  output="import {bankFracOf as engineBankFracOf,statusRuptureRadius as engineStatusRuptureRadius,tuneAilmentChance as engineTuneAilmentChance,statusBaselineDps as engineStatusBaselineDps} from '@hollow-wake/engine/statuses';\n"+output;
  return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}
export function integrateStatusLifecycle(game,write=true){
  const binding='src/engine/statusLifecycle.ts';assert(!fs.existsSync(path.join(game,binding)),'Status binding already exists');
  const edits=[['src/engine/actor.ts',renderStatusActor],['src/engine/status.ts',renderStatusHelpers]].map(([file,render])=>[file,render(fs.readFileSync(path.join(game,file),'utf8'))]);
  edits.push([binding,fs.readFileSync(path.join(root,'adapters/hollow-wake/statusLifecycle.ts'),'utf8')]);
  if(write)for(const[file,text]of edits)fs.writeFileSync(path.join(game,file),text,{flag:file===binding?'wx':'w'});
  return {files:edits.map(([file])=>file),decision:statusDecision};
}
