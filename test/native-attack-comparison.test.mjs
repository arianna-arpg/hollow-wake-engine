import test from 'node:test';import assert from 'node:assert/strict';
import {compareAttackCourse} from '../scripts/native-attack-comparison.mjs';
const fixture=()=>[{value:{rows:[{worlds:[{actors:[{facing:2,life:10}]}]}],trace:[{name:'sequence.flight',phase:'before',args:[{pos:{x:833,y:500},anchor:{x:833,y:500},age:.04,damage:100}]}],random:[.5]}}];
test('native comparison: narrowly permits facing and flight coordinate rounding',()=>{
  const expected=fixture(),actual=structuredClone(expected);actual[0].value.rows[0].worlds[0].actors[0].facing+=4e-16;
  actual[0].value.trace[0].args[0].pos.x+=4e-13;assert.equal(compareAttackCourse(actual,expected,true).differences.length,2);
  assert.throws(()=>compareAttackCourse(actual,expected),/Numeric mismatch/);
});
for(const field of ['age','damage'])test('native comparison: '+field+' stays exact',()=>{
  const expected=fixture(),actual=structuredClone(expected);actual[0].value.trace[0].args[0][field]+=1e-13;
  assert.throws(()=>compareAttackCourse(actual,expected,true),/Numeric mismatch/);
});
test('native comparison: random draws and life stay exact',()=>{
  for(const mutate of [a=>a[0].value.random[0]+=Number.EPSILON,a=>a[0].value.rows[0].worlds[0].actors[0].life+=1e-13]){
    const expected=fixture(),actual=structuredClone(expected);mutate(actual);assert.throws(()=>compareAttackCourse(actual,expected,true),/Numeric mismatch/);
  }
});
test('native comparison: rejects larger drift and unrelated coordinate notifications',()=>{
  for(const [name,phase,delta] of [['sequence.flight','before',1e-10],['other','before',4e-13],['sequence.flight','after',4e-13]]){
    const expected=fixture();Object.assign(expected[0].value.trace[0],{name,phase});const actual=structuredClone(expected);actual[0].value.trace[0].args[0].pos.x+=delta;
    assert.throws(()=>compareAttackCourse(actual,expected,true),/Numeric mismatch/);
  }
});
