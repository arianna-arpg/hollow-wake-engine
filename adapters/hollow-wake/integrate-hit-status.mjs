import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {hitStatusTree} from './hit-status-tree.mjs';
const boundary=JSON.parse(fs.readFileSync(path.join(root,'adapters/hollow-wake/hit-status-boundary.json')));
export const hitStatusDecision='Delegate authored/stat-granted hit statuses, linked curses, next-hit riders and separate Impale phases; preserve live content, callback order and distinct arithmetic';
export function renderHitStatus(source){
  const t=hitStatusTree(source),{input,ast,world,prepare,phases}=t;assert(!/\b(?:engineHitStatuses|bindHitStatuses|hitStatusFrame)\b/.test(input),'Hit/status binding collision');
  for(const[name,node]of Object.entries({...prepare,...phases}))assert.equal(sha256(node.getText(ast)),boundary.fingerprints[name],'Unreviewed hit/status source: '+name);
  const edits=[{start:t.start.getStart(ast),end:t.finish.end,text:'const hitStatusFrame = this.engineHitStatuses.prepare(caster, inst, target, def, extra, packet, dealt, depth, afflictionCarry);\n    const {tags, durScale} = hitStatusFrame;'}];
  const replacements={discharge:'this.engineHitStatuses.dischargeOnHit(caster, target, packet, dealt, depth);',plant:'this.engineHitStatuses.plantImpale(caster, target, def, packet, extra, dealt, depth);',riders:'this.engineHitStatuses.applyRiders(hitStatusFrame);',authored:'{ this.engineHitStatuses.applyAuthored(hitStatusFrame, fx); }',wet:'',granted:'this.engineHitStatuses.applyGranted(hitStatusFrame);'};
  for(const[name,text]of Object.entries(replacements)){const n=phases[name];edits.push({start:n.getStart(ast),end:n.end,text});}
  edits.push({start:world.members.pos,end:world.members.pos,text:'\n  private readonly engineHitStatuses = bindHitStatuses(this, () => STATUS_IDS);\n'});
  const imports=ast.statements.filter(n=>ts.isImportDeclaration(n));assert(imports.length);const last=imports.at(-1);
  // Preserve all existing module registration order. The binding performs no
  // content observation until a World actually resolves a hit.
  edits.push({start:last.end,end:last.end,text:"\nimport {bindHitStatuses} from './hitStatuses';"});
  let output=input;for(const e of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,e.start)+e.text+output.slice(e.end);
  const parsed=ts.createSourceFile('world.ts',output,ts.ScriptTarget.Latest,true);assert.equal(parsed.parseDiagnostics.length,0);
  const retired=new Set(['PROCS','tuneAilmentChance','instanceBrood','buffProcCue']),counts=new Map();
  const visit=n=>{if(ts.isIdentifier(n)&&retired.has(n.text))counts.set(n.text,(counts.get(n.text)??0)+1);ts.forEachChild(n,visit);};visit(parsed);
  const prune=[];for(const n of parsed.statements){if(!ts.isImportDeclaration(n))continue;const names=n.importClause?.namedBindings;if(!names||!ts.isNamedImports(names))continue;const keep=names.elements.filter(e=>!retired.has(e.name.text)||counts.get(e.name.text)!==1);if(keep.length===names.elements.length)continue;
    assert(keep.length,'Retiring an entire import needs an explicit module-order review');prune.push({start:names.getStart(parsed),end:names.end,text:'{ '+keep.map(e=>e.getText(parsed)).join(', ')+' }'});
  }
  for(const e of prune.sort((a,b)=>b.start-a.start))output=output.slice(0,e.start)+e.text+output.slice(e.end);
  return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}
export function integrateHitStatus(game,write=true){
  const target='src/engine/hitStatuses.ts';assert(!fs.existsSync(path.join(game,target)),'Hit/status binding already exists');
  const output=renderHitStatus(fs.readFileSync(path.join(game,'src/engine/world.ts'),'utf8')),binding=fs.readFileSync(path.join(root,'adapters/hollow-wake/hitStatuses.ts'),'utf8');
  if(write){fs.writeFileSync(path.join(game,'src/engine/world.ts'),output);fs.writeFileSync(path.join(game,target),binding,{flag:'wx'});}
  return {files:['src/engine/world.ts',target],decision:hitStatusDecision};
}
