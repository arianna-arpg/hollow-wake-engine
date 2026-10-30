import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {hitAftermathTree} from './hit-aftermath-tree.mjs';

const candidate=JSON.parse(fs.readFileSync(path.join(root,'baseline/hit-aftermath/acceptance.json')));
assert.equal(sha256(fs.readFileSync(path.join(root,candidate.sourceBoundary))),candidate.sourceBoundarySha256);
const boundary=JSON.parse(fs.readFileSync(path.join(root,candidate.sourceBoundary)));
const retired=new Set(['WorldProcHitEvent','orbHitChance','orbOnHitStat','spawnVeinOf','SUPPORTBASE_CFG','instanceContagion','CONTAGION_CFG']);
const call='this.engineHitAftermath.apply(caster, inst, target, dmgMult, depth, hitEffects, def, extra, packet, struckTone, afflictionCarry, hasDamage, dealt, wasCrit);';
const parse=source=>ts.createSourceFile('world.ts',source,ts.ScriptTarget.Latest,true);
function count(ast,name){let n=0;const visit=node=>{if(ts.isIdentifier(node)&&node.text===name)n++;ts.forEachChild(node,visit);};visit(ast);return n;}
function applyEdits(source,edits){
 const ordered=edits.sort((a,b)=>a.start-b.start);
 for(let i=1;i<ordered.length;i++)assert(ordered[i-1].end<=ordered[i].start,'Overlapping source edits');
 for(const e of ordered.reverse())source=source.slice(0,e.start)+e.text+source.slice(e.end);
 return source;
}
function removeRetiredImports(source,original){
 const ast=parse(source),edits=[];
 for(const decl of ast.statements.filter(ts.isImportDeclaration)){
  const bindings=decl.importClause?.namedBindings;
  if(!bindings||!ts.isNamedImports(bindings))continue;
  const nodes=[...bindings.elements];
  const removed=nodes.map(n=>retired.has(n.name.text)&&count(original,n.name.text)>1&&count(ast,n.name.text)===1);
  if(!removed.some(Boolean))continue;
  if(removed.every(Boolean)){
   assert(!decl.importClause.name,'Cannot discard a default import');
   edits.push({start:decl.getFullStart(),end:decl.end,text:''});continue;
  }
  for(let i=0;i<nodes.length;i++){
   if(!removed[i])continue;
   const first=i;while(i+1<nodes.length&&removed[i+1])i++;
   const trailing=i===nodes.length-1;
   const start=trailing?nodes[first-1].end:nodes[first].getFullStart();
   const end=trailing?nodes[i].end:nodes[i].end+1;
   if(!trailing)assert.equal(source[nodes[i].end],',','Unreviewed import punctuation');
   edits.push({start,end,text:''});
  }
 }
 return applyEdits(source,edits);
}
export function renderHitAftermath(source,preflight=false){
 const tree=hitAftermathTree(source,preflight),{input,ast,world,method,remainder,tail,inner}=tree;
 assert(!/\b(?:engineHitAftermath|bindHitAftermath)\b/.test(input),'Hit aftermath binding collision');
 assert.equal(sha256(method.getText(ast)),preflight?boundary.originalMethodSha256:boundary.installedMethodSha256,'Unreviewed complete hit continuation');
 if(preflight)return source;
 const imports=ast.statements.filter(ts.isImportDeclaration);
 const prefix=input.slice(method.getStart(ast),inner[2].end);
 let output=applyEdits(input,[
  {start:remainder[0].getFullStart(),end:remainder.at(-1).end,text:''},
  {start:tail[0].getFullStart(),end:tail.at(-1).end,text:'\n    '+call},
  {start:world.members.pos,end:world.members.pos,text:'\n  private readonly engineHitAftermath = bindHitAftermath(this);\n'},
  {start:imports.at(-1).end,end:imports.at(-1).end,text:"\nimport {bindHitAftermath} from './hitAftermath';"},
 ]);
 output=removeRetiredImports(output,ast);
 const parsed=parse(output);assert.equal(parsed.parseDiagnostics.length,0);
 const afterWorld=parsed.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');
 const after=afterWorld.members.find(n=>ts.isMethodDeclaration(n)&&n.name.getText(parsed)==='continueLandedHit');
 assert.equal(after.body.statements.length,2);assert.equal(after.body.statements[1].getText(parsed),call);
 const kept=after.body.statements[0].thenStatement.statements;
 assert.equal(kept.length,3);
 assert.equal(output.slice(after.getStart(parsed),kept[2].end),prefix,'Earlier sustain/reaction phase changed');
 return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}

export const hitAftermathDecision='Delegate the complete remaining damaging phase and common hit continuation over borrowed state through reusable synchronous ports, composing existing status/effect/proc/sequence capabilities and retaining captured outcomes and live callback semantics';
export function integrateHitAftermath(game,write=true){
 const target='src/engine/hitAftermath.ts';assert(!fs.existsSync(path.join(game,target)),'Hit aftermath binding already exists');
 const output=renderHitAftermath(fs.readFileSync(path.join(game,'src/engine/world.ts'),'utf8'),!write),binding=fs.readFileSync(path.join(root,'adapters/hollow-wake/hitAftermath.ts'));
 if(write){fs.writeFileSync(path.join(game,'src/engine/world.ts'),output);fs.writeFileSync(path.join(game,target),binding,{flag:'wx'});}
 return {files:['src/engine/world.ts',target],decision:hitAftermathDecision};
}
