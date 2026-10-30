import {test} from 'node:test';
import assert from 'node:assert/strict';
const {TagContextCache}=await import(process.env.HWE_TAG_CONTEXT_MODULE || '../dist/tag-context-cache.js');
const {StatSheet,StatRules}=await import(process.env.HWE_STAT_MODULE || '../dist/index.js');

test('equivalent sets share a canonical encoding regardless of identity or insertion order',()=>{
  const calls=[],cache=new TagContextCache(tags=>{calls.push(tags);return Object.freeze({text:JSON.stringify(tags)});});
  const a=cache.get(new Set(['spell','fire'])),b=cache.get(new Set(['fire','spell']));
  assert.equal(a,b);assert.equal(a.text,'["fire","spell"]');assert.equal(calls.length,2);assert.equal(cache.size,1);
});
test('live sets detect same-size replacement, growth, shrink, clear and restoration',()=>{
  const cache=new TagContextCache(JSON.stringify),tags=new Set(['fire','spell']);
  assert.equal(cache.get(tags),'["fire","spell"]');tags.delete('fire');tags.add('cold');assert.equal(cache.get(tags),'["cold","spell"]');
  tags.add('fire');assert.equal(cache.get(tags),'["cold","fire","spell"]');tags.delete('spell');assert.equal(cache.get(tags),'["cold","fire"]');
  tags.clear();assert.equal(cache.get(tags),'[]');tags.add('spell');tags.add('fire');assert.equal(cache.get(tags),'["fire","spell"]');
});
test('freezing a Set object does not hide subsequent membership changes',()=>{
  const cache=new TagContextCache(JSON.stringify),tags=Object.freeze(new Set(['fire']));cache.get(tags);tags.delete('fire');tags.add('cold');assert.equal(cache.get(tags),'["cold"]');
});
test('readonly views remain live and hits do not iterate or encode another snapshot',()=>{
  const tags=new Set(['fire','spell']);let iterations=0,encodes=0;
  const view={get size(){return tags.size;},has:value=>tags.has(value),*[Symbol.iterator](){iterations++;yield*tags;}};
  const cache=new TagContextCache(t=>{encodes++;return JSON.stringify(t);});
  for(let i=0;i<100;i++)assert.equal(cache.get(view),'["fire","spell"]');
  assert.equal(iterations,1);assert.equal(encodes,2);tags.delete('fire');tags.add('cold');assert.equal(cache.get(view),'["cold","spell"]');assert.equal(iterations,2);
});
test('encoder snapshots are owned, sorted and frozen',()=>{
  let snapshot;const cache=new TagContextCache(tags=>{snapshot=tags;assert(Object.isFrozen(tags));return tags.join('|');});
  const tags=new Set(['z','a']);cache.get(tags);assert.deepEqual(snapshot,['a','z']);tags.clear();assert.deepEqual(snapshot,['a','z']);assert.throws(()=>snapshot.push('x'),TypeError);
});
test('undefined and empty contexts share the permanent empty encoding',()=>{
  let calls=0;const cache=new TagContextCache(tags=>({tags,counter:++calls}));const empty=cache.get();assert.equal(cache.get(new Set()),empty);cache.clear();assert.equal(cache.get(),empty);assert.equal(calls,1);assert.equal(cache.size,0);
});
test('bounded replacement cannot return an evicted context for different membership',()=>{
  const cache=new TagContextCache(tags=>({key:tags.join()}),2),a=cache.get(new Set(['a'])),b=cache.get(new Set(['b']));
  assert.equal(cache.get(new Set(['a'])),a);cache.get(new Set(['c']));assert.equal(cache.size,2);assert.equal(cache.get(new Set(['b'])),b);
  const restored=cache.get(new Set(['a']));assert.equal(restored.key,'a');assert.notEqual(restored,a);assert.equal(cache.size,2);assert.notEqual(cache.get(new Set(['b'])),b);
});
test('default capacity remains bounded under distinct live sets',()=>{
  const cache=new TagContextCache(JSON.stringify);for(let i=0;i<129;i++){assert.equal(cache.get(new Set(['tag:'+i])),JSON.stringify(['tag:'+i]));assert(cache.size<=16);}assert.equal(cache.size,16);
});
test('zero capacity computes nonempty contexts without retaining entries',()=>{
  let calls=0;const cache=new TagContextCache(tags=>{calls++;return JSON.stringify(tags);},0);
  assert.equal(cache.get(new Set(['a'])),'["a"]');assert.equal(cache.get(new Set(['a'])),'["a"]');assert.equal(cache.size,0);assert.equal(calls,3);
});
test('invalid capacity is rejected before calling the encoder',()=>{
  for(const value of [-1,.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){let called=false;assert.throws(()=>new TagContextCache(()=>{called=true;},value),RangeError);assert.equal(called,false);}
});
test('an encoding failure neither evicts nor poisons the previous context',()=>{
  const error=new Error('encoder failed');let calls=0;const cache=new TagContextCache(tags=>{calls++;if(tags.includes('bad'))throw error;return {tags};},1);
  const good=cache.get(new Set(['good']));assert.throws(()=>cache.get(new Set(['bad'])),e=>e===error);assert.equal(cache.size,1);assert.equal(cache.get(new Set(['good'])),good);assert.equal(calls,3);
});
test('undefined encoder results are cached as values',()=>{
  let calls=0;const cache=new TagContextCache(()=>{calls++;});cache.get(new Set(['a']));cache.get(new Set(['a']));assert.equal(calls,2);assert.equal(cache.size,1);
});
test('clear discards retained contexts and does not affect another cache',()=>{
  const first=new TagContextCache(tags=>({tags})),second=new TagContextCache(tags=>({tags}));const tags=new Set(['a']),a=first.get(tags),b=second.get(tags);
  assert.notEqual(a,b);first.clear();assert.equal(first.size,0);assert.notEqual(first.get(tags),a);assert.equal(second.get(tags),b);
});
test('canonical JSON encoding distinguishes separators, escaping and Unicode',()=>{
  const cache=new TagContextCache(JSON.stringify),sets=[['a,b'],['a','b'],[''],['|'],['§'],['"','\\','\n'],['雪','😀'],['e\u0301','é']];
  for(const values of sets)assert.equal(cache.get(new Set(values)),JSON.stringify([...values].sort()));assert.notEqual(cache.get(new Set(['a,b'])),cache.get(new Set(['a','b'])));
});
test('sheet context keys remain distinct for arbitrary stat ids and tag encodings',()=>{
  const definitions=Object.fromEntries(['a','a[]','1:a','','雪😀:[]','x|["y"]'].map((id,i)=>[id,{base:i+1}])),sheet=new StatSheet(new StatRules(definitions));
  for(const tags of [undefined,new Set(),new Set(['a,b']),new Set(['a','b']),new Set(['"',']:', '😀'])])for(const[id,def]of Object.entries(definitions))assert.equal(sheet.get(id,tags),def.base);
  sheet.setSource('scoped',[{stat:'a',kind:'flat',value:9,tags:['a,b']}]);assert.equal(sheet.get('a',new Set(['a,b'])),10);assert.equal(sheet.get('a',new Set(['a','b'])),1);
});
test('cached sheets agree with uncached folds through links, trades and live invalidation',()=>{
  const rules=new StatRules({a:{base:10},b:{base:2},rate:{base:.5},forgo:{base:.25}},[{from:'a',to:'b',rateStat:'rate',forgoStat:'forgo'}]);
  const sheets=[new StatSheet(rules,0),new StatSheet(rules,3,0),new StatSheet(rules,3,1),new StatSheet(rules,32,16)],tags=new Set(['fire']);
  const compare=()=>{for(const stat of ['a','b','rate','forgo'])for(const extra of [undefined,[],[{stat:'a',kind:'flat',value:3}]])for(const base of [undefined,7]){const expected=sheets[0].get(stat,tags,extra,base);for(const sheet of sheets.slice(1))assert.equal(sheet.get(stat,tags,extra,base),expected);}};
  for(const sheet of sheets)sheet.setSource('scoped',[{stat:'a',kind:'flat',value:4,tags:['fire']},{stat:'b',kind:'link',value:.2,fromStat:'a',when:'low'},{stat:'a',kind:'flat',value:2,gauge:'stacks'}]);
  compare();tags.delete('fire');tags.add('cold');compare();for(const sheet of sheets){sheet.setConditions(['low']);sheet.setGauges([['stacks',3]]);}compare();tags.add('fire');compare();
  for(const sheet of sheets){sheet.removeSource('scoped');sheet.setBase('a',20);}compare();assert.equal(sheets[0].get('a'),15);assert.equal(sheets[0].get('b'),12);
});
test('context storage is lazy, independently bounded and survives value invalidation',()=>{
  const rules=new StatRules({a:{base:1}}),sheet=new StatSheet(rules,3,2),disabled=new StatSheet(rules,0,2);
  sheet.get('a');sheet.get('a',new Set());assert.equal(sheet.contextCacheEntries,0);
  for(let i=0;i<10;i++){const tags=new Set(['x:'+i]);sheet.get('a',tags);disabled.get('a',tags);assert(sheet.cacheEntries<=3);assert(sheet.contextCacheEntries<=2);}
  assert.equal(sheet.contextCacheEntries,2);assert.equal(disabled.contextCacheEntries,0);sheet.setBase('a',5);assert.equal(sheet.cacheEntries,0);assert.equal(sheet.contextCacheEntries,2);assert.equal(sheet.get('a',new Set(['x:9'])),5);
});
test('sheet rejects invalid context budgets independently of value-cache settings',()=>{
  const rules=new StatRules({a:{base:1}});for(const capacity of [-1,.5,NaN,Infinity])assert.throws(()=>new StatSheet(rules,0,capacity),/stat context cache bound/);
});
