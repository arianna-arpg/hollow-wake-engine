import {AbilityRules, empowermentRank, type AbilityCost, type EmpoweredSkill, type SkillInvestment, type SkillTreeRules} from './skill-progression.js';
import {skillTreeSpentCount, type SkillTreeNode} from './skill-tree.js';
import {finite, integer} from './validation.js';

export interface AbilityEssence {id: string; tier: number; label: string; color: string; glyph: string}
export interface SkillMergeTuning {
  merge: Partial<Record<string, number>>; rarities: readonly string[];
  empowerment: {enabled: boolean; copiesPerMerge: number; ranksPerMerge: number; preserveDonorRanks: boolean; maxRank: number | null};
}
export interface SkillMergeInvestment extends EmpoweredSkill {skillId: string; level: number; rarity: string; granted?: boolean}
export interface SkillMergePorts<T, I extends {level: number} & EmpoweredSkill> {
  payload(item: T): SkillMergeInvestment | undefined; locked(item: T): boolean; known(skillId: string): boolean;
  restore(item: T): I | undefined; create(skillId: string, level: number, rarity: string): I;
}
export interface SkillMergePlan<T, I> {need: number; available: number; barred: number; taken: T[]; returnSockets: T[]; result?: I; refusal: string | null}
/** Read-only merge plan. Stable equal-rank/equal-level ties retain bag order.
 * All returned inputs are original host identities; the host commits custody. */
export function planSkillMerge<T, I extends {level: number} & EmpoweredSkill>(
  items: readonly T[], skillId: string, rarity: string, tuning: SkillMergeTuning, ports: SkillMergePorts<T, I>,
): SkillMergePlan<T, I> {
  const legendary = rarity === 'legendary', e = tuning.empowerment, need = legendary ? e.copiesPerMerge : tuning.merge[rarity] ?? 0;
  const eligible: {item: T; payload: SkillMergeInvestment}[] = []; let barred = 0;
  for (const item of items) {
    const payload = ports.payload(item);
    if (!payload || payload.skillId !== skillId || payload.rarity !== rarity) continue;
    if (ports.locked(item) || payload.granted) barred++; else eligible.push({item, payload});
  }
  const plan: SkillMergePlan<T, I> = {need, available: eligible.length, barred, taken: [], returnSockets: [], refusal: null};
  const refuse = (refusal: string): SkillMergePlan<T, I> => ({...plan, refusal});
  if (!ports.known(skillId) || !Number.isSafeInteger(need) || need < 2 || (legendary && !e.enabled)) return refuse('Merging is unavailable.');
  if (eligible.length < need) return refuse(`the font asks ${need} alike`);
  eligible.sort((a, b) => (legendary ? empowermentRank(b.payload) - empowermentRank(a.payload) : 0) || b.payload.level - a.payload.level);
  const taken = eligible.slice(0, need);
  let level = -Infinity; for (const row of taken) level = Math.max(level, row.payload.level);
  if (!Number.isFinite(level) || level < 1) return refuse('Invalid skill investment.');
  let result: I;
  if (legendary) {
    const keeper = ports.restore(taken[0].item); if (!keeper) return refuse('This skill is unavailable.');
    let donorRanks = 0; if (e.preserveDonorRanks) for (let i = 1; i < taken.length; i++) donorRanks += empowermentRank(taken[i].payload);
    const rank = empowermentRank(keeper) + e.ranksPerMerge + donorRanks;
    if (!Number.isSafeInteger(e.ranksPerMerge) || e.ranksPerMerge < 1 || !Number.isSafeInteger(rank)) return refuse('Invalid empowerment policy.');
    if (e.maxRank !== null && rank > e.maxRank) return refuse('Empowerment limit reached.');
    result = {...keeper, level, empowermentRank: rank};
  } else {
    const next = tuning.rarities[tuning.rarities.indexOf(rarity) + 1]; if (!next) return refuse('No higher rarity.');
    result = ports.create(skillId, level, next);
  }
  return {...plan, result, taken: taken.map(row => row.item), returnSockets: (legendary ? taken.slice(1) : taken).map(row => row.item)};
}

