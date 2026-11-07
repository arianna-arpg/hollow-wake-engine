import type {CraftingContent} from './crafting-content.js';
import type {CraftLore} from './crafting.js';
import type {SkillProgression} from './skill-progression.js';
import type {ItemInstance,SkillGemPayload} from './item-types.js';
import type {InventoryBoard} from './inventory.js';
import {gemItemRarityOf} from './gem-residence.js';
import {validateItem} from './item-validation.js';
import {SessionInputError, requireSession as need, sessionFields as fields, sessionRecord as record,
  sessionInteger as integer, sessionText as text, sessionArray as array, sessionBoolean as bool} from './session-json.js';

export interface CraftingSessionState {
  vestiges?: Record<string,number>;
  rack?: ({gem:SkillGemPayload;locked?:true}|null)[];
  board: InventoryBoard;
  items: ItemInstance[];
  equipped: Record<string, ItemInstance>;
  /** Recovered items waiting for bag space or an explicit host custody transfer. */
  overflow: ItemInstance[];
  essences: Record<string, number>;
  account: {craftLore: CraftLore; ledger: Record<string, number>; features: string[]; progression: boolean};
}
export interface CraftingSessionDefinitions {
  crafting: CraftingContent;
  skills: SkillProgression;
  /** Item base ID -> crafting memory price kind. Saved as part of content identity. */
  memoryKinds: Readonly<Record<string, string>>;
}
export function craftingSaveVersion(state: {vestiges?:unknown;rack?:unknown}) {
  return state.vestiges!==undefined ? 3 : state.rack!==undefined ? 2 : 1;
}
const itemFields = ['uid','baseId','ilvl','tier','rarity','name','baseRoll','superior','implicitRolls','affixes','uniqueId','uniqueRolls',
  'uniqueChoices','grantState','sockets','craftedSockets','x','y','locked','gem','mem','writ','relicKey','questId'];
function rolls(value: unknown): asserts value is number[] {
  array(value,1024); for (const n of value) need(typeof n === 'number' && Number.isFinite(n), 'invalid-roll');
}
function optionalText(value: unknown): void {if (value !== undefined) text(value);}
function optionalBool(value: unknown): void {if (value !== undefined) bool(value);}
function ids(value: unknown): asserts value is string[] {array(value); value.forEach(text);}

