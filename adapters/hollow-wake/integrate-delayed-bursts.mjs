import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
export const delayedPaths={world:'src/engine/world.ts',binding:'src/engine/delayedBurstAdapter.ts'};
const contract=JSON.parse(fs.readFileSync(path.join(root,'baseline/milestone-forty/adapter-contract.json'))),lf=s=>s.replaceAll('\r\n','\n');
const name=n=>n.name&&(ts.isComputedPropertyName(n.name)?ts.isStringLiteral(n.name.expression)?n.name.expression.text:undefined:n.name.text);
export function delayedTree(source){
 const ast=ts.createSourceFile(delayedPaths.world,source,ts.ScriptTarget.Latest,true);assert.equal(ast.parseDiagnostics.length,0,'Invalid delayed source');
 const owners=ast.statements.filter(n=>ts.isClassDeclaration(n)&&name(n)==='World');assert.equal(owners.length,1,'Ambiguous delayed World');const owner=owners[0],members={};
 for(const key of Object.keys(contract.members)){const found=owner.members.filter(n=>name(n)===key);assert.equal(found.length,1,'Ambiguous delayed member: '+key);const n=found[0];assert(key==='pendingBursts'?ts.isPropertyDeclaration(n):ts.isMethodDeclaration(n)&&n.body,'Invalid delayed member: '+key);members[key]=n;}
 const switches=members.executeProc.body.statements.filter(ts.isSwitchStatement);assert.equal(switches.length,1,'Unreviewed delayed dispatch');const dispatch=switches[0];assert.equal(dispatch.expression.getText(ast),'fx.type','Unreviewed delayed discriminator');
 const cases=dispatch.caseBlock.clauses;assert.equal(cases.length,22,'Unreviewed delayed case count');assert(cases.every(c=>ts.isCaseClause(c)&&ts.isStringLiteral(c.expression)),'Unreviewed delayed case shape');const delayed=cases.filter(c=>c.expression.text==='delayedBurst');assert.equal(delayed.length,1,'Ambiguous delayed case');
 const resets=[];const scan=n=>{if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.EqualsToken&&n.left.getText(ast)==='this.pendingBursts')resets.push(n);ts.forEachChild(n,scan);};scan(members.loadZone);assert.equal(resets.length,1,'Ambiguous delayed reset');
 return {ast,owner,members,dispatch,cases,schedule:delayed[0],reset:resets[0]};
}
export function renderDelayedSource(source){
 const input=lf(source),tree=delayedTree(input),{ast,owner,members,cases,schedule,reset}=tree;
 const accesses={};const scan=(n,member=null)=>{
  if(owner.members.includes(n))member=name(n)??'<unnamed>';
  if(ts.isIdentifier(n))assert(!contract.reservedNames.includes(n.text),'Delayed binding collision: '+n.text);
  if(n.name)assert(!contract.reservedNames.includes(name(n)),'Delayed binding collision: '+name(n));
  if((ts.isIdentifier(n)||ts.isStringLiteral(n))&&n.text==='pendingBursts')accesses[member??'<outside>']=(accesses[member??'<outside>']??0)+1;
  ts.forEachChild(n,child=>scan(child,member));
 };scan(ast);assert.deepEqual(accesses,contract.queueAccesses,'Unreviewed delayed queue access');
 for(const [key,node]of Object.entries(members))assert.equal(sha256(node.getText(ast)),contract.members[key],'Unreviewed delayed member: '+key);
 for(const c of cases)assert.equal(sha256(c.getText(ast)),contract.caseHashes[c.expression.text],'Unreviewed delayed case: '+c.expression.text);
 assert.equal(sha256(reset.getText(ast)),contract.resetSha256,'Unreviewed delayed reset');
 const statements=members.update.body.statements,phase=statements.findIndex(s=>s.getText(ast)==='this.updatePendingBursts();');assert(phase>=2,'Unreviewed delayed frame phase');
 assert.equal(statements.slice(phase-2,phase+3).map(s=>s.getText(ast)).join('\n'),contract.frameText,'Unreviewed delayed frame adjacency');
 const lastImport=ast.statements.filter(ts.isImportDeclaration).at(-1);assert(lastImport,'Missing delayed imports');
 const edits=[
  {start:lastImport.end,end:lastImport.end,text:'\n'+contract.imports.join('\n')},
  {start:members.pendingBursts.end,end:members.pendingBursts.end,text:'\n  private readonly delayedBurstEngine = new EngineDelayedBursts<World, Actor, Actor, DamageType>(delayedBurstPorts);'},
  {start:schedule.getStart(ast),end:schedule.end,text:"case 'delayedBurst': {\n        this.delayedBurstEngine.schedule(this, caster, fx, proc.color, depth, target);\n        break;\n      }"},
  {start:members.updatePendingBursts.body.getStart(ast),end:members.updatePendingBursts.body.end,text:'{ this.delayedBurstEngine.advance(this); }'},
  {start:reset.getStart(ast),end:reset.end,text:'this.delayedBurstEngine.reset(this)'},
 ].sort((a,b)=>b.start-a.start);
 for(let i=1;i<edits.length;i++)assert(edits[i].end<=edits[i-1].start,'Overlapping delayed edits');
 let output=input;for(const e of edits)output=output.slice(0,e.start)+e.text+output.slice(e.end);
 assert.equal(ts.createSourceFile(delayedPaths.world,output,ts.ScriptTarget.Latest,true).parseDiagnostics.length,0,'Invalid delayed output');return output;
}
/** Validate all source boundaries and the absent binding before writing either file. */
export function integrateDelayedBursts(game,write=true){
 const binding=path.join(game,delayedPaths.binding);assert(!fs.existsSync(binding),'Delayed binding already exists');
 const source=fs.readFileSync(path.join(game,delayedPaths.world),'utf8'),output=renderDelayedSource(source).replaceAll('\n',source.includes('\r\n')?'\r\n':'\n');
 const bindingSource=fs.readFileSync(path.join(root,'adapters/hollow-wake/delayedBurstAdapter.ts'),'utf8');
 if(write){fs.writeFileSync(path.join(game,delayedPaths.world),output);fs.writeFileSync(binding,bindingSource);}
 return {files:Object.values(delayedPaths),decision:contract.decision};
}
