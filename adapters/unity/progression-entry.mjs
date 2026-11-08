import {ProgressionSession} from '@hollow-wake/engine/progression/session';

export const create=content=>new ProgressionSession(content);
const fail=reason=>({ok:false,reason});
const shaped=(request,keys)=>request && typeof request==='object' && !Array.isArray(request) &&
  Object.keys(request).length===keys.length && keys.every(key=>Object.hasOwn(request,key));
const text=value=>typeof value==='string' && value.length<=524288;

// JsonUtility handles the small envelope only. Account maps, opaque relic
// payloads, binary64 values and complete saves stay lossless JSON text.
export function dispatch(session,request){
  if(!request || typeof request!=='object' || Array.isArray(request))return fail('invalid-request');
  const {op,profile}=request;
  if(op==='snapshot-text'){
    if(!shaped(request,['op','profile']))return fail('invalid-request');
    const reply=session.command({op:'save',profile});
    return reply.ok?{ok:true,text:JSON.stringify(reply.save)}:reply;
  }
  if(op==='observe-text'){
    if(!shaped(request,['op','profile','level','credits','ledger','roster']) ||
      !text(request.ledger)||!text(request.roster)||request.ledger.length+request.roster.length>524288)
      return fail('invalid-request');
    let ledger,roster;
    try{ledger=JSON.parse(request.ledger);roster=JSON.parse(request.roster);}catch{return fail('invalid-json');}
    return session.command({op:'observe',profile,level:request.level,credits:request.credits,ledger,roster});
  }
  if(!['open-text','restore-text','profile-command','relics-text'].includes(op))return session.command(request);
  const keys=op==='open-text'?['op','profile','seed','text']:['op','profile','text'];
  if(!shaped(request,keys)||!text(request.text))return fail('invalid-request');
  let body;
  try{body=JSON.parse(request.text);}catch{return fail('invalid-json');}
  if(!body || typeof body!=='object' || Array.isArray(body))return fail('invalid-request');
  if(op==='open-text')return session.command({op:'open',profile,seed:request.seed,account:body});
  if(op==='restore-text')return session.command({op:'restore',profile,save:body});
  if(op==='relics-text')return session.command({op:'relics',profile,state:body});
  if(Object.hasOwn(body,'profile') || typeof body.op!=='string' || ['open','restore','close'].includes(body.op))
    return fail('invalid-profile-command');
  return session.command({...body,profile});
}
