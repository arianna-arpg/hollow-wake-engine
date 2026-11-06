import {create as createSession,dispatch as dispatchSession} from '../../experiments/embedded-js/session.mjs';
import {decodeContentTable} from '@hollow-wake/engine/content/table';

// Parsed privately by the native runtime. Release the transport rows before
// the capability constructors allocate their detached, validated content.
export function create(input){
  if(input.capability!=='content-table/v1')return createSession(input);
  const plain=decodeContentTable(input);
  input.nodes.length=0;
  return createSession(plain);
}

export function dispatch(world,request){
  if(!request||request.version!==1)return dispatchSession(world,request);
  if(request?.version===1&&request.op==='advanceSteps'){
    if(!Number.isSafeInteger(request.steps)||request.steps<1||request.steps>64||
       !Number.isFinite(request.dt)||request.dt<0||request.dt>60)return {ok:false,error:'invalid-request'};
    const owner=world.sessions.get(request.handle);
    if(owner&&!owner.poisoned&&owner.target.life<=0)
      return {ok:true,value:{steps:0,raw:0,damage:0,targetLife:owner.target.life,cast:null}};
    const command={version:1,op:'batch',handle:request.handle,commands:[{op:'advance',dt:request.dt}]};
    let raw=0,damage=0;
    for(let steps=1;steps<=request.steps;steps++){
      const result=dispatchSession(world,command);
      if(!result.ok)return result;
      const frame=result.results[0];
      raw+=frame.raw;damage+=frame.damage;
      // A host may need to launch a projectile or retire its target before
      // the next tick. Never run past that boundary.
      if(frame.cast||frame.targetLife<=0||steps===request.steps)
        return {ok:true,value:{steps,raw,damage,targetLife:frame.targetLife,cast:frame.cast}};
    }
  }
  if(request?.version===1&&['createText','restoreText','batchText'].includes(request.op)){
    let value;
    try { value=JSON.parse(request.text); }
    catch { return {ok:false,error:'invalid-json'}; }
    if(request.op==='batchText')return dispatchSession(world,{version:1,op:'batch',handle:request.handle,commands:value});
    return request.op==='createText'?dispatchSession(world,{version:1,op:'create',config:value})
      :dispatchSession(world,{version:1,op:'restore',snapshot:value});
  }
  // Unity's built-in JSON reader needs a named field for heterogeneous
  // objects and cannot round-trip arbitrary maps. Keep saves lossless.
  if(request.version===1&&request.op==='snapshotText'){
    const result=dispatchSession(world,{version:1,op:'snapshot',handle:request.handle});
    return result.ok?{ok:true,text:JSON.stringify(result.snapshot)}:result;
  }
  if(request.version===1&&request.op==='command'){
    const result=dispatchSession(world,{version:1,op:'batch',handle:request.handle,commands:[request.command]});
    return result.ok?{ok:true,value:result.results[0]}:result;
  }
  return dispatchSession(world,request);
}
