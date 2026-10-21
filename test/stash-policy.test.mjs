import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {gunzipSync} from 'node:zlib';
import {StashPolicy} from '../dist/stash-policy.js';
const fixture=JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-twelve/stash.json.gz',import.meta.url))));
const makeDef=d=>({...d,board:{...d.board,open:d.board.rows?(x,y)=>d.board.rows[y]?.[x]==='#':undefined},accepts:i=>d.kind==='all'||(d.kind==='relic'?i.baseId.startsWith('relic_')&&!i.questId:!i.baseId.startsWith('relic_')&&!i.relicKey&&!i.questId)});
const observe=(host,def,entries,state)=>JSON.parse(JSON.stringify({state,cost:host.pageCost(def,state),overflow:host.overflow(entries,state).map(e=>e.key),pages:Array.from({length:state.pages},(_,p)=>host.page(entries,state,p))}));
test('storage repair matches 400 original malformed/retuned layouts without changing any input body',()=>{
 const host=new StashPolicy(i=>fixture.dimensions[i.baseId]);
 for(const row of fixture.repairs){const entries=structuredClone(row.entries),value=structuredClone(row.value),before=JSON.stringify({entries,value}),def=makeDef(row.definition);
  assert.deepEqual(observe(host,def,entries,host.restore(def,entries,value)),row.result);assert.equal(JSON.stringify({entries,value}),before);
 }
});
test('legacy missing fields and repeated UIDs retain the original repair behavior',()=>{
 const edges=JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-twelve/stash-edges.json.gz',import.meta.url)))),host=new StashPolicy(i=>fixture.dimensions[i.baseId]);
 for(const row of edges){const entries=structuredClone(row.entries),value=structuredClone(row.value),def=makeDef(row.definition),before=JSON.stringify({entries,value});
  assert.deepEqual(observe(host,def,entries,host.restore(def,entries,value)),row.result);assert.equal(JSON.stringify({entries,value}),before);
 }
 assert.equal(edges.length,18);
});
test('storage plans match 3000 original commands including cross-page swaps, recovery and save roundtrips',()=>{
 const host=new StashPolicy(i=>fixture.dimensions[i.baseId]);let count=0;
 for(const scenario of fixture.scenarios){const def=makeDef(scenario.definition);let entries=[],state=host.empty(def);
  for(const row of scenario.steps){const c=row.command,before=JSON.stringify({entries,state});
   if(c.type==='withdraw'){entries=entries.filter(e=>e.key!==c.key);state={...state,cells:{...state.cells}};delete state.cells[c.key];}
   else if(c.type==='restore')state=host.restore(def,entries,{...state,pages:c.pages,invested:count%600%30});
   else{
    const entry=c.existing?entries.find(e=>e.key===c.entry.key):structuredClone(c.entry),fit=host.firstFit(def,entries,state,entry.item),plan=host.plan(def,entries,state,entry,c.target,c.vacate);
    assert.deepEqual(JSON.parse(JSON.stringify({fit:fit??null,plan:plan??null})),row.result);assert.equal(JSON.stringify({entries,state}),before);
    if(plan){state=plan;if(c.vacate)entries=entries.filter(e=>e.key!==c.vacate);if(!c.existing)entries.push(entry);}
   }
   state=JSON.parse(JSON.stringify(state));assert.deepEqual(observe(host,def,entries,state),row.after);assert.deepEqual(entries.map(e=>e.key),row.entryKeys);count++;
  }
 }
 assert.equal(count,3000);assert(host.scratchBytes<=4096);
});
test('storage plans own their addresses while bodies and recovery entries remain host-owned',()=>{
 const host=new StashPolicy(i=>i),def={id:'test',board:{w:2,h:1},initialPages:2,maxPages:2,pageCostBase:0,accepts:()=>true};
 const a={key:'a',item:{uid:1,w:1,h:1,payload:{kept:true}}},b={key:'b',item:{uid:2,w:1,h:1}},entries=[a,b],state=host.restore(def,entries);
 const plan=host.plan(def,entries,state,a,{page:1,x:0,y:0});assert(plan);assert.notEqual(plan.cells.b,state.cells.b);plan.cells.b.x=99;assert.equal(state.cells.b.x,1);
 const view=host.page(entries,state,0);assert.notEqual(view[0],a.item);assert.equal(view[0].payload,a.item.payload);assert.equal(a.item.x,undefined);
 assert.equal(host.overflow([a,b,{key:'c',item:{uid:3,w:1,h:1}}],state)[0].key,'c');
 for(const key of ['__proto__','constructor','toString']){const entry={key,item:{uid:key,w:1,h:1}},result=host.restore(def,[entry]);assert(Object.hasOwn(result.cells,key));assert.deepEqual(result.cells[key],{page:0,x:0,y:0});assert.equal(Object.getPrototypeOf(result.cells),Object.prototype);}
});
test('storage refuses invalid contracts and reentrancy before changing caller state',()=>{
 const host=new StashPolicy(i=>i),def={id:'test',board:{w:2,h:1},initialPages:1,maxPages:2,pageCostBase:40,accepts:()=>true},entry={key:'a',item:{uid:1,w:1,h:1}},entries=[entry],state=host.restore(def,entries),before=JSON.stringify({entries,state});
 assert.throws(()=>host.restore({...def,maxPages:257},entries));assert.throws(()=>host.restore(def,[entry,entry]));
 assert.equal(host.plan(def,entries,state,entry,{page:0,x:.5,y:0}),undefined);
 assert.equal(host.plan(def,entries,state,entry,{page:NaN,x:0,y:0}),undefined);
 assert.throws(()=>host.firstFit({...def,accepts:()=>{throw Error('port failure');}},entries,state,entry.item),/port failure/);
 let recursive;recursive=new StashPolicy(i=>{recursive.firstFit(def,[],state,i);return i;});assert.throws(()=>recursive.restore(def,entries),/Reentrant/);
 assert.equal(JSON.stringify({entries,state}),before);
});
test('recovery cannot grow deposit capacity and unequal cross-page swaps must fit simultaneously',()=>{
 const host=new StashPolicy(i=>i),def={id:'test',board:{w:2,h:1},initialPages:2,maxPages:2,pageCostBase:0,accepts:()=>true};
 const entries=Array.from({length:5},(_,i)=>({key:String(i),item:{uid:i,w:1,h:1}})),state=host.restore(def,entries);
 assert.equal(host.overflow(entries,state).length,1);assert.equal(Object.keys(state.cells).length,4);
 const sparse={...state,cells:{...state.cells}};delete sparse.cells['0'];
 assert.equal(host.plan(def,entries,sparse,{key:'new',item:{uid:6,w:1,h:1}},{page:0,x:0,y:0}),undefined);
 const plan=host.plan(def,entries,state,entries[0],state.cells['3']);assert(plan);assert.deepEqual(plan.cells['0'],state.cells['3']);assert.deepEqual(plan.cells['3'],state.cells['0']);
 const a={key:'a',item:{uid:10,w:1,h:1}},b={key:'b',item:{uid:11,w:2,h:1}},block={key:'block',item:{uid:12,w:1,h:1}},unequal=[a,b,block];
 const old={pages:2,invested:0,cells:{a:{page:0,x:0,y:0},b:{page:1,x:0,y:0},block:{page:0,x:1,y:0}}},before=JSON.stringify(old);
 assert.equal(host.plan(def,unequal,old,a,old.cells.b),undefined);assert.equal(JSON.stringify(old),before);
});
