import { ItemContent } from './item-rules.js';
import { itemOperations } from './item-core.js';
import { validateMint, validateItem } from './item-validation.js';
import { copy, integer } from './validation.js';
import type { ItemRollOptions, ItemForgeOptions, ItemInstance } from './item-types.js';

/** Explicit compatibility boundary for a host that already owns its RNG and identity stream.
 * Ports are trusted state owners. If a port throws, its already-consumed state cannot be rolled back here.
 * Construct a new host after replacing content; this instance always retains its immutable content.
 */
export function createItemHost(content: ItemContent, nextUid: () => number) {
  if (!(content instanceof ItemContent) || typeof nextUid !== 'function') throw new Error('Invalid item host ports');
  const ops = itemOperations(content.pack, () => integer(nextUid(), 1, 'Host item uid'));
  let minting = false;
  const mint = (options: ItemRollOptions | ItemForgeOptions, random: () => number, forge: boolean): ItemInstance | null => {
    if (minting) throw new Error('Reentrant item mint');
    const owned = copy(options); validateMint(owned, forge);
    if (typeof random !== 'function') throw new Error('Host random port is required');
    const rng = () => {
      const value = random();
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Host random value must be in [0,1)');
      return value;
    };
    minting = true;
    try { return forge ? ops.forgeItem({...owned,rng}) : ops.rollItem({...owned,rng}); }
    finally { minting = false; }
  };
  return Object.freeze({
    content,
    roll: (options: ItemRollOptions, random: () => number) => mint(options,random,false),
    forge: (options: ItemForgeOptions, random: () => number) => mint(options,random,true),
    compile(item: ItemInstance) { validateItem(item,content.pack); return copy(ops.compileItemMods(item)); },
    ownStats(item: ItemInstance) { validateItem(item,content.pack); return ops.foldOwnStats(content.pack.bases[item.baseId],item); },
    resolveChoices(item: ItemInstance) {
      validateItem(item,content.pack);
      return item.uniqueId ? ops.resolveUniqueChoices(item,content.pack.uniques[item.uniqueId]) ?? null : null;
    },
  });
}
export type ItemHost = ReturnType<typeof createItemHost>;
