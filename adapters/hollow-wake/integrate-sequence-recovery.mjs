import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
export const sequenceRecoveryFile='src/engine/attackSequences.ts';
export const sequenceRecoveryDecision='Delegate recovery locks, active-cast settlement and release/miss clocks; retain hit cycles, geometry, scheduled execution and projectile delivery';
const accepted=JSON.parse(fs.readFileSync(path.join(root,'baseline/sequence-recovery/acceptance.json'))),bytes=fs.readFileSync(path.join(root,accepted.sourceBoundary.file));assert.equal(sha256(bytes),accepted.sourceBoundary.sha256);const boundary=JSON.parse(bytes);
const reserved=['engineLockSequenceRecovery','engineReleaseSequenceRecovery','engineSettleSequenceRecoveries','EngineSequenceRecoveryPorts','engineSequenceRecoveryPorts'];
export function sequenceRecoveryNodes(source){
  const ast=ts.createSourceFile(sequenceRecoveryFile,source,ts.ScriptTarget.Latest,true);assert.equal(ast.parseDiagnostics.length,0);
  const owners=ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='AttackSequences');assert.equal(owners.length,1);const owner=owners[0];
  const method=name=>{const found=owner.members.filter(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)===name);assert.equal(found.length,1);assert(found[0].body);return found[0];};
  const settlement=method('update').body.statements.filter(n=>ts.isForOfStatement(n)&&n.expression.getText(ast)==='[...this.active]');assert.equal(settlement.length,1);
  const constructors=owner.members.filter(ts.isConstructorDeclaration);assert.equal(constructors.length,1);
  return {ast,constructor:constructors[0],nodes:{lock:method('lock'),release:method('release'),settlement:settlement[0]}};
}
export function renderSequenceRecovery(input){
  const source=input.replaceAll('\r\n','\n'),{ast,constructor,nodes}=sequenceRecoveryNodes(source);
  const scan=node=>{if(ts.isIdentifier(node))assert(!reserved.includes(node.text),'Sequence recovery binding collision');if(node.name){const name=ts.isComputedPropertyName(node.name)?node.name.expression.text:node.name.text;assert(!reserved.includes(name),'Sequence recovery binding collision');}ts.forEachChild(node,scan);};scan(ast);
  for(const[name,node]of Object.entries(nodes))assert.equal(sha256(node.getText(ast)),boundary.blocks[name].sha256,'Unreviewed sequence recovery boundary: '+name);
  const edits=[];const body=(node,text)=>edits.push({start:node.body.getStart(ast),end:node.body.end,text:'{\n    '+text+'\n  }'});
  body(nodes.lock,'engineLockSequenceRecovery(s);');body(nodes.release,'engineReleaseSequenceRecovery(s, miss);');
  edits.push({start:nodes.settlement.getStart(ast),end:nodes.settlement.end,text:'engineSettleSequenceRecoveries(this.active, this.engineSequenceRecoveryPorts);'});
  edits.push({start:constructor.end,end:constructor.end,text:`
  private readonly engineSequenceRecoveryPorts: EngineSequenceRecoveryPorts<SequenceCast> = {
    flying: (cast, s) => this.w.projectiles.some(p => this.casts.get(p.inst) === cast && p.caster === s.owner),
    pending: cast => this.scheduled.some(j => j.inst === cast.inst)
      || this.w.pendingSalvos.some(j => j.inst === cast.inst) || this.w.pendingRepeats.some(j => j.inst === cast.inst)
      || this.w.pendingFuses.some(j => j.inst === cast.inst),
    objects: cast => this.recoveries.filter(r => r.cast === cast),
    clearCatch: s => { s.owner.removeBuff(s.key + ':catch'); },
  };`});
  const imports=ast.statements.filter(ts.isImportDeclaration);assert(imports.length);const offset=imports.at(-1).end;
  edits.push({start:offset,end:offset,text:"\nimport {lockSequenceRecovery as engineLockSequenceRecovery, releaseSequenceRecovery as engineReleaseSequenceRecovery, settleSequenceRecoveries as engineSettleSequenceRecoveries, type SequenceRecoveryPorts as EngineSequenceRecoveryPorts} from '@hollow-wake/engine/combat/sequence-recovery';"});
  edits.sort((a,b)=>b.start-a.start);for(let i=1;i<edits.length;i++)assert(edits[i].end<=edits[i-1].start);
  let output=source;for(const e of edits)output=output.slice(0,e.start)+e.text+output.slice(e.end);
  assert.equal(ts.createSourceFile(sequenceRecoveryFile,output,ts.ScriptTarget.Latest,true).parseDiagnostics.length,0);
  return input.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}
export function integrateSequenceRecovery(game,write=true){const file=path.join(game,sequenceRecoveryFile),output=renderSequenceRecovery(fs.readFileSync(file,'utf8'));if(write)fs.writeFileSync(file,output);return{files:[sequenceRecoveryFile],decision:sequenceRecoveryDecision};}
