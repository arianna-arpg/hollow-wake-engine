import {createGemCargo,type GemDefinition,type GemSkill,type GemSupport} from './gem-residence.js';
import type {CraftingSessionDefinitions} from './crafting-session-data.js';
import type {ItemInstance,GemSocketRow} from './item-types.js';
import type {InventoryHost,LiveInventoryBoard} from './inventory-host.js';
import type {CharacterCommandDraft} from './character-command-types.js';
import type {CharacterGemDelivery} from './character-delivery-types.js';
import {copySessionJSON,requireSession as need,sessionFields as fields,sessionInteger as integer} from './session-json.js';

interface PickupDefinition extends GemDefinition {color?:string}
export interface CharacterPickupPorts {
  saved:CharacterCommandDraft;admitDrop(raw:unknown):CharacterGemDelivery;
  inventory:Pick<InventoryHost<ItemInstance>,'autoPlace'>;
  definitions:{workshop:CraftingSessionDefinitions;catalogue:{
    skills:Readonly<Record<string,PickupDefinition>>;supports:Readonly<Record<string,PickupDefinition>>;
  }};
}
export type CharacterPickupEvent=
  | {kind:'refusal';key:'bagfull';reason:'inventory full'}
  | {kind:'text';message:string;color:string|undefined;size:13|14;lane:'pickup'}
  | {kind:'pickup';label:string;color:string|undefined;count:1}
  | {kind:'meta-dirty'};
export interface CharacterPickupResult {
  accepted:boolean;changed:true;needsSave:true;deliveryId:number;events:CharacterPickupEvent[];
  request:CharacterCommandDraft&{capability:'character-workshop/residence-diagnostic'};
}
const own=<T>(rows:Readonly<Record<string,T>>,id:string):T|undefined=>Object.hasOwn(rows,id)?rows[id]:undefined;

/** Trusted host conditions resolve the durable delivery after reach, grace,
 * story and recipient checks. Requests supply only its address. Failed placement
 * consumes the wrapper UID, and never retires the obligation itself. */
export function changeCharacterPickup(ports:CharacterPickupPorts,rawRequest:unknown,rawConditions:unknown):CharacterPickupResult {
  const request=copySessionJSON(rawRequest),conditions=copySessionJSON(rawConditions);
  fields(request,['op','deliveryId']);need(request.op==='pickup','unsupported-pickup-command');integer(request.deliveryId,1);
  fields(conditions,['drop']);const drop=ports.admitDrop(conditions.drop);
  const saved=copySessionJSON(ports.saved) as unknown as CharacterCommandDraft,state=saved.state,catalogue=ports.definitions.catalogue;
  const next=()=>{integer(saved.nextUid,1,Number.MAX_SAFE_INTEGER-1);return saved.nextUid++;};
  const unused=():never=>{throw Error('Pickup cannot cold-restore investment');};
  const cargo=createGemCargo<PickupDefinition,PickupDefinition,GemSkill<PickupDefinition,PickupDefinition>,ItemInstance>({
    skill:id=>own(catalogue.skills,id),support:id=>own(catalogue.supports,id),hasForm:unused,makeSkill:unused,validTreeNodes:unused,
    nextUid:next,bagWidth:()=>state.board.w,bagHeight:()=>state.board.h,itemGridSize:item=>ports.definitions.workshop.crafting.items.pack.bases[item.baseId]});
  const support=(row:GemSocketRow):GemSupport<PickupDefinition>=>({...row,def:catalogue.supports[row.supportId]});
  let item:ItemInstance,definition:PickupDefinition;
  if(drop.kind==='support'){
    const inst=support(drop.gem);if(drop.locked)inst.locked=true;
    item=cargo.makeSupportGemItem(inst);definition=inst.def;
  }else{
    const gem=drop.gem,inst:GemSkill<PickupDefinition,PickupDefinition>={...gem,def:catalogue.skills[gem.skillId],sockets:gem.sockets.map(row=>row?support(row):null)};
    if(drop.locked)inst.locked=true;item=cargo.makeSkillGemItem(inst);definition=inst.def;
  }
  const rows=state.board.rows,board:LiveInventoryBoard={w:state.board.w,h:state.board.h,...(rows?{open:(x:number,y:number)=>rows[y][x]==='#'}:{})};
  const accepted=ports.inventory.autoPlace(state.items,item,board),events:CharacterPickupEvent[]=[];
  if(!accepted)events.push({kind:'refusal',key:'bagfull',reason:'inventory full'});
  else{
    const grade=drop.kind==='skill'?ports.definitions.workshop.skills.pack.services?.rarities.find(row=>row.id===drop.gem.rarity):undefined;
    need(drop.kind!=='skill'||grade,'unknown-pickup-rarity');
    const name=item.name,color=grade?.color??definition.color;
    events.push({kind:'text',message:drop.kind==='support'?name+' (support)':name+' ('+grade!.label.toLowerCase()+' skill)',color,size:drop.kind==='support'?13:14,lane:'pickup'},
      {kind:'pickup',label:drop.kind==='support'?name+' (Support Memory)':name+' ('+grade!.label+')',color,count:1},{kind:'meta-dirty'});
  }
  return{accepted,changed:true,needsSave:true,deliveryId:request.deliveryId,events,
    request:{capability:'character-workshop/residence-diagnostic',state,character:saved.character,nextUid:saved.nextUid}};
}
