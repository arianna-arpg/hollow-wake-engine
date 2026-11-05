import {empowermentRank, empowermentNumeral} from './skill-progression.js';
import {integer} from './validation.js';
import type {GemPayload, GemSocketRow, GrantedSkillState, ItemInstance, ItemRarity,
  SkillGemPayload, SupportGemPayload} from './item-types.js';
export type {GemPayload, GemSocketRow, GrantedSkillState, SkillGemPayload, SupportGemPayload} from './item-types.js';

export interface GemDefinition {id: string; name: string}
export interface GemSupport<D extends GemDefinition = GemDefinition> {
  def: D; level: number; locked?: boolean; rolled?: Record<string, string>;
}
export interface GemSkill<D extends GemDefinition = GemDefinition, U extends GemDefinition = GemDefinition> {
  def: D; level: number; rarity?: string; empowermentRank?: number;
  replenishmentPaused?: true; sockets: (GemSupport<U> | null)[];
  locked?: boolean; granted?: boolean; attunedForm?: string; treeNodes?: string[];
}
export const SKILL_GEM_BASE = 'skill_gem';
export const SUPPORT_GEM_BASE = 'support_gem';
export function isGemItem(item: ItemInstance): boolean { return item.gem !== undefined; }
export function skillGemPayloadOf(item: ItemInstance): SkillGemPayload | null { return item.gem?.kind === 'skill' ? item.gem : null; }
export function supportGemPayloadOf(item: ItemInstance): SupportGemPayload | null { return item.gem?.kind === 'support' ? item.gem : null; }
export function bagGemItems<I extends ItemInstance>(items: readonly I[]): I[] { return items.filter(isGemItem); }
export function findBagGem<I extends ItemInstance>(items: readonly I[], kind: 'skill' | 'support', id: string): I | undefined {
  return items.find(item => item.gem?.kind === kind && (item.gem.kind === 'skill' ? item.gem.skillId : item.gem.supportId) === id);
}
/** Payload rarity must be one of the supported skill rarities at trusted ingress. */
export function gemItemRarityOf(payload: GemPayload): ItemRarity {
  return payload.kind === 'support' ? 'common' : (payload.rarity === 'legendary' ? 'unique' : payload.rarity) as ItemRarity;
}
function packSocketRow(support: GemSupport | null): GemSocketRow | null {
  return support ? {supportId: support.def.id, level: support.level,
    ...(support.locked ? {locked: true} : {}), ...(support.rolled ? {rolled: {...support.rolled}} : {})} : null;
}
export function packSkillGemPayload(inst: GemSkill): SkillGemPayload {
  const rank = empowermentRank(inst);
  return {kind: 'skill', skillId: inst.def.id, level: inst.level, rarity: inst.rarity ?? 'common',
    ...(rank ? {empowermentRank: rank} : {}), ...(inst.replenishmentPaused ? {replenishmentPaused: true as const} : {}),
    sockets: inst.sockets.map(packSocketRow), ...(inst.granted ? {granted: true} : {}),
    ...(inst.attunedForm ? {attunedForm: inst.attunedForm} : {}), ...(inst.treeNodes?.length ? {treeNodes: [...inst.treeNodes]} : {})};
}
export function packSupportGemPayload(support: GemSupport): SupportGemPayload {
  return {kind: 'support', supportId: support.def.id, level: support.level, ...(support.rolled ? {rolled: {...support.rolled}} : {})};
}
export function packGrantState(inst: GemSkill): GrantedSkillState {
  return {sockets: inst.sockets.map(packSocketRow), ...(inst.treeNodes?.length ? {treeNodes: [...inst.treeNodes]} : {})};
}
export function writeBackSupportGem(item: ItemInstance, support: GemSupport): void {
  item.gem = packSupportGemPayload(support); item.name = support.def.name;
  if (support.locked) item.locked = true; else delete item.locked;
}
export function gemInitials(name: string): string { return name.split(' ').map(part => part[0]).join('').slice(0, 3).toUpperCase(); }
function skillName(inst: Pick<GemSkill, 'def' | 'rarity' | 'empowermentRank'>): string {
  const numeral = empowermentNumeral(empowermentRank(inst));
  return inst.def.name + (numeral ? ` ${numeral}` : '');
}

/** Explicit live services for trusted typed cargo. Ports may observe current content
 * and borrowed state. No durable transaction or arbitrary-JSON admission is implied.
 * `hasOwnSupport` must distinguish registry entries from inherited object properties.
 */
export interface GemResidencePorts<D extends GemDefinition, U extends GemDefinition, S extends GemSkill<D, U>, I extends ItemInstance> {
  skill(id: string): D | undefined;
  support(id: string): U | undefined;
  hasOwnSupport(id: string): boolean;
  hasForm(id: string): boolean;
  makeSkill(def: D, level: number, sockets: number): S;
  validTreeNodes(def: D, ids: readonly string[], level: number, inst?: S): string[] | undefined;
  nextUid(): number;
  rebuildItem(saved: I): I | null;
  bagWidth(): number;
  bagHeight(): number;
  itemGridSize(item: I): {w: number; h: number};
}

