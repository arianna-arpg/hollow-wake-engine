import {WorkshopSupports} from './workshop-supports.js';
import {WorkshopRack,type WorkshopResidence,type WorkshopSignal} from './workshop-rack.js';
import type {CraftingSessionState} from './crafting-session-data.js';
import type {ItemContent} from './item-rules.js';
import type {ItemInstance} from './item-types.js';
import type {GemSkill} from './gem-residence.js';
import type {InventoryHost,LiveInventoryBoard} from './inventory-host.js';
import {VestigeInlays} from './vestige-inlays.js';
import {matchEpitaph} from './vestige-rules.js';
import {sessionFields as fields,sessionText as text,sessionInteger as integer} from './session-json.js';

/** Shares the crafting session's already validated item registry. */
export class WorkshopVestiges extends WorkshopRack {
  readonly #supports=new WorkshopSupports();
  readonly inlays;
  constructor(items:ItemContent){
    super();
    const pack=items.pack;
    this.inlays=new VestigeInlays({
      vestige:(id:string)=>pack.vestiges[id],
      word:(item:ItemInstance,sockets:readonly (string|null)[])=>{
        const category=pack.bases[item.baseId]?.category;
        return category?matchEpitaph(pack.epitaphs,item.rarity,category,sockets):undefined;
      },
    });
  }
  override readonly accountPreservingMove=WorkshopVestiges.prototype.move;
  override readonly handles=(op:string)=>op==='grant-vestige'||op==='inlay-vestige'||this.#supports.handles(op);
  override move<S extends GemSkill>(request:Record<string,unknown>,state:CraftingSessionState,inventory:InventoryHost<ItemInstance>,
    board:LiveInventoryBoard,gems:WorkshopResidence<S>,signal?:WorkshopSignal){
    const op=request.op;
    if(op!=='inlay-vestige' && op!=='grant-vestige')return this.#supports.move(request,state,inventory,board,gems,signal);
    fields(request,op==='grant-vestige'?['op','profile','id','count']:['op','profile','id','uid','socket']);
    text(request.id);
    let result;
    if(op==='grant-vestige'){
      integer(request.count,1);
      result=this.inlays.grant(state,request.id,request.count,{
        granted:(def,count)=>signal?.({kind:'vestige-granted',id:def.id,count}),dirty:()=>signal?.({kind:'dirty'})});
    }else{
      integer(request.uid,1);
      if(request.socket!==undefined)integer(request.socket,0);
      result=this.inlays.inlay(state,request.uid,request.socket as number|undefined,request.id,{
        crumbled:id=>signal?.({kind:'vestige-crumbled',id}),inlaid:def=>signal?.({kind:'vestige-inlaid',id:def.id}),
        awakened:word=>signal?.({kind:'epitaph-awakened',id:word.id}),recalculate:()=>signal?.({kind:'recalculate'}),
        dirty:()=>signal?.({kind:'dirty'})});
    }
    return {...result,needsSave:result.changed,...(!result.changed?{refusal:result.reason}:{})};
  }
}
