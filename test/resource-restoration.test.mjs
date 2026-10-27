import test from 'node:test';
import assert from 'node:assert/strict';
import {readRestorationExpectations} from '../scripts/check-restoration-contract.mjs';
import {healLife} from '../dist/life-recovery.js';
import {scaleProcEffect} from '../dist/proc-effects.js';
const {gainEnergyShield,gainPoise,applyInstantRestoration,applyProcRestoration}=await import(
  process.env.HOLLOW_WAKE_RESTORATION_MODULE??'../dist/resource-restoration.js');
const {fixtures}=readRestorationExpectations();
function decode(value){
  if(value&&typeof value==='object'){
    if(value.$undefined===true&&Object.keys(value).length===1)return undefined;
    if(Object.hasOwn(value,'$number')&&Object.keys(value).length===1)return Number(value.$number);
    return Array.isArray(value)?value.map(decode):Object.fromEntries(Object.entries(value).map(([k,v])=>[k,decode(v)]));
  }return value;
}
const rows=name=>fixtures.get(name).value.rows.map(decode);
const recovery={ceiling:a=>a.maxLife(),rate:()=>1,recent:()=>undefined};
const ports=Object.freeze({maximumShield:a=>a.maxEs(),maximumPoise:a=>a.maxPoise(),maximumMana:a=>a.maxMana(),
  poiseOvercharge:a=>a.overcharge,availableMana:a=>a.availableMaxMana(),
  restoreLife:(a,e)=>a.healBy(e.amount),restoreShield:(a,e)=>a.gainEs(e.amount),restorePoise:(a,e)=>a.gainPoise(e.amount),
  gainShield:(a,n)=>a.gainEs(n),gainPoise:(a,n)=>a.gainPoise(n),
  noteGain:(a,resource,amount,cue)=>{a.notifications.push({resource,amount,cue});},
});
function actor(input={}){
  return {life:input.current??40,mana:input.current??40,es:input.current??40,poise:input.current??40,
    dead:input.dead??false,maximum:input.maximum??100,overcharge:input.overcharge??0,reservedMana:input.reserved??0,
    healedSince:0,esDelay:5,esRecharging:false,esJustFilled:input.filled??false,poiseBroken:input.broken??false,
    gainEvents:Array.from({length:input.eventCount??0},()=>({kind:'restore',id:'mana',depth:0,n:1})),notifications:[],
    maxLife(){return this.maximum;},maxEs(){return this.maximum;},maxPoise(){return this.maximum;},maxMana(){return this.maximum;},
    availableMaxMana(){return Math.max(0,this.maxMana()-this.reservedMana);},
    healBy(n){return healLife(this,n,recovery);},gainEs(n){return gainEnergyShield(this,n,ports);},gainPoise(n){return gainPoise(this,n,ports);},
  };
}
const projection=value=>Object.fromEntries(['life','mana','es','poise','healedSince','esDelay','esRecharging',
  'esJustFilled','poiseBroken','gainEvents'].filter(k=>Object.hasOwn(value,k)).map(k=>[k,structuredClone(value[k])]));

// Match the frozen numeric/event fields here. Native cue payloads and complete
// World composition are checked separately in the installed game, not emulated.
for(const expected of rows('restoration'))test('native restoration pools/events: '+expected.input.name,()=>{
  const {input}=expected,a=actor(input);let result,error=null;
  if(input.override!==undefined){const original=a.gainEs.bind(a);a.gainEs=n=>{if(input.callThrough)original(n);return input.override;};}
  try{
    if(input.proc||input.kind==='proc'){
      const effect=scaleProcEffect(input.proc?.effect??{type:'restore',resource:input.resource,flat:input.amount,resetEsDelay:input.resetEsDelay},input.power??1);
      const grew=applyProcRestoration(a,effect,ports);
      assert.equal(grew,expected.after[effect.resource]>expected.before[effect.resource]);
    }else if(input.kind==='instant')result=applyInstantRestoration(a,
      {resource:input.resource,amount:input.amount,resetEsDelay:input.resetEsDelay},ports,{noEvent:input.noEvent});
    else result=input.resource==='es'?a.gainEs(input.amount):a.gainPoise(input.amount);
  }catch(e){error=String(e);}
  assert.equal(error,expected.error);assert.equal(result,expected.result);
  assert.deepEqual(projection(a),projection(expected.after));
});

