import type {ItemInstance, UniqueChoiceRoll} from './item-types.js';

/** Trusted live reads. Callbacks are synchronous; preceding writes survive a throw.
 * This compatibility seam borrows saved cargo. Validate and detach external JSON
 * before calling it from an owned session. Definitions may be shared immutable data.
 */
export interface ItemRestorationPorts<I extends ItemInstance = ItemInstance> {
  base(id: string): {category: string} | undefined;
  affix(id: string): {tiers: readonly unknown[]} | undefined;
  hasUnique(id: string): boolean;
  hasVestige(id: string): boolean;
  socketCap(category: string): number;
  bumpUidFloor(seen: number): void;
  resolveChoices(item: I): Record<string, UniqueChoiceRoll> | undefined;
}

/** Tolerant restoration against current content, preserving native alias/order rules. */
export function createItemRestoration<I extends ItemInstance>(ports: ItemRestorationPorts<I>) {
  function rebuildItem(saved: I): I | null {
    const base = ports.base(saved.baseId);
    if (!base) return null;
    if (saved.uniqueId && !ports.hasUnique(saved.uniqueId)) return null;
    const item = {
      ...saved,
      affixes: (saved.affixes ?? []).filter(affix => {
        const def = ports.affix(affix.id);
        if (!def) return false;
        affix.tier = Math.max(0, Math.min(def.tiers.length - 1, affix.tier));
        return true;
      }),
      implicitRolls: saved.implicitRolls ?? [],
    };
    if (item.sockets) {
      item.sockets = item.sockets.slice(0, Math.max(1, ports.socketCap(base.category)))
        .map(id => id && ports.hasVestige(id) ? id : null);
      if (item.sockets.length === 0) delete item.sockets;
    }
    ports.bumpUidFloor(item.uid);
    if (item.uniqueId) item.uniqueChoices = ports.resolveChoices(item);
    return item;
  }
  return Object.freeze({rebuildItem});
}
