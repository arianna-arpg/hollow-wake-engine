import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
export const procPaths={world:'src/engine/world.ts',binding:'src/engine/procAdapter.ts'};
const contract=JSON.parse(fs.readFileSync(path.join(root,'baseline/milestone-thirty-eight/adapter-contract.json'))),lf=s=>s.replaceAll('\r\n','\n');
export function procWorldTree(source){
  const ast=ts.createSourceFile(procPaths.world,source,ts.ScriptTarget.Latest,true);assert.equal(ast.parseDiagnostics.length,0,'Invalid proc World source');
  const worlds=ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');assert.equal(worlds.length,1,'Ambiguous proc World');return {ast,world:worlds[0]};
}
export function procBoundary(tree){
  const {ast,world}=tree;
  const method=name=>{const nodes=world.members.filter(n=>n.name?.getText(ast)===name);assert.equal(nodes.length,1,'Ambiguous proc method: '+name);assert(ts.isMethodDeclaration(nodes[0]));return nodes[0];};
  const methods=Object.fromEntries(contract.sourceBoundary.methods.map(r=>[r.name,method(r.name)]));
  const resolve=method('resolveHit'),talent=method('sweepTalentEvents');
  const select=expression=>{const nodes=resolve.body.statements.filter(n=>ts.isIfStatement(n)&&n.expression.getText(ast)===expression);assert.equal(nodes.length,1,'Unreviewed proc hit phase: '+expression);return nodes[0];};
  const hit=select('dealt > 0 && depth < this.procDepthAllowed(caster)'),outer=select('dealt > 0 && caster.owner && !caster.owner.dead');
  assert(ts.isBlock(outer.thenStatement),'Unreviewed carry block');const inner=outer.thenStatement.statements[2];
  assert(inner&&ts.isIfStatement(inner)&&ts.isBlock(inner.thenStatement),'Unreviewed carry admission');
  const phases={talent:talent.body.statements.slice(0,6),hit:[hit],carryOuter:[outer.expression],carryResolution:outer.thenStatement.statements.slice(0,2),carryAdmission:[inner.expression],carry:inner.thenStatement.statements.slice(0,5)};
  const globals=Object.fromEntries(contract.sourceBoundary.globals.map(({name})=>{const nodes=ast.statements.filter(n=>n.name?.getText(ast)===name||ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)===name));assert.equal(nodes.length,1,'Ambiguous proc global: '+name);return[name,nodes[0]];}));
  return {methods,phases,globals,resolve,talent,hit,outer,inner};
}
const delegates={
  rollCollisionProcs:'this.sdkProcs.collision(caster, inst, target)',
  rollStatusProcs:'this.sdkProcs.status(caster, inst, target, statusId, tags, extra, depth)',
  procReady:'this.sdkProcs.ready(owner, proc)',procGates:'this.sdkProcs.gates(owner, proc, inst)',
  procDepthAllowed:'this.sdkProcs.depthAllowed(owner)',rollTopMet:'this.sdkProcs.rollTop(owner, frac, rollT, tags, extra)',
  procChance:'this.sdkProcs.baseChance(owner, proc, depth, tags, extra)',rollGainProcs:'this.sdkProcs.gain(owner, ev)',
  rollOwnProcs:'this.sdkProcs.own(owner, trigger, opts)',fireProcRiders:'this.sdkProcs.riders(proc, caster, inst, target, depth)',
  rollSurfaceProcs:'this.sdkProcs.surface(striker)',
};
const packetEvent=`{dealt, depth, crit: wasCrit, lethal, elite,
      get dominantType() { return dominantTypeOf(packet.amounts); },
      get rollT() { return packet.rollT; }, tags, extra}`;
