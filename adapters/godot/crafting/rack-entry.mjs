import {create as createCrafting} from './entry.mjs';
import {WorkshopRack} from '@hollow-wake/engine/skills/workshop-rack';
export {dispatch} from './entry.mjs';
export const create=table=>createCrafting(table,new WorkshopRack());
