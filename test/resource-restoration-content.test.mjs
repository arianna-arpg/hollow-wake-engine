import test from 'node:test';import assert from 'node:assert/strict';
import {readRestorationExpectations} from '../scripts/check-restoration-contract.mjs';
import {compileInstantRestorationEffect as instant,compileProcRestorationEffect as proc} from '../dist/resource-restoration-content.js';
test('every native authored restore proc compiles to an owned unchanged record',()=>{
  const {fixtures}=readRestorationExpectations(),authored=fixtures.get('restoration').value.authored;assert.equal(authored.length,23);
  for(const {effect} of authored){const compiled=proc(effect);assert.deepEqual(compiled,effect);assert.notEqual(compiled,effect);assert(Object.isFrozen(compiled));}
});
test('signed finite inputs, optional omission and frozen ownership',()=>{
  for(const resource of ['life','mana','es','poise']){
    const source={type:'restore',resource,amount:-0,resetEsDelay:undefined},compiled=instant(source);
    assert.deepEqual(compiled,{type:'restore',resource,amount:-0});assert(Object.isFrozen(compiled));
    source.amount=99;assert(Object.is(compiled.amount,-0));
  }
  for(const resource of ['mana','es','poise']){
    assert.deepEqual(proc({type:'restore',resource,flat:undefined,pctMax:undefined}),{type:'restore',resource});
    assert.deepEqual(proc({type:'restore',resource,flat:-7,pctMax:-0,resetEsDelay:false}),{type:'restore',resource,flat:-7,pctMax:-0,resetEsDelay:false});
  }
  assert.deepEqual(instant(Object.assign(Object.create(null),{type:'restore',resource:'mana',amount:2})),{type:'restore',resource:'mana',amount:2});
});
for(const [compile,valid,numbers] of [[instant,{type:'restore',resource:'life',amount:3},['amount']],
  [proc,{type:'restore',resource:'mana'},['flat','pctMax']]]){
  test(compile.name+' rejects invalid schemas and unsupported record fields without invoking getters',()=>{
    for(const value of [null,undefined,[],1,'restore',new Date(),Object.create(valid)])assert.throws(()=>compile(value));
    for(const type of [undefined,null,'heal'])assert.throws(()=>compile({...valid,type}));
    for(const resource of [undefined,null,'shield',{},2])assert.throws(()=>compile({...valid,resource}));
    for(const resetEsDelay of [null,0,'false',[]])assert.throws(()=>compile({...valid,resetEsDelay}));
    assert.throws(()=>compile({...valid,unknown:1}));assert.throws(()=>compile({...valid,[Symbol()]:1}));
    for(const key of Object.keys(valid)){
      const source={...valid};Object.defineProperty(source,key,{get(){assert.fail('Accessor must not execute');}});assert.throws(()=>compile(source),/data fields/);
      Object.defineProperty(source,key,{value:valid[key],enumerable:false});assert.throws(()=>compile(source),/data fields/);
    }
    for(const key of numbers)for(const value of [NaN,Infinity,-Infinity,null,'2',[],{},true])assert.throws(()=>compile({...valid,[key]:value}));
  });
}
test('instant and proc schemas cannot be interchanged',()=>{
  assert.throws(()=>instant({type:'restore',resource:'mana',flat:2}));
  assert.throws(()=>proc({type:'restore',resource:'mana',amount:2}));
  assert.throws(()=>proc({type:'restore',resource:'life',flat:2}));
  assert.throws(()=>instant({type:'restore',resource:'mana',amount:undefined}));
});
