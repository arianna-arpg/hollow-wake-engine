import {WorkshopVestiges} from './workshop-vestiges.js';
import {WorkshopRack,type WorkshopResidence,type WorkshopSignal} from './workshop-rack.js';
import type {CraftingSessionData,CraftingSessionState} from './crafting-session-data.js';
import type {ItemInstance} from './item-types.js';import type {GemSkill} from './gem-residence.js';
import type {InventoryHost,LiveInventoryBoard} from './inventory-host.js';
import {requireSession as need,sessionFields as fields,sessionArray as array,sessionText as text} from './session-json.js';

/** Private structural carrier, always followed by complete build admission.
 * No public save boundary may expose this validator on its own. */
export class WorkshopCompleteCargo extends WorkshopVestiges {
  readonly validateBook=(input:unknown,data:CraftingSessionData):void=>{
    fields(input,['known','bar']);array(input.known,8);array(input.bar,8);
    need(input.bar.length===8&&input.known.every(row=>row!==null),'invalid-complete-book');
    WorkshopRack.prototype.validate([...input.known,...Array(8-input.known.length).fill(null)],{
      skillPayload:gem=>data.retainedSkillPayload(gem),
    });
    const bound=new Set<string>();for(const id of input.bar)if(id!==null){text(id);need(!bound.has(id),'duplicate-bar-skill');bound.add(id);}
  };
  override readonly handles=(op:string)=>op==='grant-vestige'||op==='inlay-vestige';
  override move<S extends GemSkill>(request:Record<string,unknown>,state:CraftingSessionState,inventory:InventoryHost<ItemInstance>,
    board:LiveInventoryBoard,gems:WorkshopResidence<S>,signal?:WorkshopSignal){
    need(this.handles(request.op as string),'complete-skill-route-required');
    return super.move(request,state,inventory,board,gems,signal);
  }
}
