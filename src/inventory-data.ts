import {InventoryDataCore,type InventoryDataState} from './inventory-data-core.js';
import {copySessionJSON,sessionFields as fields} from './session-json.js';
export type {InventoryDataDefinitions,InventoryDataState} from './inventory-data-core.js';

/** Account-free Inventory facade. Shared validation also serves legacy formats,
 * while raw imports are bounded and detached before returning to the host. */
export class InventoryData extends InventoryDataCore {
  /** Bound, detach and validate raw character data before the host owns it.
   * Rack/book callbacks are trusted synchronous validation policy. */
  admit(input:unknown,validateRack?:(rack:unknown,data:InventoryData)=>void,
    validateBook?:(book:unknown,data:InventoryData)=>void):InventoryDataState {
    return this.inventory(copySessionJSON(input),validateRack,validateBook);
  }
  /** Validate already inert JSON in place. The caller keeps ownership. */
  inventory(input: unknown, validateRack?: (rack:unknown,data:InventoryData)=>void,
    validateBook?: (book:unknown,data:InventoryData)=>void): InventoryDataState {
    fields(input,['board','items','equipped','overflow','essences','rack','vestiges','skillBook']);
    this.checkInventoryBody(input,validateRack,validateBook);
    return input as unknown as InventoryDataState;
  }
}
