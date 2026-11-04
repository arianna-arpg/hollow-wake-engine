import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {transform} from 'esbuild';
import {lowerProcSnapshotStack} from '../scripts/native-proc-delivery-entry.mjs';

const helper = fs.readFileSync(new URL('../reference/export-proc-delivery.ts',import.meta.url),'utf8');
const start = helper.indexOf('function pack('), end = helper.indexOf('type Rig=');
assert(start >= 0 && end > start);
const original = helper.slice(start,end);

async function compile(source) {
  const {code} = await transform(
    'export class Actor {}\nexport const origins=new WeakMap();\nexport '+source,
    {loader:'ts',format:'esm',target:'es2022'},
  );
  return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
}

test('native snapshot keeps source read order, sparse entries, shared identity and own keys',async()=>{
  const modules = await Promise.all([compile(original),compile(lowerProcSnapshotStack(original))]);
  function observe({pack,Actor,origins}) {
    const reads=[], shared={value:-0}, actor=new Actor();
    actor.id=0;
    const sparse=new Array(4);
    sparse[1]=shared;
    Object.setPrototypeOf(sparse,Object.assign(Object.create(Array.prototype),{2:NaN}));
    const root={sparse,actor,map:new Map([[shared,Infinity]]),set:new Set([shared]),other:undefined};
    Object.defineProperty(root,'__proto__',{enumerable:true,value:shared});
    Object.defineProperty(root,'read',{enumerable:true,get(){reads.push('read');return shared;}});
    root.self=root;
    origins.set(root,'original');
    const value=pack(root);
    assert.equal(Object.getPrototypeOf(value),Object.prototype);
    assert(Object.hasOwn(value,'__proto__'));
    assert(!Object.hasOwn(value.sparse,0));
    assert(Object.hasOwn(value.sparse,2));
    return {value,reads};
  }
  assert.deepEqual(observe(modules[1]),observe(modules[0]));
});

test('native snapshot refuses unreviewed or duplicate recorder shapes',()=>{
  assert.throws(()=>lowerProcSnapshotStack(original.replace('v.map((x,i)', 'v.map((x,n)')),/Unreviewed/);
  assert.throws(()=>lowerProcSnapshotStack(original+original),/Unreviewed/);
});
