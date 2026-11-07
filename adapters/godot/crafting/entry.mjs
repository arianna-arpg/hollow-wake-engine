import {createCraftingContext} from './session.mjs';
import {godotDispatch} from './number-wire.mjs';
import {ItemInspector,InspectionInputError} from '@hollow-wake/engine/items/inspection';
import {CargoInspector} from '@hollow-wake/engine/inventory/cargo-cards';
import {EquipmentSlots} from '@hollow-wake/engine/inventory/equipment';

export const create=(table,rack)=>({...createCraftingContext(table,rack),inspector:null,cargo:null});
const refuse=reason=>({ok:false,reason});
export function dispatchCrafting(host,request){
  const op=request?.op;
  if(op==='snapshot-text')return Object.keys(request).length===2?host.session.snapshotText(request.profile):refuse('invalid-request');
  if(op==='snapshot-view')return Object.keys(request).length===3&&Object.hasOwn(request,'accountVersion')?
    host.session.snapshotView(request.profile,request.accountVersion):refuse('invalid-request');
  if(!['configure-inspection','inspect-item','compare-items','configure-cargo','cargo-references','inspect-cargo','configure-equipment','inspect-loadout'].includes(op))return host.session.command(request);
  try{
    if(op==='configure-equipment'){
      if(host.slots)return refuse('already-configured');
      if(Object.keys(request).length!==2||typeof request.text!=='string'||request.text.length>8192)return refuse('invalid-equipment-slots');
      let slots;
      try{slots=new EquipmentSlots(JSON.parse(request.text));}catch{return refuse('invalid-equipment-slots');}
      host.session.configureEquipment(slots);
      host.slots=slots;
      return {ok:true};
    }
    if(op==='configure-cargo'){
      if(host.cargo)return refuse('already-configured');
      if(Object.keys(request).length!==2)return refuse('invalid-request');
      host.cargo=new CargoInspector(host.skills,host.crafting,request.config);
      return {ok:true};
    }
    if(op==='cargo-references'||op==='inspect-cargo'){
      if(!host.cargo)return refuse('cargo-unavailable');
      if(op==='cargo-references')return Object.keys(request).length===2?{ok:true,references:host.cargo.references(request.item)}:refuse('invalid-request');
      if(!Object.keys(request).every(k=>['op','item','view','records','fit','socketNames'].includes(k)))return refuse('invalid-request');
      const read=({table,id})=>{
        const rows=request.records?.[table];
        if(!rows||typeof rows!=='object'||Array.isArray(rows)||!Object.hasOwn(rows,id))throw new InspectionInputError('missing-cargo-record');
        return rows[id];
      };
      const card=host.cargo.inspect(request.item,request.view,read,request.fit===undefined?undefined:()=>request.fit);
      return card?{ok:true,card,...(request.socketNames===true&&card.showcase?{socketNames:card.showcase.supports.map(s=>host.cargo.supportName(s.id))}:{})}:refuse('unknown-gem');
    }
    if(op==='configure-inspection'){
      if(host.inspector)return refuse('already-configured');
      if(Object.keys(request).length!==2 || typeof request.text!=='string' || request.text.length>65536)return refuse('invalid-vocabulary');
      let terms;
      try{terms=JSON.parse(request.text);}catch{return refuse('invalid-vocabulary');}
      host.inspector=new ItemInspector(host.items,terms);
      if(host.vestigeEditor)host.vestigeLabels={stones:terms.vestiges,words:terms.epitaphs};
      return {ok:true};
    }
    if(!host.inspector)return refuse('inspection-unavailable');
    if(op==='inspect-loadout'){
      if(!host.slots)return refuse('equipment-unavailable');
      if(!Object.keys(request).every(k=>['op','item','equipped','heroLevel','detail'].includes(k)))return refuse('invalid-request');
      return {ok:true,...host.inspector.inspectLoadout(request.item,request.equipped,request.heroLevel,host.slots,request.detail)};
    }
    if(op==='inspect-item' && Object.keys(request).length===2 && Object.hasOwn(request,'item'))return {ok:true,...host.inspector.inspect(request.item)};
    if(op==='compare-items' && Object.keys(request).length===3 && Object.hasOwn(request,'candidate') && Object.hasOwn(request,'worn'))
      return {ok:true,rows:host.inspector.compare(request.candidate,request.worn)};
    return refuse('invalid-request');
  }catch(error){if(error instanceof InspectionInputError)return refuse(error.message);throw error;}
}
export const dispatch=/* @__PURE__ */ godotDispatch(dispatchCrafting);
