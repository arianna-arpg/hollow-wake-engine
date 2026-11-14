import {CraftingSessionData,type CraftingSessionDefinitions} from './crafting-session-data.js';
import type {CharacterGemDelivery} from './character-delivery-types.js';
import type {RoughMemoryUnit} from './item-types.js';
import {copySessionJSON,requireSession as need,sessionFields as fields,sessionText as text,sessionArray as array,type SessionJSON} from './session-json.js';
import {mintMemoryPouch} from './gem-drop.js';
export interface MemoryDeliveryDefinition {readonly base:string;readonly name:string;readonly color:string}
export type MemoryDeliveryDefinitions=Readonly<Record<string,MemoryDeliveryDefinition>>;
export interface CharacterMemoryDelivery {kind:'memory';memoryKind:string;units:RoughMemoryUnit[]}
export type CharacterDelivery=CharacterGemDelivery|CharacterMemoryDelivery;
export function memoryDeliveryDefinition(definitions:CraftingSessionDefinitions,kinds:MemoryDeliveryDefinitions|undefined,kind:string):MemoryDeliveryDefinition {
 const definition=kinds&&Object.hasOwn(kinds,kind)?kinds[kind]:undefined;
 need(definition&&definitions.memoryKinds[definition.base]===kind,'unknown-memory-delivery-kind');return definition;
}
/** Delivery identity is owned by the outbox; the destination owns inventory IDs.
 * Admission validates a temporary wrapper without consuming any identity. */
export function memoryDeliveryCodec(definitions:CraftingSessionDefinitions,kinds:MemoryDeliveryDefinitions|undefined){
 const data=new CraftingSessionData(definitions);
 return(raw:unknown):SessionJSON=>{
  const value=copySessionJSON(raw);fields(value,['kind','memoryKind','units']);need(value.kind==='memory','invalid-memory-delivery');text(value.memoryKind);array(value.units);need(value.units.length>0,'empty-memory-delivery');
  const def=memoryDeliveryDefinition(definitions,kinds,value.memoryKind);data.item(mintMemoryPouch(def,1,value.units as unknown as RoughMemoryUnit[]));
  return value;
 };
}
