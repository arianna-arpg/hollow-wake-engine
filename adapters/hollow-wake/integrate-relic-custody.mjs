import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
export const relicCustodyFiles=['src/engine/accountReliquary.ts','src/meta/reliquary.ts'];
export const relicRuntimeFile='src/engine/accountRelicRuntime.ts';
const lf=s=>s.replaceAll('\r\n','\n');
export const relicRuntimeSource=`// Host bindings only. Canonical custody and migration rules live in the SDK.
import { RelicCustody } from '@hollow-wake/engine/inventory/relics';
import type { ItemInstance } from './items';
import { ITEM_BASES } from '../data/itembases';
import { RELIC_STASH } from '../data/stashes';
import { RELIQUARY_CFG } from '../data/reliquary';
import { nextItemUid, bumpItemUidFloor, itemGridSize } from './itemgen';
import { bagBoard } from './inventory';
export const sdkRelics = new RelicCustody<ItemInstance>({
  isRelic: item => ITEM_BASES[item.baseId]?.category === 'relic',
  footprint: itemGridSize, nextUid: nextItemUid, bumpUidFloor: bumpItemUidFloor,
  cloneItems: items => structuredClone([...items]),
  stash: () => RELIC_STASH, bagBoard, progression: () => RELIQUARY_CFG,
});
`;
function transform(file,source,replacements,imports,extra){
 const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true),edits=[];
 for(const [name,text] of Object.entries(replacements)){
  const nodes=ast.statements.filter(n=>(ts.isFunctionDeclaration(n)&&n.name?.text===name)||(ts.isVariableStatement(n)&&n.declarationList.declarations.length===1&&n.declarationList.declarations[0].name.getText(ast)===name));
  assert.equal(nodes.length,1,`Custody declaration changed: ${file}:${name}`);edits.push({start:nodes[0].getStart(ast),end:nodes[0].end,text});
 }
 for(const [from,text] of Object.entries(imports)){const nodes=ast.statements.filter(n=>ts.isImportDeclaration(n)&&n.moduleSpecifier.text===from);assert.equal(nodes.length,from==='./itemgen'?2:1);for(const [i,node] of nodes.entries())edits.push({start:node.getStart(ast),end:node.end,text:i===0?text:''});}
 const end=ast.statements.filter(ts.isImportDeclaration).at(-1).end;edits.push({start:end,end,text:'\n'+extra});
 let out=source;for(const e of edits.sort((a,b)=>b.start-a.start))out=out.slice(0,e.start)+e.text+out.slice(e.end);return out;
}
export function renderRelicCustody(sources,references){
 for(const file of relicCustodyFiles)assert.equal(lf(sources[file]),lf(references[file]),`Unreviewed relic custody source: ${file}`);
 return {
  [relicCustodyFiles[0]]:transform(relicCustodyFiles[0],lf(sources[relicCustodyFiles[0]]),{
   relicReserve:'export const relicReserve = (a: Account) => sdkRelics.reserve(a.reliquary);',
   reconcileRelicStash:'export function reconcileRelicStash(a: Account): void { sdkRelics.reconcile(a.reliquary); }',
   planRelicStorage:'export function planRelicStorage(a: Account, item: ItemInstance, target?: StashCell, vacate?: string): StashState | undefined { return sdkRelics.planStorage(a.reliquary, item, target, vacate); }',
   reliquaryExperience:'export function reliquaryExperience(items: readonly ItemInstance[], enabled = true): number { return sdkRelics.experience(items, enabled); }',
   bankRelic:'export function bankRelic(a: Account, item: ItemInstance, scope: string): ItemInstance | undefined { return sdkRelics.bank(a.reliquary, item, scope); }',
   accountRelicBoard:'export function accountRelicBoard(a: Account): ItemInstance[] { return sdkRelics.board(a.reliquary); }',
   loseCarriedRelics:'export function loseCarriedRelics(a: Account, bag: readonly ItemInstance[], scope: string): number { return sdkRelics.loseCarried(a.reliquary, bag, scope); }',
   migrateRelicCorpses:'export function migrateRelicCorpses(a: Account, deaths: DeathRecord[]): void { sdkRelics.migrateCorpses(a.reliquary, deaths); }',
   migrateRelicCarry:'export function migrateRelicCarry(a: Account, carry: CarrySlice & { items: ItemInstance[] }, scope: string, legacy = true): void { sdkRelics.migrateCarry(a.reliquary, carry, scope, legacy); }',
  },{'./itemgen':'','../data/stashes':'','./stash':"import type { StashCell, StashState } from './stash';",'./inventory':'','../data/reliquary':''},"import { sdkRelics } from './accountRelicRuntime';"),
  [relicCustodyFiles[1]]:transform(relicCustodyFiles[1],lf(sources[relicCustodyFiles[1]]),{
   emptyReliquary:'export function emptyReliquary(): AccountReliquary { return sdkRelics.empty(); }',
   restoreReliquary:'export function restoreReliquary(value?: AccountReliquary): AccountReliquary { return sdkRelics.restore(value); }',
   investRelicStash:"export function investRelicStash(a: Account, amount = a.credits): number { return sdkRelics.investStorage(a.reliquary, a, a.features.has('reliquary'), amount); }",
   reliquaryCost:'export function reliquaryCost(r: AccountReliquary): number { return sdkRelics.cost(r); }',
   reliquaryPower:'export function reliquaryPower(r: AccountReliquary): number { return sdkRelics.power(r); }',
   investReliquary:'export function investReliquary(a: Account, amount = a.credits): number { return sdkRelics.investPower(a.reliquary, a, !!a.ledger[RELIQUARY_CFG.attunement], amount); }',
  },{'../data/stashes':'','../engine/stash':"import type { StashState } from '../engine/stash';",'../engine/itemgen':''},"import { sdkRelics } from '../engine/accountRelicRuntime';"),
 };
}
export function integrateRelicCustody(game,write=true){
 const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),sources={},references={};
 assert(!fs.existsSync(path.join(game,relicRuntimeFile)),'Refusing to overwrite an existing relic host binding');
 for(const file of relicCustodyFiles){const bytes=fs.readFileSync(path.join(root,'.reference',file));assert.equal(sha256(bytes),lock.files[file]);references[file]=bytes.toString();sources[file]=fs.readFileSync(path.join(game,file),'utf8');}
 const rendered=renderRelicCustody(sources,references),newline=sources[relicCustodyFiles[0]].includes('\r\n')?'\r\n':'\n';
 if(write){for(const file of relicCustodyFiles)fs.writeFileSync(path.join(game,file),rendered[file].replaceAll('\n',sources[file].includes('\r\n')?'\r\n':'\n'));fs.writeFileSync(path.join(game,relicRuntimeFile),relicRuntimeSource.replaceAll('\n',newline),{flag:'wx'});}
 return {files:[...relicCustodyFiles,relicRuntimeFile]};
}
