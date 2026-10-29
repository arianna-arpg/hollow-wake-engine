import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {hitEffectsTree} from './hit-effects-tree.mjs';
const boundary=JSON.parse(fs.readFileSync(path.join(root,'adapters/hollow-wake/hit-effects-boundary.json')));
export const hitEffectsDecision='Delegate sixteen ordered hit-effect branches through borrowed frames and explicit spatial/verb ports; preserve hook placement, live versus merged lists, record identity and partial writes';
export function renderHitEffects(source){
  const t=hitEffectsTree(source),{input,ast,world,phases}=t;
  assert(!/\b(?:engineHitEffects|bindHitEffects)\b/.test(input),'Hit effects binding collision');
  for(const[name,node]of Object.entries(phases))assert.equal(sha256(node.getText(ast)),boundary.fingerprints[name],'Unreviewed hit effects source: '+name);
  for(const[name,node]of Object.entries(t.branches))assert.equal(sha256(node.getText(ast)),boundary.branches[name],'Unreviewed hit effect branch: '+name);
  const imports=ast.statements.filter(n=>ts.isImportDeclaration(n));assert(imports.length);
  const edits=[
    {start:phases.effects.getStart(ast),end:phases.loop.end,text:'this.engineHitEffects.dispatch(hitStatusFrame, dmgMult, hitEffects);'},
    {start:phases.context.getStart(ast),end:phases.context.end,text:'const {tags} = hitStatusFrame;'},
    {start:world.members.pos,end:world.members.pos,text:'\n  private readonly engineHitEffects = bindHitEffects(this);\n'},
    {start:imports.at(-1).end,end:imports.at(-1).end,text:"\nimport {bindHitEffects} from './hitEffects';"},
  ];
  let output=input;for(const e of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,e.start)+e.text+output.slice(e.end);
  assert.equal(ts.createSourceFile('world.ts',output,ts.ScriptTarget.Latest,true).parseDiagnostics.length,0);
  return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}
export function integrateHitEffects(game,write=true){
  const target='src/engine/hitEffects.ts';assert(!fs.existsSync(path.join(game,target)),'Hit effects binding already exists');
  const output=renderHitEffects(fs.readFileSync(path.join(game,'src/engine/world.ts'),'utf8'));
  const binding=fs.readFileSync(path.join(root,'adapters/hollow-wake/hitEffects.ts'),'utf8');
  if(write){fs.writeFileSync(path.join(game,'src/engine/world.ts'),output);fs.writeFileSync(path.join(game,target),binding,{flag:'wx'});}
  return {files:['src/engine/world.ts',target],decision:hitEffectsDecision};
}
