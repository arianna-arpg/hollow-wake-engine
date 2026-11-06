import test from 'node:test';import assert from 'node:assert/strict';
import {decodeContentTable,CONTENT_TABLE_LIMITS} from '../dist/content-table.js';
import {ItemContent,ItemRules} from '../dist/item-rules.js';
import {encodeContentTable} from '../dist/content-table-compiler.js';
import {itemPack} from '../scripts/compile-item-content.mjs';
const plain=value=>JSON.parse(JSON.stringify(value));
const table=nodes=>({schemaVersion:1,capability:'content-table/v1',root:nodes.length-1,nodes});

test('content tables retain ordered values, reserved keys, Unicode and negative zero',()=>{
  const input=JSON.parse('{"z":1,"__proto__":{"safe":true},"constructor":"kept","prototype":null,"a":[false,"\\u0000雪😀",0]}');input.a.push(-0);
  const packet=encodeContentTable(input),decoded=decodeContentTable(JSON.parse(JSON.stringify(packet)));
  assert.equal(JSON.stringify(decoded),JSON.stringify(input));assert(Object.is(decoded.a.at(-1),-0));
  assert.equal(Object.getPrototypeOf(decoded),null);assert.equal(decoded.__proto__.safe,true);assert.equal(Object.keys(decoded)[0],'z');
  assert(Object.isFrozen(decoded)&&Object.isFrozen(decoded.a)&&Object.isFrozen(decoded.__proto__));
  assert.throws(()=>{decoded.a.push(2)});assert.equal({}.safe,undefined);
});

test('equal immutable children share storage without retaining caller objects',()=>{
  const input={first:{ranges:[[1,2],[3,4]]},second:{ranges:[[1,2],[3,4]]}},packet=encodeContentTable(input),decoded=decodeContentTable(packet);
  assert.equal(decoded.first,decoded.second);assert.equal(decoded.first.ranges[0],decoded.second.ranges[0]);assert.notEqual(decoded.first,input.first);
  input.first.ranges[0][0]=99;packet.nodes.length=0;assert.equal(decoded.first.ranges[0][0],1);
  assert.deepEqual(encodeContentTable({b:1,a:2}),encodeContentTable({b:1,a:2}));
  assert.notEqual(JSON.stringify(encodeContentTable({b:1,a:2})),JSON.stringify(encodeContentTable({a:2,b:1})));
});

test('the decoder rejects malformed references, rows, fields and object keys',()=>{
  for(const input of [null,[],{}, {...table([[0,1]]),extra:1},{...table([[0,1]]),schemaVersion:2},
    {...table([[0,1]]),root:1},table([]),table([[]]),table([[9]]),table([[0]]),table([[0,1,2]]),table([[3,0]]),table([[0,NaN]]),table([[0,-0]]),table([[0,{}]]),
    table([[1,0]]),table([[0,1],[1,-1]]),table([[0,1],[1,.5]]),table([[0,1],[1,Infinity]]),table([[0,1],[1,2]]),
    table([[0,1],[0,2]]),table([[0,1],[2,0]]),table([[0,1],[2,0,0]]),table([[0,'x'],[0,1],[2,0,1,0,1]])]){
    assert.throws(()=>decodeContentTable(input),/Invalid content table/);
  }
});

test('the table boundary rejects executable, hidden, symbolic, sparse and exotic data without getters',()=>{
  let reads=0;const getter=table([[0,1]]);Object.defineProperty(getter,'root',{enumerable:true,get(){reads++;return 0;}});
  const row=table([[0,1]]);Object.defineProperty(row.nodes[0],'1',{enumerable:true,get(){reads++;return 1;}});
  const hidden=table([[0,1]]);Object.defineProperty(hidden,'hidden',{value:1});
  const hiddenIndex=table([[0,1]]);Object.defineProperty(hiddenIndex.nodes[0],'1',{value:1,enumerable:false});
  const symbol=table([[0,1]]);symbol.nodes[0][Symbol('extra')]=1;
  const extra=table([[0,1]]);extra.nodes.tag=1;
  const exotic=table([[0,1]]);Object.setPrototypeOf(exotic.nodes[0],null);
  for(const bad of [getter,row,hidden,hiddenIndex,symbol,extra,exotic,table([[1,,]])])assert.throws(()=>decodeContentTable(bad));
  assert.equal(reads,0);
});

