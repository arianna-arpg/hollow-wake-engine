import {CraftingSession} from './crafting-session-complete.js';
import {WorkshopCompleteCargo} from './workshop-complete-cargo.js';
import type {CraftingSessionDefinitions,CraftingSessionState} from './crafting-session-data.js';
import type {EquipmentSlots} from './equipment-actions.js';
import {copySessionJSON,requireSession as need,sessionRecord as record,sessionText as text,type SessionJSON} from './session-json.js';

const routes:Readonly<Record<string,true>>=Object.freeze({equip:true,unequip:true,options:true,'station-view':true,
  recover:true,'take-overflow':true,mint:true,craft:true,socket:true,reroll:true,salvage:true,'salvage-bulk':true,
  lock:true,'grant-vestige':true,'inlay-vestige':true});
type JSONRecord=Record<string,SessionJSON>;
export interface CharacterInventoryDefinitions {workshop:CraftingSessionDefinitions;equipment:EquipmentSlots}
export interface CharacterInventoryDraft {state:Omit<CraftingSessionState,'account'>;nextUid:number}
export interface CharacterInventoryScope {account:CraftingSessionState['account']}
export interface CharacterInventoryResult {reply:JSONRecord;save?:SessionJSON}
const replyObject=(value:unknown):JSONRecord=>{record(value);return value as JSONRecord;};

/** Internal detached inventory carrier. Account authority owns the RNG and the
 * returned account delta. Complete build admission must follow this operation;
 * these structural results are not ready for storage or live publication. */
export class CharacterInventoryCommands {
  readonly #kernel:CraftingSession;
  readonly #identity:unknown[];
  constructor(definitions:CharacterInventoryDefinitions){
    const d=definitions.workshop;
    this.#kernel=new CraftingSession(d,1,new WorkshopCompleteCargo(d.crafting.items));
    this.#kernel.configureEquipment(definitions.equipment);
    this.#identity=[d.crafting.items.id,d.crafting.pack.contentId,d.skills.pack.contentId,
      Object.entries(d.memoryKinds).sort(([a],[b])=>a<b?-1:a>b?1:0)];
  }
  execute(saved:CharacterInventoryDraft,scope:CharacterInventoryScope,rawRequest:unknown,rawRandom:unknown):CharacterInventoryResult {
    const request=copySessionJSON(rawRequest),random=copySessionJSON(rawRandom);record(request);text(request.op);
    need(Object.hasOwn(routes,request.op),'complete-skill-route-required');need(!Object.hasOwn(request,'profile'),'implicit-profile-command');
    const state={...saved.state,account:scope.account},save={schemaVersion:1,capability:'crafting-session/complete-diagnostic',
      content:this.#identity,random,nextUid:saved.nextUid,state};
    const opened=replyObject(this.#kernel.command({op:'restore',profile:0,save}));
    need(opened.ok,typeof opened.reason==='string'?opened.reason:'inventory-carrier-refused');
    try{
      const reply=replyObject(this.#kernel.command({...request,profile:0}));
      if(!reply.ok)return{reply};
      const result=replyObject(this.#kernel.command({op:'save',profile:0}));need(result.ok,'inventory-carrier-save-refused');
      return{reply,save:result.save};
    }finally{
      const closed=replyObject(this.#kernel.command({op:'close',profile:0}));need(closed.ok,'inventory-carrier-close-refused');
    }
  }
}
