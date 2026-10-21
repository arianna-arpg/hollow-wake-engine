import { RelicActions } from '@hollow-wake/engine/inventory/actions';
import type { ItemInstance } from './items';
import { ITEM_BASES } from '../data/itembases';
import { UNIQUES } from '../data/uniques';
import { itemGridSize, itemLevelReq } from './itemgen';
import { sdkRelics } from './accountRelicRuntime';
export { relicCanManage, relicEquipmentRefusal } from '@hollow-wake/engine/inventory/actions';
export type { RelicAccess, RelicActionContext } from '@hollow-wake/engine/inventory/actions';
export const sdkRelicActions = new RelicActions<ItemInstance>(sdkRelics, {
  footprint: itemGridSize,
  base: item => ITEM_BASES[item.baseId],
  level: itemLevelReq,
  unique: item => item.uniqueId ? UNIQUES[item.uniqueId] : undefined,
  isRelic: item => ITEM_BASES[item.baseId]?.category === 'relic',
});
