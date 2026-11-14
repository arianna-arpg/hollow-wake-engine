import {memoryDeliveryCodec,type MemoryDeliveryDefinitions} from './memory-delivery.js';
import {CraftingSessionData,type CraftingSessionDefinitions} from './crafting-session-data.js';
import {copySessionJSON,requireSession as need,sessionFields as fields,sessionBoolean as bool,type SessionJSON} from './session-json.js';

/** Bare-gem obligations use the shared validator without allocating an item
 * wrapper or consuming a UID. Complete character authority owns the obligation. */
export function createCharacterDeliveryCodec(definitions:CraftingSessionDefinitions,kinds?:MemoryDeliveryDefinitions):(raw:unknown)=>SessionJSON {
  const data=new CraftingSessionData(definitions),memory=memoryDeliveryCodec(definitions,kinds);
  return raw=>{
    const drop=copySessionJSON(raw);if(drop&&typeof drop==='object'&&!Array.isArray(drop)&&drop.kind==='memory')return memory(drop);fields(drop,['kind','gem','locked']);if(drop.locked!==undefined)bool(drop.locked);
    need(drop.kind===(drop.gem as {kind?:unknown}|null|undefined)?.kind,'delivery-kind-mismatch');
    if(drop.kind==='skill')data.retainedSkillPayload(drop.gem);
    else{
      need(drop.kind==='support','unknown-delivery-kind');fields(drop.gem,['kind','supportId','level','rolled']);
      const {kind,...support}=drop.gem;data.supportState(support);
    }
    return drop;
  };
}
