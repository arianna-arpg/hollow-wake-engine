import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
const file='src/engine/stash.ts',lf=s=>s.replaceAll('\r\n','\n');
export function renderStash(source,reference){
 assert.equal(lf(source),lf(reference),'Unreviewed storage helper changes');
 const text=lf(source),ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true),edits=[];
 const replacements={
  emptyStash:'export const emptyStash = (def: StashDef): StashState => stashPolicy.empty(def);',
  stashPageCost:'export const stashPageCost = (def: StashDef, s: StashState): number => stashPolicy.pageCost(def, s);',
  validCell:'',copyCell:'',
  stashPage:`export function stashPage(entries: readonly StashEntry[], s: StashState, page: number): ItemInstance[] {
  return stashPolicy.page(entries, s, page);
}`,
  stashOverflow:'export const stashOverflow = (entries: readonly StashEntry[], s: StashState): StashEntry[] => stashPolicy.overflow(entries, s);',
  restoreStash:`export function restoreStash(def: StashDef, entries: readonly StashEntry[], value?: StashState): StashState {
  return stashPolicy.restore(def, entries, value);
}`,
  firstStashFit:`export function firstStashFit(def: StashDef, entries: readonly StashEntry[], s: StashState, item: ItemInstance): StashCell | undefined {
  return stashPolicy.firstFit(def, entries, s, item);
}`,
  planStashMove:`export function planStashMove(def: StashDef, entries: readonly StashEntry[], s: StashState,
  entry: StashEntry, target?: StashCell, vacate?: string): StashState | undefined {
  return stashPolicy.plan(def, entries, s, entry, target, vacate);
}`,
 };
 for(const [name,replacement] of Object.entries(replacements)){
  const nodes=ast.statements.filter(n=>(ts.isFunctionDeclaration(n)&&n.name?.text===name)||(ts.isVariableStatement(n)&&n.declarationList.declarations.length===1&&n.declarationList.declarations[0].name.getText(ast)===name));
  assert.equal(nodes.length,1,`Storage declaration changed: ${name}`);edits.push({start:nodes[0].getStart(ast),end:nodes[0].end,text:replacement});
 }
 const imports=ast.statements.filter(n=>ts.isImportDeclaration(n)&&n.moduleSpecifier.text==='./inventory');assert.equal(imports.length,1);
 edits.push({start:imports[0].getStart(ast),end:imports[0].end,text:"import type { BoardDims } from './inventory';\nimport { itemGridSize } from './itemgen';\nimport { StashPolicy } from '@hollow-wake/engine/inventory/stash';\nconst stashPolicy = new StashPolicy<ItemInstance>(itemGridSize);"});
 let out=text;for(const e of edits.sort((a,b)=>b.start-a.start))out=out.slice(0,e.start)+e.text+out.slice(e.end);
 return out;
}
export function integrateStash(game,write=true){
 const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),reference=fs.readFileSync(path.join(root,'.reference',file));assert.equal(sha256(reference),lock.files[file]);
 const current=fs.readFileSync(path.join(game,file),'utf8'),result=renderStash(current,reference.toString());
 if(write)fs.writeFileSync(path.join(game,file),result.replaceAll('\n',current.includes('\r\n')?'\r\n':'\n'));
 return {files:[file]};
}
