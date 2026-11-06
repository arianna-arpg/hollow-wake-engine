import {createCraftingContext} from './session.mjs';
import {godotDispatch} from './number-wire.mjs';
import {ItemInspector,InspectionInputError} from '@hollow-wake/engine/items/inspection';

export const create=table=>({...createCraftingContext(table),inspector:null});
const refuse=reason=>({ok:false,reason});
export const dispatch=godotDispatch((host,request)=>{
  const op=request?.op;
  if(op!=='configure-inspection' && op!=='inspect-item' && op!=='compare-items')return host.session.command(request);
  try{
    if(op==='configure-inspection'){
      if(host.inspector)return refuse('already-configured');
      if(Object.keys(request).length!==2 || typeof request.text!=='string' || request.text.length>65536)return refuse('invalid-vocabulary');
      let terms;
      try{terms=JSON.parse(request.text);}catch{return refuse('invalid-vocabulary');}
      host.inspector=new ItemInspector(host.items,terms);
      return {ok:true};
    }
    if(!host.inspector)return refuse('inspection-unavailable');
    if(op==='inspect-item' && Object.keys(request).length===2 && Object.hasOwn(request,'item'))return {ok:true,...host.inspector.inspect(request.item)};
    if(op==='compare-items' && Object.keys(request).length===3 && Object.hasOwn(request,'candidate') && Object.hasOwn(request,'worn'))
      return {ok:true,rows:host.inspector.compare(request.candidate,request.worn)};
    return refuse('invalid-request');
  }catch(error){if(error instanceof InspectionInputError)return refuse(error.message);throw error;}
});
