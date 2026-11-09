import {WorkshopRack,type WorkshopResidence,type WorkshopSignal} from './workshop-rack.js';
import {SupportActions,type SocketSkill} from './support-actions.js';
import type {GemSkill} from './gem-residence.js';
import type {GemSocketRow,ItemInstance} from './item-types.js';
import type {CraftingSessionState} from './crafting-session-data.js';
import type {InventoryHost,LiveInventoryBoard} from './inventory-host.js';
import {sessionFields as fields,sessionText as text,sessionInteger as integer,sessionBoolean as bool,requireSession as need} from './session-json.js';

/** Support custody for learned and carried skills. The host supplies its active
 * discipline hold, and its exact instance/crew fit verdict for installation. */
export class WorkshopSupports extends WorkshopRack {
  override readonly accountPreservingMove=WorkshopSupports.prototype.move;
  override readonly handles=(op:string)=>op==='socket-support'||op==='unsocket-support';
  override move<S extends GemSkill>(request:Record<string,unknown>,state:CraftingSessionState,inventory:InventoryHost<ItemInstance>,
    board:LiveInventoryBoard,gems:WorkshopResidence<S>,signal?:WorkshopSignal){
    if(!this.handles(request.op as string))return super.move(request,state,inventory,board,gems,signal);
    const install=request.op==='socket-support';
    fields(request,install?['op','profile','uid','skillId','fits','hold']:['op','profile','uid','skillId','index','supportId','hold']);
    const {skillId,uid,index,supportId,hold}=request;
    text(skillId);if(hold!==null)text(hold);
    if(install||uid!==undefined)integer(uid,1);
    if(install)bool(request.fits);else {integer(index,0,1023);text(supportId);}
    const stored=!install&&uid!==undefined;
    const item=state.items.find(i=>i.uid===uid);
    const skill=stored?item?.gem:(state.skillBook?.known??state.rack)?.find(row=>row?.gem.skillId===skillId)?.gem;
    if(skill?.kind!=='skill'||skill.skillId!==skillId||(!install&&skill.sockets[index as number]?.supportId!==supportId))
      return {changed:false,needsSave:false,refusal:'stale-socket'};
    const target={def:{id:skillId},sockets:skill.sockets};
    let refusal:string|undefined;
    const actions=new SupportActions<null,SocketSkill<GemSocketRow>,GemSocketRow,ItemInstance>({
      bagItem:()=>item,support:wrapper=>{
        const g=wrapper.gem;
        return g?.kind==='support'?{supportId:g.supportId,level:g.level,...(wrapper.locked?{locked:true}:{}),...(g.rolled?{rolled:g.rolled}:{})}:undefined;
      },
      known:()=>target,granted:()=>undefined,fits:()=>request.fits===true,refusal:()=>hold,
      fail:(_seat,_key,why)=>{refusal=why;},remove:(_,id)=>{inventory.remove(state.items,id);},
      give:(_,row)=>{
        const wrapper=gems.itemOfSocket?.(row);need(wrapper,'invalid-socket-support');
        if(!inventory.autoPlace(state.items,wrapper,board)){refusal='inventory full';return false;}
        signal?.({kind:'dirty'});return true;
      },
      recalculate:()=>signal?.({kind:'recalculate'}),resync:()=>signal?.({kind:'resync-supports',skillId}),dirty:()=>signal?.({kind:'dirty'}),
      stored:()=>skill,storedSupport:(_,at)=>skill.sockets[at]??undefined,
    });
    const changed=install?actions.socket(null,uid as number,skillId):stored?actions.unsocketStored(null,uid as number,index as number)
      :actions.unsocket(null,skillId,index as number);
    return {changed,needsSave:changed,...(refusal?{refusal}:{})};
  }
}