test('transport limits bound depth, logical expansion, nodes, edges and strings',()=>{
  const deep=[[0,1]];for(let i=0;i<CONTENT_TABLE_LIMITS.depth;i++)deep.push([1,i]);assert.doesNotThrow(()=>decodeContentTable(table(deep)));
  deep.push([1,deep.length-1]);assert.throws(()=>decodeContentTable(table(deep)),/depth limit/);
  const expanded=[[0,1]];for(let i=0;i<23;i++)expanded.push([1,i,i]);assert.throws(()=>decodeContentTable(table(expanded)),/expanded value limit/);
  assert.throws(()=>decodeContentTable(table([[0,'x'.repeat(CONTENT_TABLE_LIMITS.stringUnits+1)]])),/string limit/);
  assert.throws(()=>decodeContentTable(table(Array(CONTENT_TABLE_LIMITS.nodes+1).fill([0,1]))),/dense array required/);
  assert.throws(()=>decodeContentTable(table([[0,1],[1,...Array(CONTENT_TABLE_LIMITS.references).fill(0)],[1,0,1]])),/reference limit/);
});

test('offline compilation rejects unsupported data instead of losing it',()=>{
  let reads=0;const accessor={};Object.defineProperty(accessor,'a',{enumerable:true,get(){reads++;return 1;}});
  const cyclic={};cyclic.self=cyclic;const hidden={};Object.defineProperty(hidden,'a',{value:1});
  for(const bad of [undefined,Infinity,()=>1,1n,Symbol('value'),new Date(),cyclic,accessor,hidden,{[Symbol('key')]:1},Array(3)])assert.throws(()=>encodeContentTable(bad));
  assert.equal(reads,0);
});

test('the complete item pack roundtrips exactly and retains every authored registry order',()=>{
  const input=itemPack(),encoded=encodeContentTable(input),decoded=decodeContentTable(JSON.parse(JSON.stringify(encoded)));
  assert.equal(JSON.stringify(decoded),JSON.stringify(input));
  const content=new ItemContent(decoded);assert.equal(JSON.stringify(content.pack),JSON.stringify(input));
  for(const key of ['bases','affixes','uniques','vestiges'])assert.deepEqual(Object.keys(content.pack[key]),Object.keys(input[key]));
  assert.equal(Object.keys(content.pack.affixes).length,3929);assert.equal(Object.keys(content.pack.uniques).length,59);
  assert.notEqual(content.pack,decoded);assert.notEqual(content.pack.affixes,decoded.affixes);
});

test('compiled content preserves full deterministic item rolls and continuation against ordinary content',()=>{
  const input=itemPack(),normal=new ItemContent(input),shared=new ItemContent(decodeContentTable(encodeContentTable(input)));
  const a=new ItemRules(normal,894),b=new ItemRules(shared,894);
  for(const base of Object.values(input.bases))for(const rarity of ['common','magic','rare']){
    const options={baseId:base.id,ilvl:80,rarity};const first=a.roll(options),second=b.roll(options);assert.deepEqual(second,first);
    if(first){assert.deepEqual(b.compile(second),a.compile(first));assert.deepEqual(b.ownStats(second),a.ownStats(first));}
  }
  for(const unique of Object.values(input.uniques)){
    const options={baseId:unique.baseId,uniqueId:unique.id,ilvl:80},first=a.forge(options),second=b.forge(options);
    assert.deepEqual(second,first);assert.deepEqual(b.resolveChoices(second),a.resolveChoices(first));
  }
  assert.deepEqual(b.snapshot(),a.snapshot());
});

test('frozen input remains detached even when only the root is frozen; live item copies remain independent',()=>{
  const input=itemPack(),bases=Object.values(input.bases);
  const sharedTags=['shared'];bases[0].tags=sharedTags;bases[1].tags=sharedTags;Object.freeze(input);
  const content=new ItemContent(input);assert.equal(content.pack.bases[bases[0].id].tags,content.pack.bases[bases[1].id].tags);
  assert.notEqual(content.pack.bases[bases[0].id].tags,sharedTags);sharedTags.push('external');assert.deepEqual(content.pack.bases[bases[0].id].tags,['shared']);
  const bad=itemPack();bad.extra=bad;Object.freeze(bad);assert.throws(()=>new ItemContent(bad),/cycles/);
  const rules=new ItemRules(content,17),first=rules.forge({baseId:'ring_lapis',ilvl:1}),second=rules.forge({baseId:'ring_lapis',ilvl:1});
  assert.notEqual(first.affixes,second.affixes);assert.notEqual(first.implicitRolls,second.implicitRolls);
  assert.equal(Object.isFrozen(first),false);assert.equal(Object.isFrozen(content.pack),true);assert.deepEqual(plain(content.pack.bases[bases[0].id].tags),['shared']);
});
