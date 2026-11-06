import test from 'node:test';
import assert from 'node:assert/strict';
import {godotDispatch} from '../adapters/godot/shared/number-wire.mjs';

test('Godot bridge preserves decimal edge cases, finite binary64 values, strings and opaque keys',()=>{
  const calls=[];
  const send=godotDispatch((_,v)=>{calls.push(v);return {ok:true,value:v};});
  const values=[0.011704753153026104,Number.MIN_VALUE,Number.MAX_VALUE,Number.MAX_SAFE_INTEGER,1e-200,1e200,2**31,-(2**31)-1,'~f0000000000000000','~~','~','\x01\n雪😀'];
  let state=127;const sample=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
  const bits=Buffer.alloc(8);
  for(let i=0;i<4096;i++){bits.writeUInt32LE(sample());bits.writeUInt32LE(sample(),4);const n=bits.readDoubleLE();if(Number.isFinite(n))values.push(n);}
  const obj=JSON.parse('{"__proto__":{"~key":0.011704753153026104},"constructor":true}');obj.values=values;
  const json=JSON.stringify(obj),frozen=Object.freeze(send(null,['parse',json]).value);
  bits.writeDoubleLE(obj.__proto__['~key']);assert.equal(frozen.__proto__['~key'],'~f'+bits.toString('hex'));
  assert.deepEqual(send(null,['command',frozen]),{ok:true,value:frozen});assert.deepEqual(calls,[obj]);
  assert.equal(send(null,['format',frozen]).text,json);
});

test('invalid wire data and invalid portable text cannot execute a gameplay command',()=>{
  let calls=0;const send=godotDispatch(()=>{calls++;return {ok:true};});
  for(const bad of [['parse','{"x":1,}'],['parse','1e999'],['parse','"\\u0000"'],['parse','{"\\ud800":2}'],
    ['command',['~f000000000000f07f']],['command','~f00'],['command',[1.5]],['command',2**31],['format',['~']],['parse','['.repeat(66)+'0'+']'.repeat(66)],['command',new Array(65536).fill(0)]]){
    assert.deepEqual(send(null,bad),{ok:false,reason:'invalid-json'});
  }
  assert.equal(calls,0);
});
