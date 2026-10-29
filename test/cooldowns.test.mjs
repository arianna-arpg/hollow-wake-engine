import test from 'node:test';import assert from 'node:assert/strict';
import {readCooldownExpectations} from '../scripts/check-cooldown-contract.mjs';
const {applyProcCooldown:apply}=await import(process.env.HWE_COOLDOWN_MODULE??'../dist/cooldowns.js');
const {fixtures}=readCooldownExpectations(),S='__cooldown_strike',F='__cooldown_fire',U='__cooldown_unslotted';
const decode=value=>value?.$number==='-0'?-0:Array.isArray(value)?value.map(decode):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,decode(v)])):value;
const skill=row=>row?{def:{id:row.id,tags:[...row.tags]}}:null;

for(const raw of fixtures.get('rules').value.rows)test('native cooldown rules: '+raw.name,()=>{
  const row=decode(raw),input=row.input,actor={cooldowns:new Map(row.before.clocks),
    skills:(input.bars??[{id:S,tags:['attack','melee','physical']},{id:F,tags:['spell','fire']}]).map(skill)},
    trigger=input.noTrigger?null:actor.skills[0],calls=[];let fired=false;
  actor.cooldowns.set=function(id,value){calls.push({method:'set',id,value});const fire=!fired;fired=true;
    if(fire&&input.hook==='throw-before')throw Error('before-write');
    const result=Map.prototype.set.call(this,id,value);
    if(fire){
      if(input.hook==='nested')apply(actor,{type:'cooldown',seconds:1},trigger);
      if(input.hook==='insert')Map.prototype.set.call(this,'late',20);
      if(input.hook==='delete')Map.prototype.delete.call(this,F);
      if(input.hook==='throw-after')throw Error('after-write');
    }return result;};
  actor.cooldowns.delete=function(id){calls.push({method:'delete',id});return Map.prototype.delete.call(this,id);};
  for(const stage of row.stages){let failure=null,result;
    try{result=apply(actor,input.effect,trigger);}catch(error){failure=error.message;}
    assert.equal(failure,input.hook==='rider-throw'?null:stage.failure);
    assert.deepEqual([...actor.cooldowns],stage.state.clocks);
    assert.deepEqual(calls,stage.calls.filter(c=>c.method==='set'||c.method==='delete'));
    if(!failure&&stage.phase===0&&!input.dead&&!input.cueDisabled&&!input.announceDisabled)assert.equal(result,input.cue!==false);
  }
});

