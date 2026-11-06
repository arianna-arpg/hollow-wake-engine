import {PouchRecall} from '@hollow-wake/engine/inventory/pouch-recall';
import {InventoryHost} from '@hollow-wake/engine/inventory/host';

export function create(data){
  const rules=new PouchRecall(data.content);
  const sizes=data.sizes;
  const inventory=new InventoryHost(item=>{
    const size=Object.hasOwn(sizes,item.baseId)&&sizes[item.baseId];
    if(!size)throw Error('Unknown inventory footprint');
    return {w:size[0],h:size[1]};
  });
  const initial={content:data.id,skills:data.start.skills,supports:data.start.supports,secondary:[],seatLedger:{}};
  return {rules,inventory,initial,unlockAll:data.unlockAll,itemId:data.itemId,skillId:data.skillId,actor:null,access:null};
}
function valid(memory,host){
  if(!memory||Object.keys(memory).sort().join('|')!=='content|seatLedger|secondary|skills|supports'||memory.content!==host.initial.content)return false;
  const ids=rows=>Array.isArray(rows)&&rows.length<=2048&&rows.every(s=>typeof s==='string'&&s.length>0&&s.length<=512)&&new Set(rows).size===rows.length;
  return ids(memory.skills)&&ids(memory.supports)&&ids(memory.secondary)&&memory.seatLedger&&typeof memory.seatLedger==='object'
    &&!Array.isArray(memory.seatLedger)&&Object.keys(memory.seatLedger).length<=2048
    &&Object.entries(memory.seatLedger).every(([id,n])=>id.length>0&&id.length<=512&&Number.isSafeInteger(n)&&n>=0);
}
export function dispatch(host,r){
  if(r.op==='bind')return r.itemId===host.itemId&&r.skillId===host.skillId?{ok:true}:{ok:false,reason:'recall-data'};
  const memory=r.memory===null?host.initial:r.memory;
  if(!valid(memory,host))return {ok:false,reason:'invalid-recall-save'};
  if(r.op==='validate')return {ok:true};
  const state=r.state;
  const all=state.account.features.includes(host.unlockAll);
  const previous=host.access;
  const same=(a,b)=>a.length===b.length&&a.every((id,i)=>id===b[i]);
  if(!previous||previous.level!==r.level||previous.all!==all||!same(previous.skills,memory.skills)||!same(previous.supports,memory.supports)){
    host.access={level:r.level,all,skills:memory.skills,supports:memory.supports};
    host.actor=host.rules.forActor(host.access);
  }
  const actor=host.actor;
  const {rows,w,h}=state.board;
  const bag={items:state.items,board:{w,h,...(rows?{open:(x,y)=>rows[y][x]!=='\u002e'}:{})},sealed:r.sealed,inventory:host.inventory};
  if(r.op==='view'){
    const view=actor.view(bag,r.uid);
    return view?{ok:true,view,facets:host.rules.content.kinds[view.kind].facets?host.rules.content.facets:[]}:{ok:false,reason:'missing-item'};
  }
  if(r.op!=='recall')return {ok:false,reason:'unknown-action'};
  const next=actor.recall(bag,r.uid,r.group,r.nextUid,r.facet);
  if(!next.ok)return {ok:false,reason:next.reason??'missing-item'};
  const receipts=host.rules.receipts(next.result,{...memory,ledger:state.account.ledger,local:true,progression:state.account.progression});
  return {ok:true,items:next.items,nextUid:next.nextUid,result:next.result,ledger:receipts.ledger,
    memory:{...memory,skills:receipts.skills,secondary:receipts.secondary,seatLedger:receipts.seatLedger}};
}
