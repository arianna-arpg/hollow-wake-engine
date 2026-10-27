import test from 'node:test';import assert from 'node:assert/strict';
import {readLifeRecoveryExpectations} from '../scripts/check-life-recovery-contract.mjs';
const {healLife,refillLife,applyProcHeal}=await import(process.env.HOLLOW_WAKE_LIFE_RECOVERY_MODULE??'../dist/life-recovery.js');
const {fixtures}=readLifeRecoveryExpectations(),native=fixtures.get('life-recovery').value;
function decode(value){
  if(value&&typeof value==='object'){
    if(value.$undefined===true&&Object.keys(value).length===1)return undefined;
    if(Object.hasOwn(value,'$number')&&Object.keys(value).length===1)return Number(value.$number);
    return Array.isArray(value)?value.map(decode):Object.fromEntries(Object.entries(value).map(([k,v])=>[k,decode(v)]));
  }return value;
}
function replay(encoded){
  const expected=decode(encoded),input=expected.input;
  const actor={life:input.life??50,dead:input.dead??false,healedSince:input.healedSince??0,
    since:[...expected.before.since],lifeSealAt:input.seal,reservedLife:input.reserved??0};
  const events=[],state=()=>({life:actor.life,dead:actor.dead,healedSince:actor.healedSince,
    since:[...actor.since],seal:actor.lifeSealAt,reserved:actor.reservedLife});
  const record=(phase,details)=>events.push({phase,details,state:state()});
  let entered=false,mutated=false,observer;
  const hook=(phase,details)=>{
    record(phase,details);
    if(input.mutateAt===phase&&!mutated){mutated=true;Object.assign(actor,input.mutation);record('mutation',input.mutation);}
    if(input.replaceObserverAt===phase)observer=(amount,silent)=>record('replacement-observer',{amount,silent,receiver:true});
    if(input.nestedAt===phase&&!entered){entered=true;const landed=healLife(actor,5,ports,input.nestedSilent??false);record('nested-return',{landed});}
    if(input.faultAt===phase)throw new Error('failure:'+phase);
  };
  const maximum=()=>{hook('maximum');const value=input.maximum??100;record('maximum-return',{value});return value;};
  observer=input.noObserver?undefined:(amount,silent)=>hook('observer',{amount,silent,receiver:true});
  const ports={maximumLife:maximum,
    ceiling:()=>{hook('ceiling');const value=Math.max(1,maximum()-actor.reservedLife);record('ceiling-return',{value});return value;},
    rate:()=>{hook('rate');const value=input.rate??1;record('rate-return',{value});return value;},
    tapped:input.noTap?undefined:(_a,amount)=>{hook('tap',{amount});},
    observed:(_a,amount,silent)=>{observer?.(amount,silent);},
    recent:()=>{hook('recent',{kind:'heal'});actor.since[native.healRecentIndex]=0;record('recent-return',{kind:'heal'});},
  };
  const before=state();let result,error=null;
  try{result=input.operation==='refill'?refillLife(actor,ports):healLife(actor,input.amount,ports,input.silent);}
  catch(failure){error=failure.message;}
  return {input,before,result,error,events,after:state()};
}
for(const row of native.rows)test('native recovery: '+row.input.name,()=>assert.deepEqual(replay(row),decode(row)));
for(const expected of fixtures.get('heal-method-resolution').value.rows)test('native method selection: '+expected.phase,()=>{
  const calls=[],actor={life:50,heal(amount){calls.push(['original',amount,this===actor]);this.life+=amount;return amount;}};
  const replace=()=>{actor.heal=function(amount){calls.push(['replacement',amount,this===actor]);return 0;};};
  const ports={maximumLife(){if(expected.phase==='maximum')replace();return 100;}};
  const effect={type:'heal',get flat(){if(expected.phase==='flat')replace();return 3;},get pctMax(){if(expected.phase==='pct')replace();return 0;}};
  assert.equal(applyProcHeal(actor,effect,ports,actor.heal),true);
  assert.deepEqual({phase:expected.phase,calls,life:actor.life},expected);
});

test('independent healing arithmetic and actor isolation',()=>{
  const a={life:10,dead:false,healedSince:0},b={life:20,dead:false,healedSince:0};
  const ports={ceiling:()=>50,rate:()=>2,recent:()=>undefined};
  assert.equal(healLife(a,30,ports),40);assert.equal(a.life,50);assert.equal(a.healedSince,40);
  assert.deepEqual(b,{life:20,dead:false,healedSince:0});
  assert.equal(healLife(b,3,ports,true),6);assert.equal(b.life,26);assert.equal(b.healedSince,0);
});
test('proc healing queries maximum even for absent/zero percentages and honors the return',()=>{
  for(const effect of [{type:'heal'},{type:'heal',flat:3},{type:'heal',flat:3,pctMax:0},{type:'heal',flat:3,pctMax:.2}]){
    const actor={},calls=[];let result=0;
    const ports={maximumLife:a=>{assert.equal(a,actor);calls.push('maximum');return 100;}};
    const method=function(amount){assert.equal(this,actor);calls.push(['heal',amount]);return result;};
    assert.equal(applyProcHeal(actor,effect,ports,method),false);
    assert.deepEqual(calls,['maximum',['heal',(effect.flat??0)+(effect.pctMax??0)*100]]);
    result=1;assert.equal(applyProcHeal(actor,effect,ports,method),true);
    result=-1;assert.equal(applyProcHeal(actor,effect,ports,method),false);
  }
});
test('proc arithmetic preserves property-read order and callback exceptions',()=>{
  const calls=[],effect={type:'heal',get flat(){calls.push('flat');return 3;},get pctMax(){calls.push('pct');return .2;}};
  const failure=new Error('gain failed');
  assert.throws(()=>applyProcHeal({},effect,{maximumLife:()=>{calls.push('maximum');return 100;}},
    function(n){calls.push(['heal',n]);throw failure;}),error=>error===failure);
  assert.deepEqual(calls,['flat','pct','maximum',['heal',23]]);
});
test('amount queries cannot replace an already-selected native-style heal method',()=>{
  const calls=[],actor={heal(amount){assert.equal(this,actor);calls.push(['original',amount]);return amount;}};
  const ports={maximumLife(a){a.heal=amount=>{calls.push(['replacement',amount]);return 0;};return 100;}};
  assert.equal(applyProcHeal(actor,{type:'heal',flat:3},ports,actor.heal),true);
  assert.deepEqual(calls,[['original',3]]);
  assert.equal(applyProcHeal(actor,{type:'heal',flat:3},ports,actor.heal),false);
  assert.deepEqual(calls,[['original',3],['replacement',3]]);
});
