import test from 'node:test';
import assert from 'node:assert/strict';
import {copySessionJSON,cloneOwnedJSON,retainSessionPart} from '../dist/session-json.js';

test('retained JSON stays private, immutable and accurately measured',()=>{
  const source=JSON.parse('{"__proto__":{"zero":-0},"units":["🌊","\\n","\\u0002","\\\""]}');
  const part=retainSessionPart(source), frozen=part.value;
  assert.equal(part.bytes,Buffer.byteLength(JSON.stringify(source)));
  assert.equal(part.nodes,8);
  assert.equal(part.depth,2);
  assert(Object.isFrozen(frozen)&&Object.isFrozen(frozen.__proto__)&&Object.isFrozen(frozen.units));
  assert.throws(()=>{frozen.units.push('x')},TypeError);
  source.__proto__.zero=4;
  const envelope=copySessionJSON({one:frozen,two:frozen},part);
  assert.equal(envelope.one,frozen);
  const own=cloneOwnedJSON(envelope);
  assert.equal(Object.getPrototypeOf(own.one),null);
  assert(Object.is(own.one.__proto__.zero,-0));
  own.one.__proto__.zero=3;
  assert(Object.is(own.two.__proto__.zero,-0));
  assert(Object.is(frozen.__proto__.zero,-0));
});

test('sharing an admitted subtree charges it at every use and preserves the ordinary refusal',()=>{
  const nested=(row,levels)=>{while(levels--)row=[row];return row;};
  for(const [value,wrap,error] of [
    [{v:[...Array(8190)].fill(null)},p=>[p,p,p,p],'json-limit'],
    [{v:'a'.repeat(140000)},p=>[p,p],'json-limit'],
    [{v:'界'.repeat(90000)},p=>[p,p],'json-byte-limit'],
    [{v:nested(true,8)},p=>nested(p,8),'json-limit'],
  ]){
    const part=retainSessionPart(value);
    assert.deepEqual(copySessionJSON([part.value],part),copySessionJSON([value]));
    for(const copy of [()=>copySessionJSON(wrap(value)),()=>copySessionJSON(wrap(part.value),part)]){
      assert.throws(copy,e=>e.message===error,error);
    }
  }
});