export function renderProcWorld(source){
  const input=lf(source);assert(!/\b(?:WorldProcs|sdkProcs|_sdkProcs)\b/.test(input),'Procs already integrated or binding collision');
  const tree=procWorldTree(input),boundary=procBoundary(tree),{ast,world}=tree;
  for(const kind of ['methods','globals','phases'])for(const row of contract.sourceBoundary[kind]){
    const value=boundary[kind][row.name],nodes=Array.isArray(value)?value:[value];assert.equal(nodes.length,row.nodes,'Unreviewed proc node count: '+row.name);
    assert.equal(sha256(nodes.map(n=>n.getText(ast)).join('\n')),row.sha256,'Unreviewed proc boundary: '+row.name);
  }
  const edits=[];
  for(const [name,call]of Object.entries(delegates)){
    const m=boundary.methods[name];edits.push({start:m.body.getStart(ast),end:m.body.end,text:'{ return '+call+'; }'});
    // These former private queries remain available to the original rule probes.
    // Production selection moved to the SDK, so unused-private checking now applies.
    if(['procReady','procGates','procDepthAllowed'].includes(name)){
      const modifier=m.modifiers.find(n=>n.kind===ts.SyntaxKind.PrivateKeyword);assert(modifier);
      edits.push({start:modifier.getStart(ast),end:modifier.end,text:'/** @internal Original rule observation seam. */'});
    }
  }
  const phase=boundary.phases.talent;edits.push({start:phase[0].getStart(ast),end:phase.at(-1).end,text:'if (!this.sdkProcs.talents(a)) return;'});
  edits.push({start:boundary.hit.getStart(ast),end:boundary.hit.end,text:'this.sdkProcs.hit(caster, inst, target, '+packetEvent+');'});
  edits.push({start:boundary.inner.expression.getStart(ast),end:boundary.inner.expression.end,text:'carryInst && this.sdkProcs.carry(owner, carryInst, target, '+packetEvent+')'});
  const carry=boundary.phases.carry;edits.push({start:carry[0].getFullStart(),end:carry.at(-1).end,text:''});
  for(const node of Object.values(boundary.globals))edits.push({start:node.getFullStart(),end:node.end,text:''});
  const ports=lf(fs.readFileSync(path.join(root,'adapters/hollow-wake/proc-ports.txt'),'utf8')).trimEnd();
  edits.push({start:world.members[0].getStart(ast),end:world.members[0].getStart(ast),text:ports+'\n\n  '});
  const lastImport=ast.statements.filter(ts.isImportDeclaration).at(-1);assert(lastImport);
  edits.push({start:lastImport.end,end:lastImport.end,text:"\nimport {WorldProcs} from './procAdapter';"});
  let output=input;const ordered=edits.sort((a,b)=>b.start-a.start);
  for(let i=1;i<ordered.length;i++)assert(ordered[i].end<=ordered[i-1].start,'Overlapping proc edits');
  for(const edit of ordered)output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);
  const parsed=procWorldTree(output).ast,imports=[],used=new Set();
  const scan=node=>{if(ts.isImportDeclaration(node)){imports.push(node);return;}if(ts.isIdentifier(node))used.add(node.text);ts.forEachChild(node,scan);};scan(parsed);
  assert(!used.has('procIndex')&&!used.has('PROC_INDEX'),'Unreviewed proc registry caller');
  const moved=new Set(['PROC_LIST','PROCS','PROC_RIDER_LIST','procRiderStat','procStat']),removals=[];
  for(const node of imports){const names=node.importClause?.namedBindings;if(!names||!ts.isNamedImports(names))continue;const keep=names.elements.filter(n=>!moved.has(n.name.text)||used.has(n.name.text));
    if(keep.length!==names.elements.length){assert(keep.length,'Proc import unexpectedly empty');removals.push({start:names.getStart(parsed),end:names.end,text:'{ '+keep.map(n=>n.getText(parsed)).join(', ')+' }'});}}
  for(const edit of removals.sort((a,b)=>b.start-a.start))output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);
  procWorldTree(output);return output;
}
/** All owned source and collision checks complete before either file is written. */
export function integrateProcs(game,write=true){
  const file=path.join(game,procPaths.world),source=fs.readFileSync(file,'utf8'),world=renderProcWorld(source).replaceAll('\n',source.includes('\r\n')?'\r\n':'\n');
  const target=path.join(game,procPaths.binding);assert(!fs.existsSync(target),'Proc binding already exists');
  const binding=fs.readFileSync(path.join(root,'adapters/hollow-wake/procAdapter.ts'),'utf8');
  if(write){fs.writeFileSync(file,world);fs.writeFileSync(target,binding);}return {files:Object.values(procPaths),decision:contract.decision};
}