/** Stateless policy over host-owned identities/cargo. Earlier callback writes and
 * consumed IDs remain on failure; an owned session must supply detached drafts.
 */
export function createGemResidence<D extends GemDefinition, U extends GemDefinition, S extends GemSkill<D, U>, I extends ItemInstance>(
  ports: GemResidencePorts<D, U, S, I>,
) {
  function unpackRow(row: GemSocketRow | null | undefined): GemSupport<U> | null {
    const def = row ? ports.support(row.supportId) : undefined;
    return row && def ? {def, level: row.level, ...(row.locked ? {locked: true} : {}), ...(row.rolled ? {rolled: {...row.rolled}} : {})} : null;
  }
  function freeCellCount(items: readonly I[]): number {
    let used = 0;
    for (const item of items) {
      if (item.x === undefined || item.y === undefined) continue;
      const size = ports.itemGridSize(item); used += size.w * size.h;
    }
    return ports.bagWidth() * ports.bagHeight() - used;
  }
  function restoreGrantState(inst: S, state: GrantedSkillState): void {
    const rows = state.sockets ?? [];
    inst.sockets = inst.sockets.map((_, index) => unpackRow(rows[index]));
    if (state.treeNodes?.length) inst.treeNodes = ports.validTreeNodes(inst.def, state.treeNodes, inst.level);
  }
  function makeSkillGemItem(inst: S): ItemInstance {
    const gem = packSkillGemPayload(inst);
    return {uid: integer(ports.nextUid(), 1, 'Gem item uid'), baseId: SKILL_GEM_BASE, ilvl: 1, tier: 1,
      rarity: gemItemRarityOf(gem), name: skillName(inst), baseRoll: 0, implicitRolls: [], affixes: [],
      ...(inst.locked ? {locked: true} : {}), gem};
  }
  function makeSupportGemItem(support: GemSupport<U>): ItemInstance {
    const gem = packSupportGemPayload(support);
    return {uid: integer(ports.nextUid(), 1, 'Gem item uid'), baseId: SUPPORT_GEM_BASE, ilvl: 1, tier: 1,
      rarity: gemItemRarityOf(gem), name: support.def.name, baseRoll: 0, implicitRolls: [], affixes: [],
      ...(support.locked ? {locked: true} : {}), gem};
  }
  function skillOfGemItem(item: I): S | null {
    const payload = skillGemPayloadOf(item); if (!payload) return null;
    const def = ports.skill(payload.skillId); if (!def) return null;
    const inst = ports.makeSkill(def, payload.level, Math.max(1, payload.sockets.length));
    inst.rarity = payload.rarity;
    const rank = empowermentRank(payload); if (rank) inst.empowermentRank = rank;
    if (payload.replenishmentPaused === true) inst.replenishmentPaused = true;
    if (payload.granted) inst.granted = true;
    if (payload.attunedForm && ports.hasForm(payload.attunedForm)) inst.attunedForm = payload.attunedForm;
    if (payload.treeNodes?.length) inst.treeNodes = ports.validTreeNodes(def, payload.treeNodes, payload.level, inst);
    if (item.locked) inst.locked = true;
    inst.sockets = payload.sockets.map(unpackRow);
    return inst;
  }
  function bagSkillSupport(item: I, index: number): GemSupport<U> | null {
    if (!Number.isSafeInteger(index) || index < 0) return null;
    const row = skillGemPayloadOf(item)?.sockets[index];
    if (!row || !ports.hasOwnSupport(row.supportId)) return null;
    // The own-key check and live lookup are separate observations, as in the host.
    return {def: ports.support(row.supportId)!, level: row.level,
      ...(row.locked ? {locked: true} : {}), ...(row.rolled ? {rolled: {...row.rolled}} : {})};
  }
  function supportOfGemItem(item: I): GemSupport<U> | null {
    const payload = supportGemPayloadOf(item); if (!payload) return null;
    const def = ports.support(payload.supportId); if (!def) return null;
    return {def, level: payload.level, ...(item.locked ? {locked: true} : {}), ...(payload.rolled ? {rolled: {...payload.rolled}} : {})};
  }
  function rebuildAnyItem(saved: I): I | null {
    const item = ports.rebuildItem(saved); if (!item || !item.gem) return item;
    if (item.gem.kind === 'skill') {
      if (!ports.skill(item.gem.skillId)) return null;
      const rank = empowermentRank(item.gem);
      if (rank) item.gem.empowermentRank = rank; else delete item.gem.empowermentRank;
      item.name = skillName({def: ports.skill(item.gem.skillId)!, ...item.gem});
    } else {
      if (!ports.support(item.gem.supportId)) return null;
      item.name = ports.support(item.gem.supportId)!.name;
    }
    return item;
  }
  return Object.freeze({isGemItem, skillGemPayloadOf, supportGemPayloadOf, bagGemItems, findBagGem, gemItemRarityOf,
    packSkillGemPayload, packSupportGemPayload, packGrantState, writeBackSupportGem, gemInitials,
    freeCellCount, restoreGrantState, makeSkillGemItem, makeSupportGemItem, skillOfGemItem,
    bagSkillSupport, supportOfGemItem, rebuildAnyItem});
}
