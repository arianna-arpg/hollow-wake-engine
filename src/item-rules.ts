import { itemOperations } from './item-core.js';
import { validateItemPack, validateMint, validateItem } from './item-validation.js';
import { copy, freeze, integer } from './validation.js';
import { Random } from './random.js';
import type { RandomState, Modifier } from './types.js';
import type { ItemRulePack, ItemInstance, ItemRollOptions, ItemForgeOptions, OwnStatFold, UniqueChoiceRoll } from './item-types.js';
export type { ItemRulePack, ItemInstance, ItemRollOptions, ItemForgeOptions, OwnStatFold, UniqueChoiceRoll } from './item-types.js';

/** Shared immutable definitions. Original insertion order is significant. */
export class ItemContent {
  readonly pack: ItemRulePack;
  constructor(pack: ItemRulePack) {
    const owned = copy(pack);
    validateItemPack(owned);
    // Guard dictionary lookups against inherited names even for rejected mint ids.
    for (const field of ['bases','affixes','uniques','vestiges'] as const) Object.setPrototypeOf(owned[field], null);
    this.pack = freeze(owned);
    Object.freeze(this);
  }
  get id(): string { return this.pack.id; }
}
export interface ItemRulesSnapshot { version: 1; contentId: string; random: RandomState; nextUid: number }

/** Item values derive from saved rolls. Mint RNG and numeric identity are owned by this instance. */
export class ItemRules {
  #content: ItemContent;
  get content(): ItemContent { return this.#content; }
  #random: Random;
  #nextUid: number;
  #ops: ReturnType<typeof itemOperations>;
  constructor(content: ItemContent | ItemRulePack, seed = 1, nextUid = 1) {
    this.#content = content instanceof ItemContent ? content : new ItemContent(content);
    this.#random = new Random(seed); integer(nextUid, 1, 'Next item uid'); this.#nextUid = nextUid;
    this.#ops = itemOperations(this.content.pack, () => this.#nextUid++);
  }
  #mint(options: ItemRollOptions | ItemForgeOptions, forge: boolean): ItemInstance | null {
    const owned = copy(options); validateMint(owned, forge);
    if (this.#nextUid >= Number.MAX_SAFE_INTEGER) throw new Error('Item identity space exhausted');
    const random = this.#random.snapshot(), uid = this.#nextUid;
    try {
      const rng = () => this.#random.next();
      return forge ? this.#ops.forgeItem({ ...owned, rng }) : this.#ops.rollItem({ ...owned, rng });
    } catch (error) {
      this.#random = Random.restore(random); this.#nextUid = uid; throw error;
    }
  }
  roll(options: ItemRollOptions): ItemInstance | null { return this.#mint(options, false); }
  forge(options: ItemForgeOptions): ItemInstance | null { return this.#mint(options, true); }
  compile(item: ItemInstance): Modifier[] {
    validateItem(item, this.content.pack);
    return copy(this.#ops.compileItemMods(item));
  }
  ownStats(item: ItemInstance): OwnStatFold[] {
    validateItem(item, this.content.pack);
    return this.#ops.foldOwnStats(this.content.pack.bases[item.baseId], item);
  }
  resolveChoices(item: ItemInstance): Record<string, UniqueChoiceRoll> | null {
    validateItem(item, this.content.pack);
    return item.uniqueId ? this.#ops.resolveUniqueChoices(item, this.content.pack.uniques[item.uniqueId]) ?? null : null;
  }
  /** A host restoring items must supply the highest numeric id already owned by this allocator. */
  bumpUidFloor(seen: number): void {
    integer(seen, 0, 'Seen item uid');
    if (seen >= Number.MAX_SAFE_INTEGER) throw new Error('Item identity space exhausted');
    this.#nextUid = Math.max(this.#nextUid, seen + 1);
  }
  snapshot(): ItemRulesSnapshot { return { version: 1, contentId: this.content.id, random: this.#random.snapshot(), nextUid: this.#nextUid }; }
  static restore(content: ItemContent | ItemRulePack, snapshot: ItemRulesSnapshot): ItemRules {
    const defs = content instanceof ItemContent ? content : new ItemContent(content);
    if (snapshot.version !== 1 || snapshot.contentId !== defs.id) throw new Error('Item state belongs to a different content version');
    const rules = new ItemRules(defs, 1, snapshot.nextUid); rules.#random = Random.restore(snapshot.random); return rules;
  }
}
