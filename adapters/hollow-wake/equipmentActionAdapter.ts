import { EquipmentActions } from '@hollow-wake/engine/inventory/equipment';
import { EQUIP_SLOTS, SLOT_BY_ID, type ItemInstance } from './items';
import { ITEM_BASES } from '../data/itembases';
import { UNIQUES } from '../data/uniques';
import { itemGridSize, itemLevelReq } from './itemgen';
export type { EquipmentContext, ContainerActionContext } from '@hollow-wake/engine/inventory/equipment';
export const sdkEquipmentActions = new EquipmentActions<ItemInstance>({
  slots: () => EQUIP_SLOTS,
  slot: id => SLOT_BY_ID[id],
  footprint: itemGridSize,
  base: item => ITEM_BASES[item.baseId],
  level: itemLevelReq,
  unique: item => item.uniqueId ? UNIQUES[item.uniqueId] : undefined,
});