/** Strict same-content admission. Never repairs, clamps, discards or re-rolls saved cargo. */
export class CraftingSessionData {
  readonly #defs: CraftingSessionDefinitions;
  readonly #families: Set<string>;
  readonly #essences: Set<string>;
  readonly #rarities: Set<string>;
  constructor(defs: CraftingSessionDefinitions) {
    this.#defs = defs;
    this.#families = new Set(Object.values(defs.crafting.items.pack.affixes).map(a => a.family));
    this.#essences = new Set(defs.crafting.pack.essences.map(e => e.id));
    this.#rarities = new Set(defs.skills.pack.services?.rarities.map(r => r.id));
    need(this.#rarities.size > 0, 'missing-skill-service-content');
    for (const id of this.#rarities) need(Object.hasOwn(defs.crafting.pack.gemEssences,id), 'missing-gem-price');
  }
  #support(row: unknown): void {
    fields(row,['supportId','level','locked','rolled']); text(row.supportId); integer(row.level,1);
    let max: number; try {max = this.#defs.skills.support(row.supportId).maxLevel;} catch {throw new SessionInputError('unknown-support');}
    need(row.level <= max,'invalid-support-level'); optionalBool(row.locked);
    if (row.rolled !== undefined) {record(row.rolled); for (const [key,value] of Object.entries(row.rolled)) {text(key); text(value);}}
  }
  #sockets(value: unknown): void {array(value,1024); for (const row of value) if (row !== null) this.#support(row);}
  #skill(id: unknown): void {text(id); try {this.#defs.skills.skill(id);} catch {throw new SessionInputError('unknown-skill');}}
  #tree(id: string, picks: unknown, level?: number, investment = {}): void {
    if (picks === undefined) return;
    ids(picks); const kept = this.#defs.skills.tree(id).restore(picks,level,investment) ?? [];
    need(kept.length === picks.length && kept.every((v,i) => v === picks[i]), 'invalid-skill-tree');
  }
  skillPayload(gem: unknown): void {
    fields(gem,['kind','skillId','level','rarity','sockets','empowermentRank','replenishmentPaused','granted','attunedForm','treeNodes']);
    need(gem.kind === 'skill','unknown-gem-kind');
    this.#skill(gem.skillId); integer(gem.level,1,this.#defs.skills.skill(gem.skillId as string).maxLevel);
    need(this.#rarities.has(gem.rarity as string),'unknown-skill-rarity'); this.#sockets(gem.sockets);
    optionalBool(gem.granted); optionalText(gem.attunedForm);
    if (gem.replenishmentPaused !== undefined) need(gem.replenishmentPaused === true,'invalid-pause');
    if (gem.empowermentRank !== undefined) {integer(gem.empowermentRank,1); need(gem.rarity === 'legendary','invalid-empowerment');}
    this.#tree(gem.skillId as string,gem.treeNodes,gem.level,gem);
  }
  item(input: unknown): ItemInstance {
    fields(input,itemFields); const p = this.#defs.crafting.items.pack;
    text(input.name); text(input.baseId); integer(input.uid,1,Number.MAX_SAFE_INTEGER - 1);
    need(Object.hasOwn(p.bases,input.baseId),'unknown-item-base');
    rolls(input.implicitRolls); array(input.affixes,1024);
    for (const row of input.affixes) {
      fields(row,['id','tier','rolls','crafted','locked']); text(row.id); rolls(row.rolls); optionalBool(row.crafted); optionalBool(row.locked);
      need(Object.hasOwn(p.affixes,row.id),'unknown-affix'); need(row.rolls.length === p.affixes[row.id].lines.length,'affix-roll-count');
    }
    if (input.uniqueRolls !== undefined) rolls(input.uniqueRolls);
    if (input.sockets !== undefined) {array(input.sockets,1024); for (const id of input.sockets) if (id !== null) text(id);}
    optionalBool(input.locked); optionalText(input.relicKey); optionalText(input.questId); optionalText(input.uniqueId);
    if (input.craftedSockets !== undefined) integer(input.craftedSockets,0,(input.sockets as unknown[] | undefined)?.length ?? 0);
    if (input.x !== undefined) integer(input.x); if (input.y !== undefined) integer(input.y);
    need((input.x === undefined) === (input.y === undefined),'partial-placement');
    try {validateItem(input as unknown as ItemInstance,p);} catch {throw new SessionInputError('invalid-item');}
    const base = p.bases[input.baseId];
    need(input.implicitRolls.length === (base.implicits?.length ?? 0),'implicit-roll-count');
    if (input.uniqueId !== undefined) {
      const def = p.uniques[input.uniqueId as string];
      need(def.baseId === input.baseId && input.rarity === 'unique','unique-identity');
      need(Array.isArray(input.uniqueRolls) && input.uniqueRolls.length === def.lines.length,'unique-roll-count');
      const choices = input.uniqueChoices ?? Object.create(null); record(choices);
      const groups = def.choices ?? []; need(Object.keys(choices).length === groups.length,'unique-choice-count');
      const used = new Map<string,Set<string>>();
      for (const group of groups) {
        const chosen = choices[group.id]; fields(chosen,['id','rolls']); text(chosen.id); rolls(chosen.rolls);
        const option = group.options.find(o => o.id === chosen.id); need(option,'unknown-unique-choice');
        need(chosen.rolls.length === option.lines.length,'choice-roll-count');
        if (group.uniqueBy) {
          const keys = used.get(group.uniqueBy) ?? new Set<string>(), key = option.exclusiveKey ?? option.id;
          need(!keys.has(key),'duplicate-unique-choice'); keys.add(key); used.set(group.uniqueBy,keys);
        }
      }
    } else need(input.uniqueRolls === undefined && input.uniqueChoices === undefined,'orphan-unique-data');
    if (input.gem !== undefined) {
      const gem = input.gem; record(gem);
      if (gem.kind === 'skill') {
        this.skillPayload(gem);
        need(input.baseId === 'skill_gem','gem-base');
      } else {
        fields(gem,['kind','supportId','level','rolled']); need(gem.kind === 'support','unknown-gem-kind');
        this.#support({supportId:gem.supportId,level:gem.level,...(gem.rolled !== undefined ? {rolled:gem.rolled} : {})});
        need(input.baseId === 'support_gem','gem-base');
      }
      need(input.rarity === gemItemRarityOf(gem as unknown as NonNullable<ItemInstance['gem']>),'gem-rarity');
    } else need(input.baseId !== 'skill_gem' && input.baseId !== 'support_gem','missing-gem');
    if (input.grantState !== undefined) {
      record(input.grantState);
      for (const [id,row] of Object.entries(input.grantState)) {this.#skill(id); fields(row,['sockets','treeNodes']); this.#sockets(row.sockets); this.#tree(id,row.treeNodes);}
    }
    const memory = this.#defs.memoryKinds[input.baseId];
    need((memory !== undefined) === (input.mem !== undefined),'memory-base');
    if (input.mem !== undefined) {
      array(input.mem); need(input.mem.length > 0,'empty-memory');
      for (const unit of input.mem) {
        fields(unit,['d','s','e','t','g','ceiling']); text(unit.d); integer(unit.s,0,0xffffffff); optionalText(unit.e); optionalText(unit.t);
        if (unit.ceiling !== undefined) need(this.#rarities.has(unit.ceiling as string),'unknown-skill-rarity');
        if (unit.g !== undefined) {
          const pin = unit.g; fields(pin,['k','id','r','l']); text(pin.id);
          need(pin.k === 'skill' || pin.k === 'support','invalid-memory-pin');
          if (pin.l !== undefined) {
            let max: number|undefined;
            try {max=this.#defs.skills[pin.k](pin.id).maxLevel;}
            catch { /* A retired promise falls back to the ordinary seeded cut. */ }
            integer(pin.l,1,max);
          }
          if (pin.r !== undefined) need(pin.k === 'skill' && this.#rarities.has(pin.r as string),'invalid-memory-rarity');
        }
      }
    }
    if (input.writ !== undefined) {fields(input.writ,['category','complexity']); text(input.writ.category); integer(input.writ.complexity,1);}
    return input as unknown as ItemInstance;
  }
  state(input: unknown, validateRack?: (rack:unknown,data:CraftingSessionData)=>void, admittedAccount?:unknown): CraftingSessionState {
    fields(input,['board','items','equipped','overflow','essences','account','rack','vestiges']);
    if(input.vestiges!==undefined){
      record(input.vestiges);
      for(const [id,count] of Object.entries(input.vestiges)){
        need(Object.hasOwn(this.#defs.crafting.items.pack.vestiges,id),'unknown-vestige');integer(count);
      }
    }
    if(input.rack !== undefined){need(validateRack,'rack-unavailable');validateRack(input.rack,this);}
    const board = input.board; fields(board,['w','h','rows']); integer(board.w,1,256); integer(board.h,1,256); need(board.w * board.h <= 4096,'board-limit');
    const cells = new Uint8Array(board.w * board.h);
    if (board.rows !== undefined) {
      array(board.rows,256); need(board.rows.length === board.h,'board-mask');
      board.rows.forEach((row,y) => {need(typeof row === 'string' && row.length === board.w && /^[#.]+$/.test(row),'board-mask');
        for (let x = 0; x < row.length; x++) if (row[x] === '.') cells[y * (board.w as number) + x] = 1;});
    }
    array(input.items); array(input.overflow); record(input.equipped); need(Object.keys(input.equipped).length <= 64,'equipment-limit');
    const seen = new Set<number>();
    for (const [location,rows] of [['bag',input.items],['equipment',Object.values(input.equipped)],['overflow',input.overflow]] as const) {
      for (const row of rows) {
        const item = this.item(row); need(!seen.has(item.uid),'duplicate-uid'); seen.add(item.uid);
        if (location === 'bag') {
          integer(item.x); integer(item.y); const {w,h} = this.#defs.crafting.items.pack.bases[item.baseId];
          need(item.x + w <= board.w && item.y + h <= board.h,'outside-bag');
          for (let y: number = item.y; y < item.y + h; y++) for (let x: number = item.x; x < item.x + w; x++) {
            const cell = y * board.w + x; need(cells[cell] === 0,'occupied-cell'); cells[cell] = 1;
          }
        } else need(item.x === undefined && item.y === undefined,'unexpected-placement');
      }
    }
    Object.keys(input.equipped).forEach(text);
    record(input.essences);
    for (const [id,n] of Object.entries(input.essences)) {need(this.#essences.has(id),'unknown-essence'); integer(n);}
    if(admittedAccount!==undefined && input.account===admittedAccount)return input as unknown as CraftingSessionState;
    const a = input.account; fields(a,['craftLore','ledger','features','progression']); bool(a.progression); ids(a.features);
    need(new Set(a.features).size === a.features.length,'duplicate-feature'); record(a.craftLore); record(a.ledger);
    for (const [id,n] of Object.entries(a.ledger)) {text(id); integer(n);}
    for (const [family,entry] of Object.entries(a.craftLore)) {
      need(this.#families.has(family),'unknown-craft-family'); fields(entry,['rank','progress']);
      const steps = this.#defs.crafting.pack.craft.stepsPerRank;
      integer(entry.rank,0,steps.length); integer(entry.progress,0,(steps[entry.rank] ?? 1) - 1);
    }
    return input as unknown as CraftingSessionState;
  }
}
