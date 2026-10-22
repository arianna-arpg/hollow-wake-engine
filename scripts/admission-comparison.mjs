import assert from 'node:assert/strict';

const forwarding=new Set(['tagsForbidden','canAct','isReflex','reflexOpen','gatherReleasable','gatesMet','unmetGate','primedPourOpen']);
const observations=new Set(['skillUseTime','skillChargeBank','skillCost','canAfford','maxMana','maxLife','availableMaxMana','maxEs']);
export function actorCaptureSource(source){
 const before='const original=a[name].bind(a);';assert.equal(source.split(before).length,2);
 // Two private helpers are retired by the extraction. Public methods and every
 // effectful observation remain mandatory; an absent one fails the capture.
 return source.replace(before,"if((name==='reflexOpen'||name==='gatherReleasable')&&a[name]===undefined)continue;\n   "+before);
}
export function worldCaptureSource(source){
 const before="for(const name of actorMethods){const original=(a as any)[name].bind(a);(a as any)[name]=(...args:any[])=>{calls.push({method:name,skill:args[0]?.def?.id,cost:name==='payCost'?wire(args[0]):undefined});return original(...args);};}";
 assert.equal(source.split(before).length,2);
 return source.replace(before,`const admissionStack:string[]=[];
  for(const name of actorMethods){const original=(a as any)[name].bind(a);(a as any)[name]=(...args:any[])=>{
   calls.push({method:name,skill:args[0]?.def?.id,cost:name==='payCost'?wire(args[0]):undefined,parents:[...admissionStack]});
   admissionStack.push(name);try{return original(...args);}finally{admissionStack.pop();}
  };}
  const gatesMet=a.gatesMet.bind(a);
  (a as any).gatesMet=(...args:any[])=>{admissionStack.push('gatesMet');try{return (gatesMet as any)(...args);}finally{admissionStack.pop();}};`);
}
export function withoutParents(value){
 const copy=structuredClone(value);for(const course of copy.courses)for(const step of course.steps)for(const call of step.calls)delete call.parents;return copy;
}
export function projectAdmission(name,value){
 const copy=structuredClone(value);
 if(name==='admission-actor'){
  for(const course of copy.cases)for(const step of course.steps)step.trace=step.trace.filter(method=>{
   assert(forwarding.has(method)||observations.has(method),'Unknown admission trace '+method);return observations.has(method);
  });
 }else{
  assert.equal(name,'admission-world');
  for(const course of copy.courses)for(const step of course.steps){
   step.calls=step.calls.filter(call=>{
    if(['canUse','unmetGate','payCost'].includes(call.method))assert(Array.isArray(call.parents),'Uninstrumented actor call');
    if(call.method!=='unmetGate'||call.parents.length===0)return true;
    assert(['gatesMet','canUse/gatesMet'].includes(call.parents.join('/')),'Unexpected nested prerequisite call');
    return false;
   });
   for(const call of step.calls)delete call.parents;
  }
 }
 return copy;
}
