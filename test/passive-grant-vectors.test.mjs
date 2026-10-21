import test from 'node:test';
import assert from 'node:assert/strict';
import {PassiveGrants} from '../dist/passive-grants.js';

function pack() {
  return {schemaVersion:1,capability:'passive-grants/v1',contentId:'vector-contract',
    attributes:[
      {id:'zeta',perPoint:[{stat:'life',kind:'flat',value:2,tags:['spell']}]},
      {id:'alpha',perPoint:[]},
      {id:'1',perPoint:[{stat:'life',kind:'flat',value:.5}]},
    ],statIds:['life'],supportIds:[],nodes:[],groups:[]};
}

test('base attributes are sampled once in authored order before grant folding',()=>{
  const raw=pack();raw.nodes=[{id:'n',attributes:{zeta:2}}];
  const content=new PassiveGrants(raw),reads=[];let alpha=3;
  const base=Object.create({get alpha(){reads.push('alpha');return alpha;},set alpha(value){alpha=value;}});
  Object.defineProperty(base,'zeta',{get(){reads.push('zeta');base.alpha=4;return 1;}});
  Object.defineProperty(base,'1',{get(){reads.push('1');return .5;}});
  const build=content.begin(base,new Set(['n']),{});
  assert.deepEqual(reads,['zeta','alpha','1']);assert.deepEqual(build.attributes(),{'1':1,zeta:3,alpha:4});
  base.alpha=100;assert.equal(build.attributes().alpha,4);assert.deepEqual(reads,['zeta','alpha','1']);
  assert.deepEqual(build.attributeModifiers(),[{stat:'life',kind:'flat',value:6,tags:['spell']},{stat:'life',kind:'flat',value:.5}]);
});

test('invalid base input stops later reads and never coerces objects into numbers',()=>{
  const content=new PassiveGrants(pack());let after=0,coercions=0;
  for(const value of [NaN,Infinity,-Infinity,'3',{valueOf(){coercions++;return 3;}}]){
    const base={zeta:value,get alpha(){after++;return 2;}};
    assert.throws(()=>content.begin(base,new Set(),{}),/base attribute/);
  }
  assert.equal(after,0);assert.equal(coercions,0);
  assert.deepEqual(content.begin({},new Set(),{}).attributes(),{'1':0,zeta:0,alpha:0});
});

test('derived validation covers attributes without per-point grants and does not poison other builds',()=>{
  const raw=pack();raw.nodes=[{id:'a',attributes:{alpha:Number.MAX_VALUE}},{id:'b',attributes:{alpha:Number.MAX_VALUE}}];
  const content=new PassiveGrants(raw),broken=content.begin({zeta:2},new Set(['a','b']),{}),valid=content.begin({zeta:2,alpha:-2,'1':1.5},new Set(),{});
  assert.throws(()=>broken.attributes(),/derived attribute/);assert.throws(()=>broken.attributeModifiers(),/derived attribute/);
  assert.deepEqual(valid.attributes(),{'1':2,zeta:2,alpha:0});
  assert.deepEqual(valid.attributeModifiers(),[{stat:'life',kind:'flat',value:4,tags:['spell']},{stat:'life',kind:'flat',value:1}]);
});

test('derived results stay detached across item accumulation, rejection and interleaved builds',()=>{
  const content=new PassiveGrants(pack()),a=content.begin({zeta:2},new Set(),{}),b=content.begin({zeta:7},new Set(),{});
  const first=a.attributes(),mods=a.attributeModifiers();first.zeta=900;mods[0].value=900;mods[0].tags.push('caller');
  assert.deepEqual(a.attributes(),{'1':0,zeta:2,alpha:0});assert.equal(b.attributeModifiers()[0].value,14);
  a.addItemModifiers([{stat:'zeta',kind:'flat',value:1},{stat:'zeta',kind:'increased',value:.5}]);
  assert.equal(a.attributes().zeta,5);assert.equal(a.attributeModifiers()[0].value,10);assert.deepEqual(a.attributeModifiers()[0].tags,['spell']);
  assert.throws(()=>a.addItemModifiers([{stat:'zeta',kind:'flat',value:5},{stat:'unknown',kind:'flat',value:1}]));
  assert.equal(a.attributes().zeta,5);assert.equal(b.attributes().zeta,7);assert.equal(first.zeta,900);
});

test('successful reentrant input reads remain committed when an outer batch rejects',()=>{
  const build=new PassiveGrants(pack()).begin({zeta:2},new Set(),{});
  assert.equal(build.attributes().zeta,2);assert.equal(build.attributeModifiers()[0].value,4);
  const input={stat:'zeta',kind:'flat',get value(){
    build.addItemModifiers([{stat:'zeta',kind:'flat',value:3}]);
    assert.equal(build.attributes().zeta,5);assert.equal(build.attributeModifiers()[0].value,10);
    return 7;
  }};
  assert.throws(()=>build.addItemModifiers([input,{stat:'unknown',kind:'flat',value:1}]));
  assert.equal(build.attributes().zeta,5);assert.equal(build.attributeModifiers()[0].value,10);
  build.addItemModifiers([{stat:'zeta',kind:'increased',value:1}]);
  assert.equal(build.attributes().zeta,10);assert.equal(build.attributeModifiers()[0].value,20);
});

test('a rejected derived overflow can recover after a valid percentage change',()=>{
  const build=new PassiveGrants(pack()).begin({zeta:2,alpha:Number.MAX_VALUE},new Set(),{});
  build.addItemModifiers([{stat:'alpha',kind:'increased',value:1}]);
  assert.throws(()=>build.attributes(),/derived attribute/);assert.throws(()=>build.attributeModifiers(),/derived attribute/);
  build.addItemModifiers([{stat:'alpha',kind:'increased',value:-1}]);
  assert.equal(build.attributes().alpha,Number.MAX_VALUE);
  assert.deepEqual(build.attributeModifiers(),[{stat:'life',kind:'flat',value:4,tags:['spell']}]);
});

test('attribute reads do not invoke inherited array-index setters while deriving values',()=>{
  const build=new PassiveGrants(pack()).begin({zeta:2},new Set(),{});
  const previous=Object.getOwnPropertyDescriptor(Array.prototype,'0');let calls=0,attributes;
  try{
    Object.defineProperty(Array.prototype,'0',{configurable:true,set(value){
      calls++;Object.defineProperty(this,'0',{value,writable:true,enumerable:true,configurable:true});
    }});
    attributes=build.attributes();
  }finally{if(previous)Object.defineProperty(Array.prototype,'0',previous);else delete Array.prototype[0];}
  assert.equal(calls,0);assert.deepEqual(attributes,{'1':0,zeta:2,alpha:0});
});
