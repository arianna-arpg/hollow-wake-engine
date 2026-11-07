import {create as createCrafting,dispatchCrafting} from './entry.mjs';
import {godotDispatch} from './number-wire.mjs';
import {WorkshopVestiges} from '@hollow-wake/engine/items/vestiges/workshop';

export function create(table){
  let editor;
  const host=createCrafting(table,items=>(editor=new WorkshopVestiges(items)));
  host.vestigeEditor=editor;
  return host;
}
// The rules also serve hosts with an exact JSON codec. Godot alone uses the
// bit-preserving wire wrapper below; there is one implementation of the policy.
export function dispatchWorkshop(host,request){
  if(request?.op!=='view-inlay')return dispatchCrafting(host,request);
  const {item,wallet,id,socket}=request, labels=host.vestigeLabels;
  const refuse=()=>({ok:false,reason:'invalid-inlay-view'});
  if(!labels || !item || !Number.isSafeInteger(item.uid) || !Object.hasOwn(host.items.pack.bases,item.baseId) ||
    !Array.isArray(item.sockets) || item.sockets.length>128 || !item.sockets.every(s=>s===null||typeof s==='string') ||
    !wallet || typeof wallet!=='object' || Array.isArray(wallet))return refuse();
  for(const [key,count] of Object.entries(wallet))
    if(!Object.hasOwn(labels.stones,key)||!Number.isSafeInteger(count)||count<0)return refuse();
  const materials=[];
  for(const [key,label] of Object.entries(labels.stones)){
    if(wallet[key]>0)materials.push({id:key,name:label.name,glyph:label.glyph,count:wallet[key]});
  }
  const resolve=id=>id===null?'Empty socket':(Object.hasOwn(labels.stones,id)?labels.stones[id].name:id);
  const reply={ok:true,materials,sockets:item.sockets.map(resolve)};
  if(id===undefined)return reply;
  if(typeof id!=='string'||(socket!==undefined&&!Number.isSafeInteger(socket)))return refuse();
  const decision=host.vestigeEditor.inlays.preview({items:[item],equipped:{},vestiges:wallet},item.uid,socket,id);
  reply.preview=decision.changed?{...decision,replacedName:decision.replaced?resolve(decision.replaced):null,
    epitaphName:decision.epitaph?labels.words[decision.epitaph]?.name:null}:decision;
  return reply;
}
export const dispatch=/* @__PURE__ */ godotDispatch(dispatchWorkshop);
