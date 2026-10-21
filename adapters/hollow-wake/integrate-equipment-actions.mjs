import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';import {root,sha256} from '../../scripts/reference-utils.mjs';
export const equipmentWorld='src/engine/world.ts',equipmentBridge='src/engine/equipmentActionAdapter.ts';const lf=s=>s.replaceAll('\r\n','\n');
function parse(source){const ast=ts.createSourceFile(equipmentWorld,source,ts.ScriptTarget.Latest,true),world=ast.statements.find(s=>ts.isClassDeclaration(s)&&s.name?.text==='World');assert(world);const counts=new Map();return {ast,world,counts,methods:new Map(world.members.filter(ts.isMethodDeclaration).map(m=>{const name=m.name.getText(ast);counts.set(name,(counts.get(name)??0)+1);return [name,{start:m.getStart(ast),docStart:m.jsDoc?.[0]?.pos,end:m.end,text:source.slice(m.getStart(ast),m.end)}];}))};}
export function renderEquipmentActions(source,reference){
 const current=lf(source),original=lf(reference);assert(!current.includes('sdkEquipmentActions'),'Equipment action bridge already applied');const parsed=parse(current),baseline=parse(original),edits=[];
 for(const name of ['sdkEquipmentContext','sdkContainerContext'])assert(!parsed.world.members.some(member=>member.name?.getText(parsed.ast)===name),`Equipment helper name already exists: ${name}`);
 const replacements={
  wornSlotOf:`private sdkEquipmentContext(seat: Seat): EquipmentContext<ItemInstance> {
    const world = this;
    return { carry: seat.meta, get level() { return seat.actor.level; }, get bagBoard() { return bagBoard(); },
      drop: item => world.dropGearAt(seat.actor.pos, item, seat.id) };
  }
  private sdkContainerContext(seat: Seat, id: string): ContainerActionContext<ItemInstance> {
    const world = this;
    return { carry: seat.meta, id, get level() { return world.seatHero(seat).level; }, get bagBoard() { return bagBoard(); },
      get definition() { return CONTAINERS[id]; }, get board() { const def = CONTAINERS[id]; return def ? containerBoard(def) : null; },
      drop: item => world.dropGearAt(seat.actor.pos, item, seat.id) };
  }`,
  equipItem:`equipItem(seat: Seat, uid: number, slotId?: string): void {
    const result = sdkEquipmentActions.equip(this.sdkEquipmentContext(seat), uid, slotId);
    if (result.refusal) this.failNote(seat.actor, result.refusal.key, result.refusal.reason);
    if (!result.changed) return;
    this.recalcSeat(seat); this.text(seat.actor.pos, result.item!.name, ITEM_RARITIES[result.item!.rarity].color, 13); this.markMetaDirty(seat);
  }`,
  unequipItem:`unequipItem(seat: Seat, slotId: string, x?: number, y?: number): void {
    const result = sdkEquipmentActions.unequip(this.sdkEquipmentContext(seat), slotId, x, y);
    if (result.refusal) this.failNote(seat.actor, result.refusal.key, result.refusal.reason);
    if (result.changed) { this.recalcSeat(seat); this.markMetaDirty(seat); }
  }`,
  moveBagItem:`moveBagItem(seat: Seat, uid: number, x: number, y: number): void {
    if (sdkEquipmentActions.move(seat.meta.items, uid, bagBoard(), x, y)) this.markMetaDirty(seat);
  }`,
  containerPlace:`containerPlace(seat: Seat, containerId: string, uid: number, x?: number, y?: number): void {
    if (containerId === 'reliquary') { this.seatAccountRelic(seat, uid, x, y); return; }
    const result = sdkEquipmentActions.place(this.sdkContainerContext(seat, containerId), uid, x, y);
    if (result.refusal) this.failNote(seat.actor, result.refusal.key, result.refusal.reason);
    if (!result.changed) return;
    this.recalcSeat(seat);
    this.text(seat.actor.pos, CONTAINERS[containerId].glyph + ' ' + result.item!.name, ITEM_RARITIES[result.item!.rarity].color, 13);
    this.markMetaDirty(seat);
  }`,
  containerTake:`containerTake(seat: Seat, containerId: string, uid: number, x?: number, y?: number): void {
    if (containerId === 'reliquary') { this.withdrawRelic(seat, uid, x, y); return; }
    const result = sdkEquipmentActions.take(this.sdkEquipmentContext(seat), containerId, uid, x, y);
    if (result.refusal) this.failNote(seat.actor, result.refusal.key, result.refusal.reason);
    if (result.changed) { this.recalcSeat(seat); this.markMetaDirty(seat); }
  }`,
  containerMove:`containerMove(seat: Seat, containerId: string, uid: number, x: number, y: number): void {
    if (containerId === 'reliquary' && this.reliquaryRefusal(seat)) return;
    const def = CONTAINERS[containerId], held = seat.meta.containers[containerId];
    if (!def || !held || !held.some(item => item.uid === uid)) return;
    const board = containerBoard(def); if (!board) return;
    if (sdkEquipmentActions.move(held, uid, boardDims(board), x, y)) {
      this.recalcSeat(seat); this.persistAccountRelics(seat); this.markMetaDirty(seat);
    }
  }`,
 };
 for(const [name,text] of Object.entries(replacements)){const node=parsed.methods.get(name),expected=baseline.methods.get(name);assert(node&&expected);assert.equal(parsed.counts.get(name),1,`Ambiguous equipment method: ${name}`);assert.equal(node.text,expected.text,`Unreviewed equipment method: ${name}`);
  if(name==='wornSlotOf'){assert(node.docStart!==undefined&&expected.docStart!==undefined);assert.equal(current.slice(node.docStart,node.start),original.slice(expected.docStart,expected.start),'Unreviewed worn-slot documentation');edits.push({...node,start:node.docStart,text:'/** Live host observations and displaced-item delivery for SDK actions. */\n  '+text});}
  else edits.push({...node,text});}
 for(const [from,names] of [['./items',['SLOT_BY_ID','slotsForCategory']],['./inventory',['swapBlockerFits']],['./containers',['containerLanding','containerSeatRefusal']],['./itemLimits',['uniqueContainerRefusal']]]){
  const imports=parsed.ast.statements.filter(n=>ts.isImportDeclaration(n)&&n.moduleSpecifier.text===from);assert.equal(imports.length,1);const node=imports[0],bindings=node.importClause.namedBindings;assert(ts.isNamedImports(bindings));const kept=bindings.elements.filter(n=>!names.includes(n.name.text)).map(n=>n.getText(parsed.ast));assert.equal(bindings.elements.length-kept.length,names.length);
  edits.push({start:node.getStart(parsed.ast),end:node.end,text:kept.length?`import { ${kept.join(', ')} } from '${from}';`:''});
 }
 const end=parsed.ast.statements.filter(ts.isImportDeclaration).at(-1).end;edits.push({start:end,end,text:"\nimport { sdkEquipmentActions, type EquipmentContext, type ContainerActionContext } from './equipmentActionAdapter';"});
 let result=current;for(const e of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,e.start)+e.text+result.slice(e.end);return result;
}
export function integrateEquipmentActions(game,write=true){const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),bytes=fs.readFileSync(path.join(root,'.reference',equipmentWorld));assert.equal(sha256(bytes),lock.files[equipmentWorld]);assert(!fs.existsSync(path.join(game,equipmentBridge)),'Refusing to overwrite equipment host binding');const current=fs.readFileSync(path.join(game,equipmentWorld),'utf8'),result=renderEquipmentActions(current,bytes.toString());if(write){fs.writeFileSync(path.join(game,equipmentWorld),result.replaceAll('\n',current.includes('\r\n')?'\r\n':'\n'));fs.copyFileSync(path.join(root,'adapters/hollow-wake/equipmentActionAdapter.ts'),path.join(game,equipmentBridge));}return {files:[equipmentWorld,equipmentBridge]};}
