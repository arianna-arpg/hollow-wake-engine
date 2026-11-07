import {create,dispatchWorkshop} from '../godot/crafting/vestige-entry.mjs';
export {create};

// Unity's field serializer cannot preserve arbitrary save maps. Only the typed
// envelope crosses that serializer; complete state and command bodies stay JSON.
export function dispatch(host,request){
  if(!request||typeof request!=='object'||Array.isArray(request))return {ok:false,reason:'invalid-request'};
  const {op,profile,text}=request;
  if(op==='workshop-query'){
    if(Object.keys(request).length!==2||typeof text!=='string'||text.length>524288)return {ok:false,reason:'invalid-request'};
    let query;
    try{query=JSON.parse(text);}catch{return {ok:false,reason:'invalid-json'};}
    if(!['inspect-item','compare-items','inspect-loadout','view-inlay'].includes(query?.op))
      return {ok:false,reason:'invalid-workshop-query'};
    return dispatchWorkshop(host,query);
  }
  if(!['open-text','restore-text','profile-command'].includes(op))return dispatchWorkshop(host,request);
  let body;
  const fields=op==='open-text'?['op','profile','text','seed','nextUid']:['op','profile','text'];
  if(Object.keys(request).length!==fields.length||!fields.every(k=>Object.hasOwn(request,k))||
    typeof text!=='string'||text.length>524288)return {ok:false,reason:'invalid-request'};
  try{body=JSON.parse(text);}catch{return {ok:false,reason:'invalid-json'};}
  if(!body||typeof body!=='object'||Array.isArray(body))return {ok:false,reason:'invalid-request'};
  if(op==='open-text')return dispatchWorkshop(host,{op:'open',profile,seed:request.seed,
    ...(request.nextUid===0?{}:{nextUid:request.nextUid}),state:body});
  if(op==='restore-text')return dispatchWorkshop(host,{op:'restore',profile,save:body});
  if(Object.hasOwn(body,'profile')||typeof body.op!=='string'||
    ['open','restore','close'].includes(body.op)||body.op.startsWith('configure-'))
    return {ok:false,reason:'invalid-profile-command'};
  return dispatchWorkshop(host,{...body,profile});
}
