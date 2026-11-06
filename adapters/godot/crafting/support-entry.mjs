import {create as createCrafting} from './entry.mjs';
import {WorkshopSupports} from '@hollow-wake/engine/skills/workshop-supports';
export {dispatch} from './entry.mjs';
export const create=table=>createCrafting(table,new WorkshopSupports());
