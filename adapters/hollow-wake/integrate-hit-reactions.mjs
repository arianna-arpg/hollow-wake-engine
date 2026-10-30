import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';import {hitReactionsTree} from './hit-reactions-tree.mjs';
const boundary=JSON.parse(fs.readFileSync(path.join(root,'adapters/hollow-wake/hit-reactions-boundary.json')));
export const hitReactionsDecision='Delegate the complete landed-contact reaction phase over borrowed state, preserving live clock/content/iterator reads, captured damage and critical admission, synchronous host callbacks and native continuation';
export function renderHitReactions(source,preflight=false){
 const {input,ast,world,reactions,prefix,suffix,imports}=hitReactionsTree(source,preflight);
 assert(!/\b(?:engineHitReactions|bindHitReactions)\b/.test(input),'Hit reactions binding collision');
 const expected=preflight?boundary.original:boundary.installed;
 assert.equal(sha256(prefix),expected.prefixSha256,'Unreviewed reactions prefix');assert.equal(sha256(suffix),expected.suffixSha256,'Unreviewed reactions continuation');
 for(let i=0;i<29;i++)assert.equal(sha256(reactions[i].getText(ast)),boundary.statements[i],'Unreviewed reactions statement '+i);
 if(preflight)return source;
 const call='this.engineHitReactions.apply(caster, inst, target, def, extra, packet, dealt, depth, wasCrit, result, hitOrigin, hitTier);';
 const edits=[
  {start:reactions[0].getFullStart(),end:reactions.at(-1).end,text:'\n      '+call},
  {start:world.members.pos,end:world.members.pos,text:'\n  private readonly engineHitReactions = bindHitReactions(this, isStealthed, LOW_LIFE_FLASH_SEC);\n'},
  {start:imports.at(-1).end,end:imports.at(-1).end,text:"\nimport {bindHitReactions} from './hitReactions';"},
 ];
 // This stat-name import loses its only use when the phase moves to the binding.
 // Keep it if another native phase uses it; never remove unrelated import text.
 let uses=0;const visit=n=>{if(ts.isIdentifier(n)&&n.text==='orbOnHurtStat')uses++;ts.forEachChild(n,visit);};visit(ast);
 if(uses===2){const specifiers=imports.flatMap(n=>n.importClause?.namedBindings&&ts.isNamedImports(n.importClause.namedBindings)?[...n.importClause.namedBindings.elements]:[]);const found=specifiers.filter(n=>n.name.text==='orbOnHurtStat');assert.equal(found.length,1);const node=found[0];assert.equal(input[node.end],',');edits.push({start:node.getFullStart(),end:node.end+1,text:''});}
 let output=input;for(const e of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,e.start)+e.text+output.slice(e.end);
 const parsed=ts.createSourceFile('world.ts',output,ts.ScriptTarget.Latest,true);assert.equal(parsed.parseDiagnostics.length,0);
 const method=parsed.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World').members.find(n=>n.name?.text==='continueLandedHit');
 const statements=method.body.statements[0].thenStatement.statements;assert.equal(statements[2].getText(parsed),call);
 assert.equal(output.slice(method.getStart(parsed),statements[2].getFullStart()),prefix,'Reactions prefix changed');assert.equal(output.slice(statements[2].end,method.end),suffix,'Reactions continuation changed');
 return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}
export function integrateHitReactions(game,write=true){
 const target='src/engine/hitReactions.ts';assert(!fs.existsSync(path.join(game,target)),'Hit reactions binding already exists');
 const output=renderHitReactions(fs.readFileSync(path.join(game,'src/engine/world.ts'),'utf8'),!write),binding=fs.readFileSync(path.join(root,'adapters/hollow-wake/hitReactions.ts'));
 if(write){fs.writeFileSync(path.join(game,'src/engine/world.ts'),output);fs.writeFileSync(path.join(game,target),binding,{flag:'wx'});}
 return {files:['src/engine/world.ts',target],decision:hitReactionsDecision};
}
