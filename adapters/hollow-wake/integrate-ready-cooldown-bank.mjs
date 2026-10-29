import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';

export const readyBankFile='src/engine/assault.ts';
export const readyBankDecision='Delegate ready-only refund credit, whole-unit command spending and numeric bank publication; preserve Assault recipient, formation and lifetime policy';
const acceptance=JSON.parse(fs.readFileSync(path.join(root,'baseline/ready-cooldown-bank/acceptance.json')));
const boundaryBytes=fs.readFileSync(path.join(root,acceptance.sourceBoundary.file));
assert.equal(sha256(boundaryBytes),acceptance.sourceBoundary.sha256);
const boundary=JSON.parse(boundaryBytes);
const reserved=['engineRefundReadyCooldown','engineConsumeReadyCooldownBank','enginePublishReadyCooldownBank','EngineReadyBankPorts','EngineReadyBankPresentation','engineReadyBankPorts','engineReadyBankPresentation'];

export function readyBankNodes(source){
  const ast=ts.createSourceFile(readyBankFile,source,ts.ScriptTarget.Latest,true);assert.equal(ast.parseDiagnostics.length,0);
  const owners=ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='Assaults');assert.equal(owners.length,1);
  const method=name=>{const nodes=owners[0].members.filter(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)===name);assert.equal(nodes.length,1);assert(nodes[0].body);return nodes[0];};
  const statements=[...method('command').body.statements],index=statements.findIndex(n=>ts.isVariableStatement(n)&&n.declarationList.declarations[0].name.getText(ast)==='unit');assert(index>=0);
  return {ast,nodes:{refund:[method('refund')],commandBank:statements.slice(index,index+3),hud:[method('hud')]}};
}

export function renderReadyCooldownBank(input){
  const source=input.replaceAll('\r\n','\n'),{ast,nodes}=readyBankNodes(source);
  const scan=n=>{if(ts.isIdentifier(n))assert(!reserved.includes(n.text),'Ready bank binding collision');
    if(n.name){const name=ts.isComputedPropertyName(n.name)?n.name.expression.text:n.name.text;assert(!reserved.includes(name),'Ready bank binding collision');}ts.forEachChild(n,scan);};scan(ast);
  for(const[name,selected]of Object.entries(nodes))assert.equal(sha256(selected.map(n=>n.getText(ast)).join('\n')),boundary.blocks[name].sha256,'Unreviewed ready bank boundary: '+name);
  const edits=[];
  const body=(node,text)=>edits.push({start:node.body.getStart(ast),end:node.body.end,text:'{\n    '+text+'\n  }'});
  body(nodes.refund[0],'const c = this.court(owner, host);\n    engineRefundReadyCooldown(owner, host, c, amount, engineReadyBankPorts);\n    this.hud(c);');
  body(nodes.hud[0],'enginePublishReadyCooldownBank(c, engineReadyBankPorts, engineReadyBankPresentation);');
  edits.push({start:nodes.commandBank[0].getStart(ast),end:nodes.commandBank.at(-1).end,text:'const extra = engineConsumeReadyCooldownBank(owner, host, c, recall, engineReadyBankPorts);'});
  const imports=ast.statements.filter(ts.isImportDeclaration);assert(imports.length);
  edits.push({start:imports.at(-1).end,end:imports.at(-1).end,text:`
import {refundReadyCooldown as engineRefundReadyCooldown, consumeReadyCooldownBank as engineConsumeReadyCooldownBank, publishReadyCooldownBank as enginePublishReadyCooldownBank, type ReadyCooldownBankPorts as EngineReadyBankPorts, type ReadyCooldownBankPresentation as EngineReadyBankPresentation} from '@hollow-wake/engine/combat/ready-cooldown-bank';
const engineReadyBankPorts: EngineReadyBankPorts<Actor, SkillInstance> = {
  enabled: host => assaultNode(host, 'patient_signal'),
  price: (owner, host) => skillCooldownSeconds(owner, host),
  maxExtra: () => ASSAULT.maxHits - 1,
};
const engineReadyBankPresentation: EngineReadyBankPresentation<Actor> = {
  clear: owner => { owner.assaultHud = undefined; },
  publish: (owner, hits, progress) => { owner.assaultHud = { hits, progress }; },
};`});
  edits.sort((a,b)=>b.start-a.start);for(let i=1;i<edits.length;i++)assert(edits[i].end<=edits[i-1].start);
  let output=source;for(const edit of edits)output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);
  assert.equal(ts.createSourceFile(readyBankFile,output,ts.ScriptTarget.Latest,true).parseDiagnostics.length,0);
  return input.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}

export function integrateReadyCooldownBank(game,write=true){
  const file=path.join(game,readyBankFile),output=renderReadyCooldownBank(fs.readFileSync(file,'utf8'));
  if(write)fs.writeFileSync(file,output);
  return {files:[readyBankFile],decision:readyBankDecision};
}
