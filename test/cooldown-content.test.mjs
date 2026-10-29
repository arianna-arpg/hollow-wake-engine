import test from 'node:test';import assert from 'node:assert/strict';
import {readCooldownExpectations} from '../scripts/check-cooldown-contract.mjs';
import {procPack} from '../scripts/compile-proc-content.mjs';
const {compileProcCooldownEffect:compile,COOLDOWN_CONTENT_LIMITS:limits}=await import(process.env.HWE_COOLDOWN_CONTENT_MODULE??'../dist/cooldown-content.js');
test('the existing authored proc pack supplies the complete cooldown catalogue',()=>{
  const rows=procPack().pack.procs.filter(row=>row.effect.type==='cooldown').map(row=>({id:row.id,effect:row.effect}));
  assert.deepEqual(rows,readCooldownExpectations().fixtures.get('live').value.authored);
  for(const row of rows)assert.deepEqual(compile(row.effect),row.effect);
});
test('all twelve initialized authored cooldown effects compile unchanged into owned frozen data',()=>{
  const rows=readCooldownExpectations().fixtures.get('live').value.authored;assert.equal(rows.length,12);
  for(const {effect} of rows){const result=compile(effect);assert.deepEqual(result,effect);assert.notEqual(result,effect);assert(Object.isFrozen(result));
    for(const key of ['skills','tags'])if(effect[key]){assert.notEqual(result[key],effect[key]);assert(Object.isFrozen(result[key]));}}
});
test('cooldown compilation preserves signed values, empty/duplicate selectors and host-defined IDs',()=>{
  const input={type:'cooldown',seconds:-0,fraction:-2,skills:['unslotted','unslotted'],tags:[],reset:true,exceptSelf:true},result=compile(input);
  assert.deepEqual(result,input);input.skills[0]='changed';input.tags.push('fire');input.fraction=99;
  assert.deepEqual(result.skills,['unslotted','unslotted']);assert.deepEqual(result.tags,[]);assert.equal(result.fraction,-2);assert(Object.is(result.seconds,-0));
  assert.deepEqual(compile({type:'cooldown',seconds:undefined,fraction:undefined,skills:undefined,tags:undefined,reset:undefined,exceptSelf:undefined}),{type:'cooldown'});
  assert.deepEqual(compile(Object.assign(Object.create(null),{type:'cooldown'})),{type:'cooldown'});assert(Object.isFrozen(limits));
});
test('cooldown records reject unsupported schemas and accessors without executing them',()=>{
  for(const value of [undefined,null,[],2,'cooldown',new Date(),Object.create({type:'cooldown'})])assert.throws(()=>compile(value));
  for(const type of [undefined,null,'reduceCooldowns','heal'])assert.throws(()=>compile({type}));
  for(const key of ['seconds','fraction'])for(const value of [NaN,Infinity,-Infinity,null,true,'1',{},[]])assert.throws(()=>compile({type:'cooldown',[key]:value}));
  for(const key of ['reset','exceptSelf'])for(const value of [false,null,0,1,'true',{}])assert.throws(()=>compile({type:'cooldown',[key]:value}));
  for(const extra of [{unknown:1},{[Symbol()]:1}])assert.throws(()=>compile({type:'cooldown',...extra}));
  for(const key of ['type','seconds','fraction','skills','tags','reset','exceptSelf']){
    const input={type:'cooldown'};Object.defineProperty(input,key,{enumerable:true,get(){assert.fail('Accessor executed');}});
    assert.throws(()=>compile(input),/data fields/);
    const hidden={type:'cooldown'};Object.defineProperty(hidden,key,{enumerable:false,value:key==='type'?'cooldown':1});assert.throws(()=>compile(hidden),/data fields/);
  }
});
for(const key of ['skills','tags'])test(key+' selectors have bounded dense string data and independent ownership',()=>{
  for(const value of [null,1,'a',{},[null],[undefined],[1],[''],['a'.repeat(limits.identifierLength+1)],new Array(2),new(class extends Array{})(1)])assert.throws(()=>compile({type:'cooldown',[key]:value}));
  const excessive=Array(limits.selectorEntries+1).fill('a');assert.throws(()=>compile({type:'cooldown',[key]:excessive}),/entry limit/);
  const maximum=Array(limits.selectorEntries).fill('x'.repeat(limits.identifierLength));assert.deepEqual(compile({type:'cooldown',[key]:maximum})[key],maximum);
  for(const extra of ['extra',Symbol.iterator,Symbol()]){const input=['a'];Object.defineProperty(input,extra,{value:1});assert.throws(()=>compile({type:'cooldown',[key]:input}),/dense data/);}
  for(const enumerable of [true,false]){const input=['a'];Object.defineProperty(input,'0',{enumerable,get(){assert.fail('Selector getter executed');}});assert.throws(()=>compile({type:'cooldown',[key]:input}),/dense data/);}
  const holeWithExtra=new Array(1);holeWithExtra.extra='x';assert.throws(()=>compile({type:'cooldown',[key]:holeWithExtra}),/dense data/);
});