for(const expected of rows('query-order'))test('native gain query order: '+expected.resource+' '+expected.input.name,()=>{
  const {input,resource}=expected,a=actor(input),events=[];
  // The native driver overrides the maximum query after creating a 100-base sheet.
  a.maximum=100;
  const state=()=>({current:a[resource],dead:a.dead,filled:a.esJustFilled,broken:a.poiseBroken});
  const gain=n=>resource==='es'?a.gainEs(n):a.gainPoise(n);let fired=false;
  const action=phase=>{
    if(fired||input.at!==phase)return;fired=true;events.push({phase:'action:'+input.action,state:state()});
    if(input.action==='current')a[resource]=90;
    if(input.action==='dead')a.dead=true;
    if(input.action==='maximum')a.maximum=50;
    if(input.action==='throw')throw Error('observed-query-failure');
    if(input.action==='reenter'||input.action==='nested-fill'){
      const result=gain(input.action==='reenter'?5:70);events.push({phase:'nested-return',result,state:state()});
    }
  };
  a[resource==='es'?'maxEs':'maxPoise']=()=>{
    events.push({phase:'maximum-before',state:state()});action('maximum');
    const result=Object.hasOwn(input,'maximum')?input.maximum:a.maximum;
    events.push({phase:'maximum-return',result,state:state()});return result;
  };
  Object.defineProperty(a,'overcharge',{get(){events.push({phase:'overcharge-before',state:state()});action('overcharge');
    const result=input.overcharge??0;events.push({phase:'overcharge-return',result,state:state()});return result;}});
  const before=state();let result,error=null;try{result=gain(input.amount??20);}catch(e){error=String(e);}
  assert.deepEqual({resource,input,before,result,error,events,after:state()},expected);
});

for(const expected of rows('invocation'))test('native restoration invocation: '+expected.kind+' '+expected.resource+' '+expected.scenario,()=>{
  const {kind,resource,method,scenario}=expected,a=actor(),other=actor(),events=[];
  const native=a[method];
  function selected(amount){events.push({phase:'original',receiver:this===a?'owner':'other',amount});return Reflect.apply(native,this,[amount]);}
  function replacement(amount){assert.equal(this,a);events.push({phase:'replacement',amount});return 7;}
  if(scenario==='custom-call-property')Object.defineProperty(selected,'call',{get(){throw Error('Unexpected custom .call read');}});
  a[method]=scenario==='bound-receiver'?selected.bind(other):selected;
  const effect={resource,amount:10};
  if(scenario==='replace-method'&&kind==='instant')Object.defineProperty(effect,'amount',{get(){events.push({phase:'amount'});a[method]=replacement;return 10;}});
  if(scenario==='replace-method'&&kind==='proc'){
    a[resource==='es'?'maxEs':'maxPoise']=()=>{events.push({phase:'maximum'});a[method]=replacement;return 100;};
  }
  let result;if(kind==='instant')result=applyInstantRestoration(a,effect,ports);
  else assert.equal(applyProcRestoration(a,{type:'restore',resource,flat:10},ports),
    expected.after.owner[resource]>expected.before.owner[resource]);
  assert.equal(result,expected.result);assert.deepEqual(events,expected.events);
  for(const [actual,wanted] of [[a,expected.after.owner],[other,expected.after.other]])
    for(const [key,value] of Object.entries(projection(wanted)))assert.deepEqual(actual[key],value,key);
});

