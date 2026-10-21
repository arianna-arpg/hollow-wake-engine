import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
const file='src/engine/inventory.ts',lf=s=>s.replaceAll('\r\n','\n');
export function renderInventoryHost(source,reference){
 assert.equal(lf(source),lf(reference),'Unreviewed inventory helper changes');
 const text=lf(source),ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true),edits=[];
 const replacements={
  placed:'',overlapsRect:'',
  footprintOpen:`export function footprintOpen(board: BoardDims, x: number, y: number, w: number, h: number): boolean {
  return inventoryHost.footprintOpen(board, x, y, w, h);
}`,
  bagItemAt:`export function bagItemAt(bag: readonly ItemInstance[], x: number, y: number): ItemInstance | undefined {
  return inventoryHost.itemAt(bag, x, y);
}`,
  overlappingItems:`export function overlappingItems(bag: readonly ItemInstance[], item: ItemInstance, x: number, y: number): ItemInstance[] {
  return inventoryHost.overlapping(bag, item, x, y);
}`,
  canPlaceAt:`export function canPlaceAt(bag: readonly ItemInstance[], item: ItemInstance, x: number, y: number, board?: BoardDims): boolean {
  return inventoryHost.canPlace(bag, item, x, y, board ?? bagBoard());
}`,
  swapBlockerFits:`export function swapBlockerFits(bag: readonly ItemInstance[], item: ItemInstance, x: number, y: number, board?: BoardDims): ItemInstance | null {
  return inventoryHost.swapBlocker(bag, item, x, y, board ?? bagBoard());
}`,
  placeAt:`export function placeAt(bag: ItemInstance[], item: ItemInstance, x: number, y: number, board?: BoardDims): boolean {
  return inventoryHost.place(bag, item, x, y, board ?? bagBoard());
}`,
  autoPlace:`export function autoPlace(bag: ItemInstance[], item: ItemInstance, board?: BoardDims): boolean {
  return inventoryHost.autoPlace(bag, item, board ?? bagBoard());
}`,
  removeFromBag:`export function removeFromBag(bag: ItemInstance[], uid: number): ItemInstance | undefined {
  return inventoryHost.remove(bag, uid);
}`,
 };
 for(const [name,replacement] of Object.entries(replacements)){
  const nodes=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.equal(nodes.length,1,`Inventory function changed: ${name}`);
  edits.push({start:nodes[0].getStart(ast),end:nodes[0].end,text:replacement});
 }
 const imports=ast.statements.filter(ts.isImportDeclaration),end=imports.at(-1).end;
 edits.push({start:end,end,text:"\nimport { InventoryHost } from '@hollow-wake/engine/inventory/host';\nconst inventoryHost = new InventoryHost<ItemInstance>(itemGridSize);"});
 let out=text;for(const e of edits.sort((a,b)=>b.start-a.start))out=out.slice(0,e.start)+e.text+out.slice(e.end);
 return out;
}
export function integrateInventoryHost(game,write=true){
 const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),reference=fs.readFileSync(path.join(root,'.reference',file));assert.equal(sha256(reference),lock.files[file]);
 const current=fs.readFileSync(path.join(game,file),'utf8'),result=renderInventoryHost(current,reference.toString());
 if(write)fs.writeFileSync(path.join(game,file),result.replaceAll('\n',current.includes('\r\n')?'\r\n':'\n'));
 return {files:[file]};
}
