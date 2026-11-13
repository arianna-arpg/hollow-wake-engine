import {publishGemPickupItems,restoreOwnedInventory} from 'diagnostic/world-item-publication';
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {BAR_SLOTS,makeSkillGem} from '../src/engine/skills';
import {packSkillGemPayload,packSupportGemPayload} from '../src/engine/gemitems';
import {nextItemUid} from '../src/engine/itemgen';import {notePickup} from '../src/world/bulletins';
import {SKILLS} from '../src/data/skills';import {SUPPORTS} from '../src/data/supports';
bootSimEngine();const copy=(value:any)=>JSON.parse(JSON.stringify(value));
export function worldFixture(row:any,groupKey:string){
 const w=makeSimWorld('magician',0x7819),s=w.localSeat,m=s.meta,p=s.actor,events:any[]=[],touches:any[]=[],visible:any[]=[];
 w.walk=null;w.actors=[p];m.items=copy(row.before.items);m.equipped={};m.containers={};m.knownSkills.clear();p.skills=Array(BAR_SLOTS).fill(null);w.recalcSeat(s);w.drops=[];w.pickupFeed=[];
 (w as any).pickupSeat=(_pos:any,radius:number,exclude:any,tier:any)=>{touches.push({radius,exclude:exclude??null,tier});return row.reachable&&exclude!==s.id?s:undefined;};
 (w as any).text=(_pos:any,message:string,color:string,size:number,kind:string)=>{events.push({kind:'text',message,color,size,lane:kind});visible.push(copy({event:events.at(-1),items:m.items,feed:w.pickupFeed.map(({seatId,...r}:any)=>r),drops:w.drops.map(d=>bare(d))}));};
 (w as any).failNote=(_actor:any,key:string,reason:string)=>{events.push({kind:'refusal',key,reason});visible.push(copy({event:events.at(-1),items:m.items,feed:w.pickupFeed.map(({seatId,...r}:any)=>r),drops:w.drops.map(d=>bare(d))}));};
 (w as any).markMetaDirty=()=>{events.push({kind:'meta-dirty'});visible.push(copy({event:events.at(-1),items:m.items,feed:w.pickupFeed.map(({seatId,...r}:any)=>r),drops:w.drops.map(d=>bare(d))}));};
 const support=(raw:any)=>({def:SUPPORTS[raw.supportId],level:raw.level,...(raw.locked?{locked:true}:{}),...(raw.rolled?{rolled:copy(raw.rolled)}:{})});
 const item=(drop:any)=>{
  if(drop.kind==='support'){const gem=support(drop.gem);if(drop.locked)gem.locked=true;return{kind:'support',gem};}
  const gem=drop.gem,inst=makeSkillGem(SKILLS[gem.skillId],gem.level,gem.rarity);inst.sockets=gem.sockets.map((row:any)=>row?support(row):null);
  for(const name of ['empowermentRank','replenishmentPaused','granted','attunedForm','treeNodes'])if(gem[name]!==undefined)(inst as any)[name]=copy(gem[name]);
  if(drop.locked)inst.locked=true;return{kind:'skill',inst};
 };
 const bare=(d:any)=>d.item.kind==='skill'?{kind:'skill',gem:packSkillGemPayload(d.item.inst),...(d.item.inst.locked?{locked:true}:{})}:{kind:'support',gem:packSupportGemPayload(d.item.gem),...(d.item.gem.locked?{locked:true}:{})};
 const ports={list:()=>w.drops,inspect:(d:any)=>d.sdkDelivery?{...d.sdkDelivery,drop:bare(d)}:undefined,
  create:(delivery:any)=>{
   const original=row.beforeDrops[delivery.id-1]??{bob:0,tier:0},drop:any={pos:{...p.pos},bob:original.bob,tier:original.tier,item:item(delivery.drop),sdkDelivery:{groupKey:delivery.groupKey,id:delivery.id,characterKey:delivery.characterKey}};
   if(original.grace!==undefined)drop.grace=original.grace;
   if(original.droppedBy){drop.droppedBy=s.id;drop.dropperCleared=original.dropperCleared;if(row.label==='cleared-dropper-can-pick-up')drop.pos.x-=100;}
   w.drops.push(drop);return drop;
  },remove:(drop:any)=>{const index=w.drops.indexOf(drop);if(index<0)throw Error('Missing world handle');w.drops.splice(index,1);}};
 const fixture={w,s,p,m,events,touches,visible,ports,groupKey,
  update:(dt:number)=>(w as any).updateDrops(dt),nextUid:()=>nextItemUid(),
  bridge:(callback:any)=>{(w as any).sdkDeliveryPickup=callback;},
  snapshot:()=>copy(w.drops.map((d:any)=>({drop:bare(d),bob:d.bob,tier:d.tier,...(d.grace===undefined?{}:{grace:d.grace}),...(d.droppedBy?{droppedBy:d.droppedBy,dropperCleared:d.dropperCleared??false}:{})}))),
  apply:(saved:any,journal:any[],project?:(entry:any)=>any[],beforeRetire=()=>{})=>{
   if(!journal.length){restoreOwnedInventory(m.items,saved.workshop.state.items);return;}
   for(const entry of journal){
    assert(project);publishGemPickupItems(m.items,project(entry));
    for(const event of entry.reply.reply?.events??[]){
    if(event.kind==='text')(w as any).text(p.pos,event.message,event.color,event.size,event.lane);
    else if(event.kind==='refusal')(w as any).failNote(p,event.key,event.reason);
    else if(event.kind==='pickup')notePickup(w.pickupFeed,s.id,event.label,event.color,w.time,event.count);
    else if(event.kind==='meta-dirty')(w as any).markMetaDirty(s);
    else throw Error('Unqualified live effect: '+event.kind);
    }
    if(entry.reply.reply?.accepted===true){
     beforeRetire();const id=entry.reply.reply.deliveryId,drop=w.drops.find((d:any)=>d.sdkDelivery?.groupKey===groupKey&&d.sdkDelivery.id===id);assert(drop);ports.remove(drop);
    }
   }
   assert.deepEqual(copy(m.items),copy(saved.workshop.state.items));
  }};
 return fixture;
}