export interface ActionSkill extends SkillInvestment {
  def: {id: string; name: string; color: string; tree?: {level: number}; delivery: {type: string}};
  treeNodes?: string[]; state?: {triggerOff?: boolean; trigDepth?: number}; replenishmentPaused?: boolean;
}
export interface ActionSupport {def: {id: string}; level: number}
export interface SkillActionPorts<S, I extends ActionSkill, G extends ActionSupport, T> {
  ability(): AbilityRules; tree(inst: I): SkillTreeRules;
  essences(): readonly AbilityEssence[]; font(): {convertUp: number; convertDown: number; reset: {count: number}};
  wallet(seat: S): Record<string, number>; known(seat: S, skillId: string): I | undefined; granted(seat: S, skillId: string): I | undefined;
  skillMax(inst: I): number; supportMax(gem: G): number;
  nearFont(seat: S): boolean; memoryRefusal(seat: S, skillId: string): string | null; swapRefusal(seat: S): string | null;
  position(seat: S): {x: number; y: number}; text(at: {x: number; y: number}, message: string, color: string, size: number, category?: 'gains'): void;
  fail(seat: S, key: string, reason: string): void; markMetaDirty(seat: S): void; markCharacterDirty(): void;
  pickup(seat: S, essence: AbilityEssence, count: number): void; awaken(seat: S, inst: I): void;
  dismiss(seat: S, skillId: string): void; clearSummons(seat: S, inst: I): void; clearFields(seat: S, inst: I): void;
  trigger(inst: I): unknown; recalculate(seat: S): void;
  mergePlan(seat: S, skillId: string, rarity: string): SkillMergePlan<T, I>;
  sockets(item: T): readonly (G | null)[] | undefined; remove(seat: S, item: T): void;
  grantSkill(seat: S, inst: I): void; grantSupport(seat: S, support: G): void; announceMerge(seat: S, inst: I): void;
}
const atHeight = (at: {x: number; y: number}, height: number) => ({x: at.x, y: at.y - height});
/** Synchronous host-owned commits. Ports must not throw after a commit begins,
 * reenter this host, or mutate unrelated action state. Authority, persistence,
 * world cleanup and presentation remain explicit host responsibilities. */
