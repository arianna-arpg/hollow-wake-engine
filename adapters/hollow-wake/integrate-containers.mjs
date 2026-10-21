import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
export const containerFiles=['src/engine/containers.ts','src/engine/seatlaw.ts','src/engine/itemLimits.ts','src/engine/relicPower.ts'];
const lf=s=>s.replaceAll('\r\n','\n');
function transform(file,source,replacements,imports={},extra=''){
 const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true),edits=[];
 for(const [name,text] of Object.entries(replacements)){
  const nodes=ast.statements.filter(n=>(ts.isFunctionDeclaration(n)&&n.name?.text===name)||(ts.isVariableStatement(n)&&n.declarationList.declarations.length===1&&n.declarationList.declarations[0].name.getText(ast)===name));
  assert.equal(nodes.length,1,`Container declaration changed: ${file}:${name}`);edits.push({start:nodes[0].getStart(ast),end:nodes[0].end,text});
 }
 for(const [from,text] of Object.entries(imports)){const nodes=ast.statements.filter(n=>ts.isImportDeclaration(n)&&n.moduleSpecifier.text===from);assert.equal(nodes.length,1);edits.push({start:nodes[0].getStart(ast),end:nodes[0].end,text});}
 if(extra){const end=ast.statements.filter(ts.isImportDeclaration).at(-1).end;edits.push({start:end,end,text:'\n'+extra});}
 let result=source;for(const edit of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,edit.start)+edit.text+result.slice(edit.end);return result;
}
export function renderContainers(sources,references){
 for(const file of containerFiles)assert.equal(lf(sources[file]),lf(references[file]),`Unreviewed container source: ${file}`);
 const result={};
 result[containerFiles[0]]=transform(containerFiles[0],lf(sources[containerFiles[0]]),{
  unionBoard:'',SEAT_DIRS:'',
  containerCanvas:'export function containerCanvas(def: ContainerDef): { w: number; h: number } { const layout = sdkContainerLayout(def); return { w: layout.w, h: layout.h }; }',
  containerBoardFor:'export function containerBoardFor(def: ContainerDef, features: ReadonlySet<string> | undefined): ContainerBoard | null { return sdkContainerLayout(def).board(features); }',
  containerFullBoard:'export function containerFullBoard(def: ContainerDef): ContainerBoard { return sdkContainerLayout(def).fullBoard(); }',
  containerRungAt:'export function containerRungAt(def: ContainerDef, x: number, y: number): ContainerRung | null { const index = sdkContainerLayout(def).rungIndexAt(x, y); return index === null ? null : def.ladder[index]; }',
  boardOpenAt:'export function boardOpenAt(board: ContainerBoard, x: number, y: number): boolean { return sdkBoardOpen(board, x, y); }',
  boardDims:'export function boardDims(board: ContainerBoard): BoardDims { return sdkBoardDims(board); }',
  packContainerBoard:'export function packContainerBoard(board: ContainerBoard): ContainerBoardW { return sdkPackBoard(board); }',
  unpackContainerBoard:'export function unpackContainerBoard(w: ContainerBoardW): ContainerBoard { return sdkUnpackBoard(w); }',
  containerAccepts:'export function containerAccepts(def: ContainerDef, item: ItemInstance): boolean { return sdkContainers.accepts(def, item); }',
  findCarried:'export function findCarried(m: CarrySlice, uid: number): { item: ItemInstance; where: CarriedWhere } | undefined { return sdkFindCarried(m, uid); }',
  containerOriginOf:'export function containerOriginOf(m: CarrySlice, uid: number): string { return sdkOriginOf(m, uid); }',
  originContainerId:'export function originContainerId(from: string): string | null { return sdkOriginId(from); }',
  containerSeatRefusal:'export function containerSeatRefusal(def: ContainerDef, board: ContainerBoard | null, item: ItemInstance, level: number): string | null { return sdkContainers.seatRefusal(def, board, item, level); }',
  containerLanding:`export function containerLanding(def: ContainerDef, board: ContainerBoard | null, held: readonly ItemInstance[],
  item: ItemInstance, from: 'bag' | 'self' | 'other', x: number, y: number, level: number, bag?: readonly ItemInstance[], bagBoardDims?: BoardDims): ContainerLanding {
  return sdkContainers.landing(def, board, held, item, from, x, y, level, bag, bagBoardDims);
}`,
  containerMisfits:'export function containerMisfits(board: ContainerBoard | null, held: readonly ItemInstance[]): ItemInstance[] { return sdkContainers.misfits(board, held); }',
  seatNeighbourhood:'export function seatNeighbourhood(board: ContainerBoard, seated: readonly ItemInstance[]): Map<ItemInstance, SeatNeighbourhood> { return sdkSeats.neighbourhood(board, seated); }',
  seatAmplification:'export function seatAmplification(board: ContainerBoard, seated: readonly ItemInstance[], modsOf: (it: ItemInstance) => readonly Modifier[]): Map<ItemInstance, number> { return sdkSeats.amplification(board, seated, modsOf); }',
 },{'./inventory':"import type { BoardDims } from './inventory';",'./itemLimits':"import { UNIQUES } from '../data/uniques';"},
 `import { ContainerLayout, ContainerPolicy, SeatGeometry, containerBoardOpen as sdkBoardOpen, containerBoardDimensions as sdkBoardDims,
  packContainerBoard as sdkPackBoard, unpackContainerBoard as sdkUnpackBoard, findCarried as sdkFindCarried,
  containerOriginOf as sdkOriginOf, originContainerId as sdkOriginId } from '@hollow-wake/engine/inventory/containers';
const sdkContainers = new ContainerPolicy<ItemInstance>({ footprint: itemGridSize, base: item => ITEM_BASES[item.baseId], level: itemLevelReq, unique: item => item.uniqueId ? UNIQUES[item.uniqueId] : undefined });
const sdkSeats = new SeatGeometry<ItemInstance, Modifier>(itemGridSize, seatPowerOf);
const sdkLayouts = new WeakMap<ContainerDef, ContainerLayout>();
function sdkContainerLayout(def: ContainerDef): ContainerLayout {
  let layout = sdkLayouts.get(def);
  if (!layout || !layout.matches(def.ladder)) { layout = new ContainerLayout(def.ladder); sdkLayouts.set(def, layout); }
  return layout;
}`);
 result[containerFiles[1]]=transform(containerFiles[1],lf(sources[containerFiles[1]]),{
  seatPowerOf:'export function seatPowerOf(mods: readonly Modifier[], mode: SeatAmplifierMode): number { return sdkSeatPower(mods, mode, sdkSeatMode); }',
  amplifySeatMods:'export function amplifySeatMods(mods: Modifier[], factor: number): Modifier[] { return sdkAmplifyMods(mods, factor, sdkSeatMode); }',
 },{},`import { seatPowerOf as sdkSeatPower, amplifySeatMods as sdkAmplifyMods } from '@hollow-wake/engine/inventory/containers';
const sdkSeatMode = (stat: string): SeatAmplifierMode | undefined => SEAT_AMPLIFIERS[stat]?.mode;`);
 result[containerFiles[2]]=transform(containerFiles[2],lf(sources[containerFiles[2]]),{
  uniqueContainerLimit:'export function uniqueContainerLimit(item: ItemInstance): number | undefined { return sdkUniqueLimit(item.uniqueId ? UNIQUES[item.uniqueId] : undefined); }',
  uniqueContainerRefusal:'export function uniqueContainerRefusal(held: readonly ItemInstance[], item: ItemInstance, replacing?: ItemInstance): string | null { return sdkUniqueRefusal(held, item, item.uniqueId ? UNIQUES[item.uniqueId] : undefined, replacing); }',
 },{},"import { uniqueContainerLimit as sdkUniqueLimit, uniqueContainerRefusal as sdkUniqueRefusal } from '@hollow-wake/engine/inventory/containers';");
 result[containerFiles[3]]=transform(containerFiles[3],lf(sources[containerFiles[3]]),{
  relicPowerActive:"export function relicPowerActive(actor: Pick<Actor, 'relicEffectsSuppressed'>, enabled = true): boolean { return sdkRelicActive(actor.relicEffectsSuppressed, enabled); }",
  relicNumeric:"export function relicNumeric(m: Pick<Modifier, 'stat' | 'kind' | 'value' | 'fromStat'>): boolean { return sdkRelicNumeric(m, sdkRelicCap); }",
  empowerRelicMods:'export function empowerRelicMods(mods: Modifier[], power: number, seatFactor = 1): Modifier[] { return sdkEmpowerMods(mods, power, seatFactor, sdkRelicCap); }',
  relicUniqueValue:"export function relicUniqueValue(m: Pick<Modifier, 'stat' | 'kind' | 'value' | 'fromStat'>): number { return sdkUniqueValue(m, RELIQUARY_CFG.baseline, sdkRelicCap); }",
 },{},`import { relicPowerActive as sdkRelicActive, relicNumeric as sdkRelicNumeric, empowerRelicMods as sdkEmpowerMods, relicUniqueValue as sdkUniqueValue } from '@hollow-wake/engine/inventory/containers';
const sdkRelicCap = (stat: string): number | undefined => Object.hasOwn(RELIC_SCALABLE, stat) ? RELIC_SCALABLE[stat] : undefined;`);
 return result;
}
export function integrateContainers(game,write=true){
 const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),sources={},references={};
 for(const file of containerFiles){const bytes=fs.readFileSync(path.join(root,'.reference',file));assert.equal(sha256(bytes),lock.files[file]);references[file]=bytes.toString();sources[file]=fs.readFileSync(path.join(game,file),'utf8');}
 const rendered=renderContainers(sources,references);
 if(write)for(const file of containerFiles)fs.writeFileSync(path.join(game,file),rendered[file].replaceAll('\n',sources[file].includes('\r\n')?'\r\n':'\n'));
 return {files:containerFiles};
}
