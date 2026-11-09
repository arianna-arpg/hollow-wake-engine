import {CraftingSessionData,type CraftingSessionDefinitions} from './crafting-session-data.js';
import type {ItemInstance} from './item-types.js';
import type {ProgressionRelic} from './progression-session.js';
import type {RelicState} from './relic-custody.js';
import {freeze} from './validation.js';
import {copySessionJSON,requireSession as need,sessionFields as fields,sessionArray as array,
  sessionInteger as integer,sessionText as text,type SessionJSON} from './session-json.js';

const identity=(definitions:CraftingSessionDefinitions)=>copySessionJSON([
  definitions.crafting.items.id,definitions.crafting.pack.contentId,definitions.skills.pack.contentId,
  Object.entries(definitions.memoryKinds).sort(([a],[b])=>a<b?-1:a>b?1:0)]);

/** Typed interpretation is explicit in the account owner's v2 envelope. The
 * payload owns the complete saved item; outer identity/geometry are checked
 * indexes for the existing progression/storage kernel, never another body. */
export class AccountRelicItems {
  readonly content:SessionJSON;
  readonly #identity:string;
  readonly #data:CraftingSessionData;
  readonly #definitions:CraftingSessionDefinitions;
  constructor(definitions:CraftingSessionDefinitions) {
    this.#definitions=definitions;this.#data=new CraftingSessionData(definitions);
    this.content=freeze(identity(definitions));
    this.#identity=JSON.stringify(this.content);Object.freeze(this);
  }
  matchesContent(value:unknown):boolean {return JSON.stringify(copySessionJSON(value))===this.#identity;}
  matchesDefinitions(definitions:CraftingSessionDefinitions):boolean {return this.matchesContent(identity(definitions));}
  #item(value:unknown,ids:Set<number>,keys:Set<string>):ItemInstance {
    const item=this.#data.item(value);integer(item.uid,1,0xffffffff);text(item.relicKey);
    need(this.#definitions.crafting.items.pack.bases[item.baseId].category==='relic','not-account-relic');
    need(!ids.has(item.uid)&&!keys.has(item.relicKey),'duplicate-relic-body');ids.add(item.uid);keys.add(item.relicKey);
    return item;
  }
  #copy(input:unknown) {
    const state=copySessionJSON(input);
    fields(state,['items','seated','carried','released','enabled','rank','invested','stash']);array(state.items,512);
    return state;
  }
  /** Item admission only. The owner also admits complete progression, custody
   * and storage state with ProgressionSession. No repair, reorder or UID minting
   * happens here. Detached bodies retain their saved field and array order. */
  decode(input:RelicState<ProgressionRelic>):RelicState<ItemInstance> {
    const state=this.#copy(input),ids=new Set<number>(),keys=new Set<string>();
    const items=(state.items as unknown[]).map(row=>{
      fields(row,['uid','relicKey','w','h','x','y','payload']);
      const item=this.#item(row.payload,ids,keys),size=this.#definitions.crafting.items.pack.bases[item.baseId];
      need(row.uid===item.uid&&row.relicKey===item.relicKey,'relic-identity-mismatch');
      need(row.w===size.w&&row.h===size.h&&row.x===item.x&&row.y===item.y,'relic-geometry-mismatch');
      return item;
    });
    return {...state,items} as unknown as RelicState<ItemInstance>;
  }
  /** Explicit conversion of canonical item bodies into the existing storage
   * carrier. Metadata is derived from the body in the same operation. */
  encode(input:RelicState<ItemInstance>):RelicState<ProgressionRelic> {
    const state=this.#copy(input),ids=new Set<number>(),keys=new Set<string>();
    const items=(state.items as unknown[]).map(row=>{
      const item=this.#item(row,ids,keys),size=this.#definitions.crafting.items.pack.bases[item.baseId];
      return {uid:item.uid,relicKey:item.relicKey!,w:size.w,h:size.h,
        ...(item.x===undefined?{}:{x:item.x,y:item.y}),payload:item};
    });
    return {...state,items} as unknown as RelicState<ProgressionRelic>;
  }
}
