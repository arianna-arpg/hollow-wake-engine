import fs from 'node:fs';import {gunzipSync} from 'node:zlib';import {test} from 'node:test';import assert from 'node:assert/strict';
const {scaleProcEffect,gainWard,applyWardEffect}=await import(process.env.HOLLOW_WAKE_PROC_EFFECTS_MODULE??'../dist/proc-effects.js');
const fixture=name=>JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-thirty-nine/'+name+'.json.gz',import.meta.url))));
const encode=v=>v===undefined?{$undefined:true}:typeof v==='number'&&!Number.isFinite(v)?{$number:String(v)}:v===null||typeof v!=='object'?v:Array.isArray(v)?v.map(encode):Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]));
const decode=v=>{if(v===null||typeof v!=='object')return v;if(Object.keys(v).length===1&&v.$undefined===true)return undefined;if(Object.keys(v).length===1&&Object.hasOwn(v,'$number'))return Number(v.$number);return Array.isArray(v)?v.map(decode):Object.fromEntries(Object.entries(v).map(([k,x])=>[k,decode(x)]));};
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};

test('magnitude fold matches 1036 unchanged original observations and input identities',()=>{
  const expected=fixture('proc-effects-scaling'),inputs=new Map(expected.inputs.map(r=>[r.id,freeze(decode(r.effect))]));
  for(const row of expected.rows){const fx=inputs.get(row.id),before=encode(fx),out=scaleProcEffect(fx,decode(row.power));
    const nested=Object.fromEntries(['cast','damage','healAllies','buff','birth'].filter(k=>Object.hasOwn(fx,k)).map(k=>[k,out[k]===fx[k]]));
    assert.deepEqual({id:row.id,type:fx.type,power:row.power,sameInput:out===fx,nestedIdentity:nested,keys:Object.keys(out),result:encode(out)},row,row.id);
    assert.deepEqual(encode(fx),before);
  }
  assert.equal(expected.rows.length,1036);
});
test('magnitude metadata matches eight original frozen-input observations',()=>{
  const expected=fixture('proc-magnitude-metadata');
  for(const row of expected.rows){const fx=freeze(decode(row.input)),out=scaleProcEffect(fx,row.power);
    const identity=Object.fromEntries(['outer','damage','healAllies','cast','extra'].filter(k=>Object.hasOwn(fx,k)).map(k=>[k,out[k]===fx[k]]));
    assert.deepEqual({name:row.name,power:row.power,input:encode(fx),sameInput:out===fx,identity,keys:Object.keys(out),result:encode(out)},row);
  }
});
test('ward resource matches all 15 original callback, arithmetic and failure observations',()=>{
  for(const row of fixture('proc-ward-resource').rows){
    const input=decode(row.input),actor={ward:input.ward,dead:input.dead},calls=[];let reads=0,nested=false;
    const ports={rate(a){reads++;calls.push({phase:'rate',ward:a.ward,dead:a.dead});
      if(row.name==='rate-failure')throw new Error('rate-failure');
      if(row.name==='nested-during-rate'&&!nested){nested=true;const returned=gainWard(a,3,ports);calls.push({phase:'nested-return',returned,ward:a.ward});}
      if(row.name==='death-during-rate')a.dead=true;if(row.name==='pool-change-during-rate')a.ward=100;return input.rate;
    }};
    let result,failure=null;try{result=gainWard(actor,input.amount,ports);}catch(error){failure=error.message;}
    assert.deepEqual(encode({name:row.name,input,result,ward:actor.ward,dead:actor.dead,reads,calls,failure}),row,row.name);
  }
});
test('scaled ward uses maximum life, then the live pool, then native rate and growth',()=>{
  const calls=[];let pool=6;const actor={dead:false,get ward(){calls.push('read:'+pool);return pool;},set ward(value){calls.push('set:'+value);pool=value;}};
  const resources={rate(){calls.push('rate');return .5;}},ports={maximumLife(){calls.push('life');return 1000;},gain(a,n){calls.push('gain:'+n);return gainWard(a,n,resources);}};
  assert.equal(applyWardEffect(actor,scaleProcEffect({type:'ward',flat:10,pctMaxLife:.1},2),ports),true);
  assert.equal(pool,116);assert.deepEqual(calls,['life','read:6','gain:220','rate','read:6','set:116','read:116']);
});
test('maximum-life callback changes precede the before-value even for a zero effect',()=>{
  const actor={ward:0};assert.equal(applyWardEffect(actor,{type:'ward'}, {maximumLife(a){a.ward=10;return 100;},gain(){assert.fail('zero amount called gain');}}),false);assert.equal(actor.ward,10);
});
test('ward effect skips nonpositive amounts, but still reads maximum life',()=>{
  for(const flat of [0,-1,NaN]){let reads=0;const actor={ward:5};assert.equal(applyWardEffect(actor,{type:'ward',flat},{maximumLife(){reads++;return 100;},gain(){assert.fail('nonpositive amount called gain');}}),false);assert.equal(reads,1);}
});
test('ward cue decision uses actual growth independently of the gain return value',()=>{
  const actor={ward:5};assert.equal(applyWardEffect(actor,{type:'ward',flat:4},{maximumLife:()=>100,gain:()=>999}),false);
  assert.equal(applyWardEffect(actor,{type:'ward',flat:4},{maximumLife:()=>100,gain(a,n){a.ward+=n;return 0;}}),true);assert.equal(actor.ward,9);
});
test('nested ward effects have independent before-values and committed gain failures propagate',()=>{
  const actor={ward:6,dead:false},calls=[];let nested=false;const resources={rate:()=>1};
  const ports={maximumLife:()=>1000,gain(a,n){const gained=gainWard(a,n,resources);if(!nested){nested=true;calls.push(applyWardEffect(a,{type:'ward',flat:3},ports));}return gained;}};
  assert.equal(applyWardEffect(actor,{type:'ward',flat:220},ports),true);assert.deepEqual(calls,[true]);assert.equal(actor.ward,229);
  const failure=new Error('after gain');assert.throws(()=>applyWardEffect(actor,{type:'ward',flat:2},{maximumLife:()=>1000,gain(a,n){gainWard(a,n,resources);throw failure;}}),error=>error===failure);assert.equal(actor.ward,231);
});
test('a failed rate query leaves the pool unchanged and prevents any later read/write',()=>{
  const failure=new Error('rate'),actor={dead:false,get ward(){assert.fail('pool accessed after failed rate');},set ward(_){assert.fail('pool changed after failed rate');}};
  assert.throws(()=>gainWard(actor,10,{rate(){throw failure;}}),error=>error===failure);
});
test('shared resource ports preserve receiver binding and isolate actor pools',()=>{
  const a={dead:false,ward:1},b={dead:false,ward:7},ports={multiplier:2,rate(){return this.multiplier;}};
  assert.equal(gainWard(a,3,ports),6);assert.equal(a.ward,7);assert.equal(b.ward,7);assert.equal(gainWard(b,5,ports),10);assert.equal(b.ward,17);assert.equal(a.ward,7);
});
