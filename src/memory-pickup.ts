import type {CharacterPickupPorts,CharacterPickupResult,CharacterPickupEvent} from './character-pickup-commands.js';
import {requireSession as need,sessionInteger as integer} from './session-json.js';
import type {CharacterCommandDraft} from './character-command-types.js';
import type {LiveInventoryBoard} from './inventory-host.js';
import {mintMemoryPouch} from './gem-drop.js';
import {memoryDeliveryDefinition,type CharacterMemoryDelivery,type MemoryDeliveryDefinitions} from './memory-delivery.js';
/** The caller already admitted the delivery and owns this detached draft. */
export function pickupMemory(ports:Omit<CharacterPickupPorts,'admitDrop'>&{definitions:CharacterPickupPorts['definitions']&{memoryDelivery?:MemoryDeliveryDefinitions}},saved:CharacterCommandDraft,drop:CharacterMemoryDelivery,deliveryId:number):CharacterPickupResult {
 const state=saved.state,definition=memoryDeliveryDefinition(ports.definitions.workshop,ports.definitions.memoryDelivery,drop.memoryKind);
 const existing=state.items.find(item=>item.mem!==undefined&&item.baseId===definition.base);
 const events:CharacterPickupEvent[]=[];let accepted=true,total=0;
 if(existing){need(existing.mem,'missing-memory-pouch');existing.mem=[...existing.mem,...drop.units];total=existing.mem.length;}
 else{
  integer(saved.nextUid,1,Number.MAX_SAFE_INTEGER-1);const item=mintMemoryPouch(definition,saved.nextUid,drop.units);
  const rows=state.board.rows,board:LiveInventoryBoard={w:state.board.w,h:state.board.h,...(rows?{open:(x:number,y:number)=>rows[y][x]==='#'}:{})};
  accepted=ports.inventory.autoPlace(state.items,item,board);
  if(accepted){saved.nextUid++;total=drop.units.length;}
 }
 if(!accepted)events.push({kind:'refusal',key:'bagfull',reason:'inventory full'});
 else{const label=definition.name+' (×'+total+')';events.push({kind:'text',message:label,color:definition.color,size:13,lane:'pickup'},{kind:'pickup',label,color:definition.color,count:1},{kind:'meta-dirty'});}
 return{accepted,changed:accepted,needsSave:accepted,deliveryId,events,request:{capability:'character-workshop/residence-diagnostic',state,character:saved.character,nextUid:saved.nextUid}};
}
