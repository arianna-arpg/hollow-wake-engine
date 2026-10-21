import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {InventoryHost} from '../dist/inventory-host.js';
import {gunzipSync} from 'node:zlib';
const fixture=JSON.parse(fs.readFileSync(new URL('../baseline/milestone-three/inventory.json',import.meta.url)));
test('live inventory queries match the original on overlaps, duplicate identities and transient placements',()=>{
 const observed=JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-eleven/inventory-host.json.gz',import.meta.url))));
 const sizes=new Map(fixture.scenarios.flatMap(s=>Object.values(s.items).map(i=>[i.data.baseId,{w:i.w,h:i.h}]))),host=new InventoryHost(i=>sizes.get(i.baseId));
 for(const row of observed.queries){
  const bag=structuredClone(row.before),item=row.existing>=0?bag[row.existing]:structuredClone(row.itemBefore);
  const board={...row.board,open:row.board.rows?(x,y)=>row.board.rows[y]?.[x]==='#':undefined},index=i=>i?bag.indexOf(i):-1;
  assert.equal(index(host.itemAt(bag,row.x,row.y)),row.at);assert.deepEqual(host.overlapping(bag,item,row.x,row.y).map(i=>bag.indexOf(i)),row.over);
  assert.equal(index(host.swapBlocker(bag,item,row.x,row.y,board)),row.swap);assert.equal(host.canPlace(bag,item,row.x,row.y,board),row.can);
  assert.equal(host.place(bag,item,row.x,row.y,board),row.placed);assert.deepEqual(bag,row.afterPlace);
  assert.equal(host.autoPlace(bag,item,board),row.fitted);assert.deepEqual(bag,row.afterFit);assert.deepEqual(item,row.itemAfter);
 }
 assert.equal(observed.queries.length,1400);
});
test('live inventory host matches all 3000 original transitions without replacing item identity',()=>{
 let count=0;
 for(const scenario of fixture.scenarios){
  const board={...scenario.board,open:(x,y)=>!scenario.board.rows||scenario.board.rows[y][x]==='#'};
  const host=new InventoryHost(i=>scenario.items[String(i.uid)]),bodies=new Map();let bag=[];
  for(const row of scenario.steps){const c=row.command;let result;
   if(c.type==='insert'){
    const item=structuredClone(scenario.items[String(c.id)].data);bodies.set(c.id,item);
    result=c.x===undefined?host.autoPlace(bag,item,board):host.place(bag,item,c.x,c.y,board);
   }else if(c.type==='remove')result=!!host.remove(bag,c.id);
   else{const item=bag.find(i=>i.uid===c.id);if(host.place(bag,item,c.x,c.y,board))result='moved';else{
     const other=host.swapBlocker(bag,item,c.x,c.y,board);result=other?'swapped':'blocked';
     if(other){const x=item.x,y=item.y;delete other.x;delete other.y;assert(host.place(bag,item,c.x,c.y,board));assert(host.place(bag,other,x,y,board));}
   }}
   assert.equal(result,row.result);assert.deepEqual(bag.map(i=>[String(i.uid),i.x,i.y]),row.placements);
   assert.equal(String(host.itemAt(bag,row.query.x,row.query.y)?.uid??''),row.query.id);
   for(const item of bag)assert.equal(item,bodies.get(item.uid));
   // An externally replaced array must not leave an old cached grid behind.
   if(++count%17===0)bag=[...bag];
  }
  assert(host.scratchBytes<=4096);
 }
 assert.equal(count,3000);
});
const item=(uid,x,y,w=1,h=1)=>({uid,x,y,w,h,payload:{durable:true}});
test('first-fit observes external edits, masks, overlaps, duplicates and unplaced records',()=>{
 const host=new InventoryHost(i=>i),board={w:3,h:2},a=item(1,0,0),b=item(2,1,0),c=item(3,undefined,undefined);let bag=[a,b];
 assert.deepEqual(host.firstFit(bag,c,board),{x:2,y:0});a.x=2;
 assert.deepEqual(host.firstFit(bag,c,board),{x:0,y:0});bag=[b,a,item(4,2,0),item(5,undefined,0)];
 assert.deepEqual(host.firstFit(bag,c,{...board,open:(x,y)=>x!==0||y!==0}),{x:0,y:1});
 assert.equal(host.itemAt(bag,2,0),a);assert.deepEqual(host.overlapping(bag,c,2,0),[a,bag[2]]);
 const duplicate=item(3,0,0);bag.push(duplicate);assert.deepEqual(host.firstFit(bag,c,board),{x:0,y:0});
 assert(host.autoPlace(bag,c,board));assert(!bag.includes(c));assert.equal(bag.at(-1),duplicate); // Original uid law, no silent identity repair.
 const outside=item(8,-1,0,2,1);assert.deepEqual(host.firstFit([outside],c,board),{x:1,y:0});
});
test('refused moves preserve host records and ports fail before writes',()=>{
 const host=new InventoryHost(i=>i),board={w:2,h:2,open:(x,y)=>x!==1||y!==1},a=item(1,0,0),b=item(2,1,0),bag=[a,b];
 const before=JSON.stringify(bag);assert.equal(host.place(bag,a,1,1,board),false);assert.equal(JSON.stringify(bag),before);
 assert.equal(host.swapBlocker(bag,a,1,0,board),b);assert.equal(JSON.stringify(bag),before);
 assert.throws(()=>host.autoPlace(bag,item(3,undefined,undefined),{w:257,h:1}));assert.equal(JSON.stringify(bag),before);
 assert.throws(()=>host.place(bag,a,NaN,0,board));assert.equal(JSON.stringify(bag),before);
 const broken=new InventoryHost(()=>{throw Error('port failure');});assert.throws(()=>broken.autoPlace(bag,a,board),/port failure/);assert.equal(JSON.stringify(bag),before);
 let recursive;recursive=new InventoryHost(i=>{recursive.firstFit([],i,{w:1,h:1});return i;});assert.throws(()=>recursive.firstFit([],a,board),/Reentrant/);
 assert.equal(host.remove(bag,1),a);assert.equal(a.x,undefined);assert.equal(a.y,undefined);assert.equal(a.payload.durable,true);
});
