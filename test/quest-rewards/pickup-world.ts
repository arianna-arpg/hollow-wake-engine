import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {makeMemoryItem} from '../src/engine/memories';
import {setBagBoardSource} from '../src/engine/inventory';
import {notePickup} from '../src/world/bulletins';
import {publishMemoryPickupItems} from 'candidate/memory-item-publication';
bootSimEngine();
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
/** Original World comparison at an already authorized touch. Item addresses
 * are projected explicitly; independent owner tests cover their allocation. */
export function memoryPickupWorld(input:any,prepared?:any){
 const w=makeSimWorld('warrior',74119),seat=w.localSeat,m=seat.meta,p=seat.actor,host=w as any;
 w.actors=[p];w.orbs=[];m.items=copy(input.state.items);w.pickupFeed=[];w.time=0;
 const item=makeMemoryItem(input.drop.memoryKind,copy(input.drop.units));item.uid=input.nextUid;
 w.drops=[{pos:{...p.pos},item:{kind:'gear',item},bob:0,tier:0}];host.pickupSeat=()=>seat;
 const events:any[]=[],visible:any[]=[];
 const snapshot=()=>copy({items:m.items,feed:w.pickupFeed.map(({seatId,...row})=>row),drops:w.drops});
 const record=(event:any)=>{events.push(event);visible.push({event,state:snapshot()});};
 host.text=(_at:any,message:string,color:string,size:number,lane:string)=>record({kind:'text',message,color,size,lane});
 host.failNote=(_actor:any,key:string,reason:string)=>record({kind:'refusal',key,reason});
 host.markMetaDirty=()=>record({kind:'meta-dirty'});
 const board=input.state.board;setBagBoardSource(()=>({w:board.w,h:board.h,...(board.rows?{open:(x:number,y:number)=>board.rows[y][x]==='#'}:{})}));
 try{
  if(!prepared)host.updateDrops(0);
  else{
   publishMemoryPickupItems(m.items,item,prepared.request.state.items,prepared.accepted);
   for(const event of prepared.events){
    if(event.kind==='text')host.text(p.pos,event.message,event.color,event.size,event.lane);
    else if(event.kind==='pickup')notePickup(w.pickupFeed,seat.id,event.label,event.color,w.time,event.count);
    else if(event.kind==='meta-dirty')host.markMetaDirty(seat);
    else if(event.kind==='refusal')host.failNote(p,event.key,event.reason);
    else throw Error('Unexpected Memory pickup effect');
   }
   if(prepared.accepted)w.drops.length=0;
  }
  return{events,visible,final:snapshot()};
 }finally{setBagBoardSource(null);}
}
