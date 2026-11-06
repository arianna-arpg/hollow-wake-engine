import {create,dispatch as command} from '../embedded/pouch-session.mjs';
export {create};

export function dispatch(host,input){
  try{
    if(!input||typeof input!=='object'||Array.isArray(input))return {ok:false,reason:'invalid-pouch-context'};
    if(input.op!=='inspectText'&&input.op!=='recallText')return command(host,input);
    const inspect=input.op==='inspectText';
    const request={op:inspect?'view':'recall',uid:input.uid,level:input.level,sealed:input.sealed,
      state:JSON.parse(input.state),memory:input.memory?JSON.parse(input.memory):null};
    if(!inspect){
      request.group=input.group;
      request.nextUid=input.nextUid;
      if(input.facet)request.facet=input.facet;
    }
    const reply=command(host,request);
    if(inspect||!reply.ok)return reply;
    return {ok:true,nextUid:reply.nextUid,result:reply.result,itemsJson:JSON.stringify(reply.items),
      ledgerJson:JSON.stringify(reply.ledger),memoryJson:JSON.stringify(reply.memory)};
  }catch{
    // Discard a partially rebuilt access cache before accepting another caller.
    host.actor=null; host.access=null;
    return {ok:false,reason:'invalid-pouch-context'};
  }
}
