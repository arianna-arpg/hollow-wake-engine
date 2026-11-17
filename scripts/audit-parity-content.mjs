import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,writeJSON} from './reference-utils.mjs';
import {readCatalogue} from './catalogue-tools.mjs';
import {readPrototypeContent,assertInheritedContent} from './prototype-content.mjs';
const previous=readCatalogue(),profile=readPrototypeContent(),current=profile.catalogue;
assertInheritedContent(profile);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b),tables={};
for(const table of new Set([...Object.keys(previous.tables),...Object.keys(current.tables)])){
 const before=new Map(previous.tables[table]?.map(r=>[r.id,r.value])),after=new Map(current.tables[table]?.map(r=>[r.id,r.value]));
 tables[table]=[...new Set([...before.keys(),...after.keys()])].flatMap(id=>{
  const a=before.get(id),b=after.get(id);if(equal(a,b))return [];
  return [{id,change:a===undefined?'added':b===undefined?'removed':'changed',
   fields:[...new Set([...Object.keys(a??{}),...Object.keys(b??{})])].filter(k=>!equal(a?.[k],b?.[k]))}];
 });
}
const result={schemaVersion:1,source:profile.lock.commit,tables},file=path.join(root,'baseline/prototype-parity/content-difference.json');
if(process.argv.includes('--check'))assert(equal(JSON.parse(fs.readFileSync(file)),result),'Content difference inventory changed; review before regenerating');else writeJSON(file,result);
console.log(JSON.stringify({passed:true,changed:Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length])),inheritedPacks:'tables, orders, executable rules and pack source hashes verified'}));