for(const row of fixtures.get('live').value.rows)test('native cooldown live boundary: '+row.input.name,()=>{
  const name=row.input.name,effect=structuredClone(row.input.effect),actor={cooldowns:new Map(row.before.clocks),skills:row.before.bars.map(skill)},
    original=actor.cooldowns,other=new Map(),trigger=actor.skills.find(Boolean),calls=[];let first=true;
  const entries=map=>Array.from(Map.prototype.entries.call(map));
  const replacement=function(id,value){calls.push({method:'replacement-set',id,value,receiver:this===original?'original':'other'});return Reflect.apply(Map.prototype.set,this,[id,value*2]);};
  original.set=function(id,value){calls.push({method:'set',id,value});const result=Reflect.apply(Map.prototype.set,this,[id,value]);
    if(first){first=false;
      if(name==='bar-replaced')actor.skills=[];
      if(name==='bar-retagged')actor.skills[1].def={...actor.skills[1].def,tags:['cold']};
      if(name==='trigger-retargeted')trigger.def={...trigger.def,id:U};
      if(name==='map-replaced')actor.cooldowns=new Map([['late',20]]);
      if(name==='method-replaced')original.set=replacement;
      if(name==='seconds-replaced')effect.seconds=3;
      if(name==='skills-replaced')effect.skills=[S];
    }return result;};
  original.delete=function(id){calls.push({method:'delete',id});if(name==='delete-before')throw Error(name);
    const result=Reflect.apply(Map.prototype.delete,this,[id]);if(name==='delete-after')throw Error(name);return result;};
  if(name==='selected-method-receiver')Object.defineProperty(original,'set',{get(){calls.push({method:'select-set'});actor.cooldowns=new Map([['late',20]]);
    return function(id,value){calls.push({method:'selected-set',id,value,receiver:this===original?'original':'other'});return Reflect.apply(Map.prototype.set,this,[id,value]);};}});
  if(name==='bound-method-receiver')original.set=replacement.bind(other);
  if(name==='custom-call-property')Object.defineProperty(original.set,'call',{get(){assert.fail('Custom call property read');}});
  if(name==='tags-throw'||name==='reset-throw'){
    let reads=0;const property=name==='tags-throw'?'tags':'reset';
    Object.defineProperty(effect,property,{get(){calls.push({method:property+'-get',read:++reads});if(reads===(property==='tags'?3:2))throw Error(name);return property==='tags'?['fire']:undefined;}});
  }
  if(name.startsWith('snapshot-iterator-'))original[Symbol.iterator]=function*(){let yielded=false;
    try{for(const entry of Reflect.apply(Map.prototype[Symbol.iterator],this,[])){calls.push({method:'iterator-yield',id:entry[0]});yield entry;
      if(!yielded){yielded=true;if(name==='snapshot-iterator-failure')throw Error(name);actor.skills=[];}
    }}finally{calls.push({method:'iterator-closed'});}return undefined;};
  if(name==='named-selector-callback'){const skills=effect.skills;skills.includes=function(id,from){calls.push({method:'skills-includes',id,receiver:this===skills});
    actor.cooldowns=new Map([['late',20]]);return Reflect.apply(Array.prototype.includes,this,[id,from]);};}
  if(name==='tag-selector-callback'){const tags=effect.tags;tags.every=function(predicate,thisArg){calls.push({method:'tags-every',receiver:this===tags});
    actor.skills[0].def={...actor.skills[0].def,tags:['cold']};return Reflect.apply(Array.prototype.every,this,[predicate,thisArg]);};}
  if(name==='seconds-getter-selects-method')Object.defineProperty(effect,'seconds',{get(){calls.push({method:'seconds-get'});original.set=replacement;return 1.5;}});
  let failure=null;try{apply(actor,effect,trigger);}catch(error){failure=error.message;}
  assert.equal(failure,name==='cue-before'||name==='cue-after'?null:row.failure);
  assert.deepEqual(calls,row.calls.filter(call=>!call.method.startsWith('cue-')&&!call.method.startsWith('riders-')));
  const after=row.after;assert.deepEqual(entries(actor.cooldowns),after.clocks);assert.deepEqual(entries(original),after.originalClocks);
  assert.deepEqual(entries(other),after.otherClocks);assert.equal(actor.cooldowns===original,after.sameMap);
  assert.deepEqual(actor.skills.map(s=>s?{id:s.def.id,tags:s.def.tags}:null),after.bars);assert.equal(trigger.def.id,after.triggerId);
});

test('cooldown result describes computed reduction; no implicit death gate or clock scheduler',()=>{
  const actor={dead:true,cooldowns:new Map([['single',5]]),skills:[]};actor.cooldowns.set=function(){return this;};
  assert.equal(apply(actor,{type:'cooldown',seconds:1}),true);assert.equal(actor.cooldowns.get('single'),5);
  assert.equal(apply(actor,{type:'cooldown',seconds:-1}),false);assert.equal(actor.cooldowns.get('single'),5);
});
test('cooldown operations accept a synchronous iterable store and keep simulations isolated',()=>{
  const backing=new Map([['a',4]]),store={set(id,n){backing.set(id,n);return this;},delete:id=>backing.delete(id),[Symbol.iterator]:()=>backing[Symbol.iterator]()};
  const a={cooldowns:store,skills:[]},b={cooldowns:new Map([['a',4]]),skills:[]};
  assert.equal(apply(a,{type:'cooldown',seconds:2}),true);assert.deepEqual([...backing],[['a',2]]);assert.deepEqual([...b.cooldowns],[['a',4]]);
});