export class SkillActions<S, I extends ActionSkill, G extends ActionSupport, T> {
  readonly #p: SkillActionPorts<S, I, G, T>; #busy = false;
  constructor(ports: SkillActionPorts<S, I, G, T>) {
    // Bind once so a caller cannot replace a port during a partially committed
    // operation. Closures may intentionally read current authored tuning.
    const names = ['ability','tree','essences','font','wallet','known','granted','skillMax','supportMax','nearFont','memoryRefusal','swapRefusal','position','text','fail','markMetaDirty','markCharacterDirty','pickup','awaken','dismiss','clearSummons','clearFields','trigger','recalculate','mergePlan','sockets','remove','grantSkill','grantSupport','announceMerge'] as const;
    for (const name of names) if (typeof ports[name] !== 'function') throw new Error(`Skill action ${name} port is required`);
    this.#p = Object.fromEntries(names.map(name => [name, ports[name].bind(ports)])) as unknown as SkillActionPorts<S, I, G, T>;
  }
  #run<R>(work: () => R): R {if (this.#busy) throw new Error('Reentrant skill action'); this.#busy = true; try {return work();} finally {this.#busy = false;}}
  #essence(tier: number): AbilityEssence {
    if (!Number.isSafeInteger(tier)) throw new Error('Ability tier must be an integer');
    const rows = this.#p.essences(); if (!rows.length) throw new Error('Ability essence registry is empty');
    return rows[Math.max(0, Math.min(rows.length - 1, tier - 1))];
  }
  #count(value: number): number {if (finite(value, 'Ability count') < 0) throw new Error('Negative ability count'); return value;}
  #balance(wallet: Record<string, number>, id: string): number {return this.#count(Object.hasOwn(wallet, id) ? wallet[id] : 0);}
  #put(wallet: Record<string, number>, id: string, count: number): void {Object.defineProperty(wallet, id, {value: count, writable: true, enumerable: true, configurable: true});}
  canAfford(seat: S, cost: AbilityCost): boolean {
    const def = this.#essence(cost.tier); return this.#balance(this.#p.wallet(seat), def.id) >= this.#count(cost.count);
  }
  #spend(seat: S, cost: AbilityCost, key: string): boolean {
    const p = this.#p, def = this.#essence(cost.tier), wallet = p.wallet(seat), have = this.#balance(wallet, def.id), count = this.#count(cost.count);
    if (have < count) {p.fail(seat, key, `needs ${count}× ${def.label}`); return false;}
    this.#put(wallet, def.id, have - count); p.markMetaDirty(seat); return true;
  }
  spend(seat: S, cost: AbilityCost, key: string): boolean {return this.#run(() => this.#spend(seat, cost, key));}
  grant(seat: S, tier: number, count: number): void {this.#run(() => {
    finite(count, 'Ability grant'); if (count <= 0) return;
    const p = this.#p, def = this.#essence(tier), wallet = p.wallet(seat), next = finite(this.#balance(wallet, def.id) + count, 'Ability balance');
    this.#put(wallet, def.id, next); p.text(p.position(seat), `+${count} ${def.label}`, def.color, 12, 'gains'); p.pickup(seat, def, count); p.markMetaDirty(seat);
  });}
  levelSkill(seat: S, id: string): boolean {return this.#run(() => {
    const p = this.#p, inst = p.known(seat, id);
    if (!inst && p.granted(seat, id)) {p.fail(seat, id + ':granted', "its level is the gear's to give"); return false;}
    if (!inst || inst.level >= p.skillMax(inst)) return false;
    const ability = p.ability(); if (!this.#spend(seat, ability.skillLevelCost(inst.level + 1), 'abilvl:' + id)) return false;
    inst.level++;
    if (inst.def.tree && !p.memoryRefusal(seat, id) && ability.pointsAtLevel(inst.level) > ability.pointsAtLevel(inst.level - 1)) p.awaken(seat, inst);
    p.markCharacterDirty(); return true;
  });}
  levelSupport(seat: S, gem: G): boolean {return this.#run(() => {
    const p = this.#p; if (gem.level >= p.supportMax(gem)) return false;
    if (!this.#spend(seat, p.ability().supportLevelCost(gem.level + 1), 'abilvl:' + gem.def.id)) return false;
    gem.level++; p.markCharacterDirty(); return true;
  });}
  pick(seat: S, skillId: string, nodeId: string): void {this.#run(() => {
    const p = this.#p, inst = p.known(seat, skillId) ?? p.granted(seat, skillId); if (!inst?.def.tree) return;
    const rules = p.tree(inst), node: SkillTreeNode | undefined = rules.node(nodeId); if (!node) return;
    if (skillTreeSpentCount(inst.treeNodes, nodeId) >= rules.nodeRanks(inst, nodeId)) return;
    const at = p.position(seat), sealed = p.memoryRefusal(seat, skillId) ?? rules.refusal(inst, nodeId);
    if (sealed) {p.text(atHeight(at, 20), sealed, '#8a8678', 11); return;}
    const reason = p.swapRefusal(seat); if (reason) {p.fail(seat, skillId + ':treepick', reason); return;}
    if (inst.def.delivery.type === 'summon') p.clearSummons(seat, inst);
    p.clearFields(seat, inst); inst.treeNodes = [...(inst.treeNodes ?? []), nodeId]; p.recalculate(seat); p.markCharacterDirty();
    const ranks = p.tree(inst).nodeRanks(inst, nodeId);
    p.text(atHeight(at, 20), ranks > 1 ? `${node.name} ${skillTreeSpentCount(inst.treeNodes, nodeId)}/${ranks}` : node.name, inst.def.color, 12);
  });}
  reset(seat: S, skillId: string): boolean {return this.#run(() => {
    const p = this.#p; if (!p.nearFont(seat)) return false;
    const inst = p.known(seat, skillId); if (!inst?.treeNodes?.length || p.memoryRefusal(seat, skillId)) return false;
    const reason = p.swapRefusal(seat); if (reason) {p.fail(seat, skillId + ':fontreset', reason); return false;}
    if (!this.#spend(seat, {tier: p.ability().tierForLevel(inst.level), count: p.font().reset.count}, 'fontreset:' + skillId)) return false;
    p.dismiss(seat, inst.def.id); p.clearSummons(seat, inst); p.clearFields(seat, inst);
    const trigger = p.trigger(inst); inst.treeNodes = undefined;
    if (trigger !== p.trigger(inst) && inst.state) {delete inst.state.triggerOff; delete inst.state.trigDepth;}
    delete inst.replenishmentPaused; p.recalculate(seat); p.markCharacterDirty();
    p.text(atHeight(p.position(seat), 20), 'the font unmakes the choice', '#b06bd4', 13); return true;
  });}
  convert(seat: S, tier: number, direction: 'up' | 'down'): boolean {return this.#run(() => {
    const p = this.#p; if (!p.nearFont(seat)) return false;
    if (!Number.isInteger(tier) || tier < 1 || tier > p.essences().length || !['up', 'down'].includes(direction)) return false;
    const from = this.#essence(tier), next = tier + (direction === 'up' ? 1 : -1);
    if (next < 1 || next > p.essences().length) return false;
    const to = this.#essence(next), font = p.font(), wallet = p.wallet(seat), debit = direction === 'up' ? integer(font.convertUp, 1, 'Upward conversion') : 1, credit = direction === 'up' ? 1 : integer(font.convertDown, 1, 'Downward conversion');
    const have = this.#balance(wallet, from.id), gain = finite(this.#balance(wallet, to.id) + credit, 'Converted balance');
    if (have < debit) {p.fail(seat, 'fontconv:' + from.id, direction === 'up' ? `the font asks ${debit}× ${from.label}` : `no ${from.label} to break`); return false;}
    this.#put(wallet, from.id, have - debit); this.#put(wallet, to.id, gain);
    p.text(p.position(seat), `${debit}× ${from.glyph} → ${credit}× ${to.glyph} ${to.label}`, to.color, 12); p.markCharacterDirty(); return true;
  });}
  merge(seat: S, skillId: string, rarity: string): boolean {return this.#run(() => {
    const p = this.#p; if (!p.nearFont(seat)) return false;
    const plan = p.mergePlan(seat, skillId, rarity);
    if (plan.refusal || !plan.result) {p.fail(seat, 'fontmerge:' + skillId, plan.refusal ?? 'Merging is unavailable.'); return false;}
    const returned: G[] = [];
    for (const item of plan.returnSockets) {const sockets = p.sockets(item); if (!sockets) return false; for (const support of sockets) if (support) returned.push(support);}
    for (const item of plan.taken) p.remove(seat, item);
    p.grantSkill(seat, plan.result); for (const support of returned) p.grantSupport(seat, support);
    p.markCharacterDirty(); p.announceMerge(seat, plan.result); return true;
  });}
}