for(const expected of rows('partial-failure'))test('native restoration failure boundary: '+JSON.stringify(expected.spec),()=>{
  const {spec}=expected,a=actor({current:spec.full?100:40,eventCount:spec.capacity?64:0}),events=[];
  const fail=label=>{events.push(label);throw Error('observed-'+label);};
  const effect=spec.kind==='instant'?{resource:spec.resource,amount:20}:{type:'restore',resource:spec.resource,flat:20};
  if(spec.at==='reset')Object.defineProperty(effect,'resetEsDelay',{get(){return fail('reset');}});
  if(spec.at==='maximum')a[spec.resource==='mana'?'availableMaxMana':'maxEs']=()=>{a[spec.resource]=45;return fail('maximum');};
  const options={};for(const [at,key] of [['feedingCue','feedingCue'],['noEvent','noEvent'],['tags','tags'],
    ['ignoredCue','feedingCue'],['ignoredNoEvent','noEvent'],['ignoredTags','tags']])
    if(spec.at===at)Object.defineProperty(options,key,{get(){return fail(key);}});
  if(spec.at==='push')Object.defineProperty(a.gainEvents,'push',{value(){return fail('push');}});
  const tags=['spell','physical'];if(spec.at==='sharedTags')options.tags=tags;
  let result,error=null,sharedTags;
  try{if(spec.kind==='instant')result=applyInstantRestoration(a,effect,ports,options);else applyProcRestoration(a,effect,ports);}
  catch(e){error=String(e);}
  if(spec.at==='sharedTags'){sharedTags=a.gainEvents[0].tags===tags;tags.push('fire');}
  assert.equal(result,expected.result);assert.equal(error,expected.error);assert.deepEqual(events,expected.events);
  assert.equal(sharedTags,expected.sharedTags);
  for(const key of ['mana','es','poise','esDelay'])assert.equal(a[key],expected.after[key],key);
  assert.deepEqual(Array.from(a.gainEvents),expected.after.gains);
  assert.equal(a.notifications.filter(n=>n.amount>0).length,expected.after.restoreGains.length);
});

test('independent caps, reservation bases, overcharge and actor isolation',()=>{
  const a=actor({current:20,reserved:60,overcharge:.5}),b=actor({current:7});
  assert.equal(gainEnergyShield(a,200,ports),80);assert.equal(a.es,100);assert.equal(a.esJustFilled,true);
  assert.equal(gainPoise(a,200,ports),130);assert.equal(a.poise,150);
  assert.equal(applyProcRestoration(a,{type:'restore',resource:'mana',pctMax:.3},ports),true);assert.equal(a.mana,40);
  a.poise=0;applyProcRestoration(a,{type:'restore',resource:'poise',pctMax:.5},ports);assert.equal(a.poise,50);
  assert.equal(applyInstantRestoration(a,{resource:'mana',amount:-15},ports),-15);assert.equal(a.mana,25);
  assert.deepEqual([b.life,b.mana,b.es,b.poise,b.healedSince,b.gainEvents.length],[7,7,7,7,0,0]);
});
test('zero percentage still queries maximum and can itself grow the proc pool',()=>{
  for(const pctMax of [undefined,0]){
    const a=actor(),calls=[];a.maxEs=()=>{calls.push('maximum');a.es=45;return 100;};
    a.gainEs=n=>{calls.push(['gain',n]);return 0;};
    assert.equal(applyProcRestoration(a,{type:'restore',resource:'es',pctMax},ports),true);
    assert.deepEqual(calls,['maximum',['gain',0]]);assert.equal(a.gainEvents.length,0);
  }
});
test('event queue and push method are selected before evaluating tags',()=>{
  const a=actor(),original=a.gainEvents,calls=[],tags=['spell'];
  original.push=function(value){assert.equal(this,original);calls.push(value);return 1;};
  const options={get tags(){original.push=()=>{throw Error('replacement push');};a.gainEvents=[];return tags;}};
  assert.equal(applyInstantRestoration(a,{resource:'mana',amount:3},ports,options),3);
  assert.equal(calls.length,1);assert.equal(calls[0].tags,tags);assert.equal(a.gainEvents.length,0);
});
test('feeding notification failures retain the gain and skip later event reads',()=>{
  const a=actor(),failure=Error('notification'),options={get noEvent(){throw Error('unexpected event read');}};
  assert.throws(()=>applyInstantRestoration(a,{resource:'es',amount:5,resetEsDelay:true},
    {...ports,noteGain(){throw failure;}},options),e=>e===failure);
  assert.equal(a.es,45);assert.equal(a.esDelay,0);assert.equal(a.gainEvents.length,0);
});
test('instant mana samples capacity before the live pool and amount getter',()=>{
  const a=actor(),calls=[];a.availableMaxMana=()=>{calls.push('capacity');a.mana=70;return 100;};
  const effect={resource:'mana',get amount(){calls.push('amount');a.mana=90;return 10;}};
  assert.equal(applyInstantRestoration(a,effect,ports),40);assert.equal(a.mana,80);
  assert.deepEqual(calls,['capacity','amount']);assert.equal(a.gainEvents[0].n,40);
});
