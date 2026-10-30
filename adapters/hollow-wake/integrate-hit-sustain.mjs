import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';import {hitSustainTree} from './hit-sustain-tree.mjs';
const boundary=JSON.parse(fs.readFileSync(path.join(root,'adapters/hollow-wake/hit-sustain-boundary.json')));
export const hitSustainDecision='Delegate original siphon, sharing, life bonds and tree storage over borrowed state while preserving separate live traversals, captured hit damage, callback order and native aftermath';
export function renderHitSustain(source,preflight=false){
 const t=hitSustainTree(source,preflight),{input,ast,world,hit,sustain,prefix,suffix,imports}=t;
 assert(!/\b(?:engineHitSustain|bindHitSustain)\b/.test(input),'Hit sustain binding collision');
 const expected=preflight?boundary.original:boundary.installed;
 assert.equal(sha256(prefix),expected.prefixSha256,'Unreviewed sustain prefix');assert.equal(sha256(suffix),expected.suffixSha256,'Unreviewed sustain continuation');
 for(let i=0;i<3;i++)assert.equal(sha256(sustain[i].getText(ast)),boundary.statements[i],'Unreviewed sustain statement '+i);
 if(preflight)return source;
 const edits=[
  {start:sustain[0].getFullStart(),end:sustain[2].end,text:'\n      this.engineHitSustain.apply(caster, target, def, extra, dealt, depth);'},
  {start:world.members.pos,end:world.members.pos,text:'\n  private readonly engineHitSustain = bindHitSustain(this);\n'},
  {start:imports.at(-1).end,end:imports.at(-1).end,text:"\nimport {bindHitSustain} from './hitSustain';"},
 ];
 let output=input;for(const e of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,e.start)+e.text+output.slice(e.end);
 const parsed=ts.createSourceFile('world.ts',output,ts.ScriptTarget.Latest,true);assert.equal(parsed.parseDiagnostics.length,0);
 const method=parsed.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World').members.find(n=>n.name?.text==='continueLandedHit');
 const calls=method.body.statements[0].thenStatement.statements;assert.equal(calls[1].getText(parsed),'this.engineHitSustain.apply(caster, target, def, extra, dealt, depth);');
 assert.equal(output.slice(method.getStart(parsed),calls[1].getFullStart()),prefix,'Sustain prefix changed');assert.equal(output.slice(calls[1].end,method.end),suffix,'Sustain continuation changed');
 return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}
export function integrateHitSustain(game,write=true){
 const target='src/engine/hitSustain.ts';assert(!fs.existsSync(path.join(game,target)),'Hit sustain binding already exists');
 const output=renderHitSustain(fs.readFileSync(path.join(game,'src/engine/world.ts'),'utf8'),!write),binding=fs.readFileSync(path.join(root,'adapters/hollow-wake/hitSustain.ts'));
 if(write){fs.writeFileSync(path.join(game,'src/engine/world.ts'),output);fs.writeFileSync(path.join(game,target),binding,{flag:'wx'});}
 return {files:['src/engine/world.ts',target],decision:hitSustainDecision};
}
