import {InventoryDataCore,type InventoryDataDefinitions,type InventoryDataState} from './inventory-data-core.js';
import type {CraftLore} from './crafting.js';
import {requireSession as need,sessionFields as fields,sessionRecord as record,sessionInteger as integer,sessionText as text,sessionArray as array,sessionBoolean as bool} from './session-json.js';

export interface CraftingSessionState extends InventoryDataState {
  account:{craftLore:CraftLore;ledger:Record<string,number>;features:string[];progression:boolean};
}
export interface CraftingSessionDefinitions extends InventoryDataDefinitions {}
export function craftingSaveVersion(state: {vestiges?:unknown;rack?:unknown;skillBook?:unknown}) {
  return state.skillBook!==undefined ? 4 : state.vestiges!==undefined ? 3 : state.rack!==undefined ? 2 : 1;
}

/** Legacy account-bearing format over the shared account-free cargo admission.
 * Existing field checks, callback ordering and retained-item overrides remain. */
export class CraftingSessionData extends InventoryDataCore {
  readonly #families:Set<string>;
  constructor(definitions:CraftingSessionDefinitions){
    super(definitions);
    this.#families=new Set(Object.values(definitions.crafting.items.pack.affixes).map(a=>a.family));
  }
  state(input:unknown,validateRack?:(rack:unknown,data:CraftingSessionData)=>void,admittedAccount?:unknown,
    validateBook?:(book:unknown,data:CraftingSessionData)=>void):CraftingSessionState {
    fields(input,['board','items','equipped','overflow','essences','account','rack','vestiges','skillBook']);
    this.checkInventoryBody(input,validateRack,validateBook);
    if(admittedAccount!==undefined && input.account===admittedAccount)return input as unknown as CraftingSessionState;
    const a = input.account; fields(a,['craftLore','ledger','features','progression']); bool(a.progression); array(a.features);a.features.forEach(text);
    need(new Set(a.features).size === a.features.length,'duplicate-feature'); record(a.craftLore); record(a.ledger);
    for (const [id,n] of Object.entries(a.ledger)) {text(id); integer(n);}
    for (const [family,entry] of Object.entries(a.craftLore)) {
      need(this.#families.has(family),'unknown-craft-family'); fields(entry,['rank','progress']);
      const steps = this.inventoryDefinitions.crafting.pack.craft.stepsPerRank;
      integer(entry.rank,0,steps.length); integer(entry.progress,0,(steps[entry.rank] ?? 1) - 1);
    }
    return input as unknown as CraftingSessionState;
  }
}
