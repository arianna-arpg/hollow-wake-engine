import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {gunzipSync} from 'node:zlib';
import {EquipmentActions,EquipmentSlots,equipmentTierLevel} from '../dist/equipment-actions.js';
const observed=JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-sixteen/equipment-actions.json.gz',import.meta.url))));
const pack=()=>({schemaVersion:1,capability:'equipment-slots/v1',contentId:'test',slots:[{id:'one',enabled:true,accepts:['ring','helmet']},{id:'two',enabled:true,accepts:['ring']},{id:'disabled',enabled:false,accepts:['ring']}]});
function setup(){const slots=new EquipmentSlots(pack()),ground=[],ports={slots:()=>slots.slots(),slot:id=>slots.slot(id),footprint:i=>({w:i.w??1,h:i.h??1}),base:i=>i.category?{category:i.category,tags:[]}:undefined,level:i=>i.required??1,unique:()=>undefined};const sdk=new EquipmentActions(ports),ctx={carry:{items:[],equipped:{},containers:{}},level:1,bagBoard:{w:3,h:2},drop:item=>ground.push(item)};return {sdk,ctx,ground,slots,ports};}
test('equipment slot content preserves all authored order and rejects malformed packs',()=>{
 const input={schemaVersion:1,capability:'equipment-slots/v1',contentId:'original',slots:observed.authoredSlots},slots=new EquipmentSlots(input);assert.deepEqual(slots.slots(),observed.authoredSlots);input.slots[0].enabled=false;assert.equal(slots.slot('helmet').enabled,true);input.slots[0].enabled=true;
 assert.equal(slots.slot('toString'),undefined);assert.throws(()=>slots.slots().push({}));assert.throws(()=>new EquipmentSlots({...pack(),slots:[pack().slots[0],pack().slots[0]]}),/duplicate/);assert.throws(()=>new EquipmentSlots({...pack(),slots:[{id:'a',enabled:'yes',accepts:['ring']}]}));assert.throws(()=>new EquipmentSlots({...pack(),slots:[{id:'a',enabled:true,accepts:[]}]}));
});
test('equipment tier requirements use authored breakpoints and clamp above the last tier',()=>{
 assert.deepEqual([1,2,3,4,100].map(t=>equipmentTierLevel(t,[1,6,12])),[1,6,12,12,12]);for(const t of [0,-1,1.5,NaN,Infinity])assert.throws(()=>equipmentTierLevel(t,[1,6,12]));assert.throws(()=>equipmentTierLevel(1,[]));assert.throws(()=>equipmentTierLevel(1,[NaN]));
});
test('equipment fallback, level boundary and worn swaps preserve both bodies',()=>{
 const {sdk,ctx}=setup(),a={uid:1,category:'ring',x:0,y:0},b={uid:2,category:'ring',x:1,y:0,required:2};ctx.carry.items.push(a,b);
 assert.equal(sdk.equip(ctx,1,'missing').item,a);assert.equal(ctx.carry.equipped.one,a);assert.equal(sdk.equip(ctx,2).changed,false);assert.equal(ctx.carry.items[0],b);
 ctx.level=2;assert(sdk.equip(ctx,2,'disabled').changed);assert.equal(ctx.carry.equipped.two,b);assert(sdk.equip(ctx,1,'two').changed);assert.equal(ctx.carry.equipped.one,b);assert.equal(ctx.carry.equipped.two,a);assert.equal(sdk.equip(ctx,1,'two').changed,false);
});
test('full bag displacement transfers to the host at the original commit point',()=>{
 const {sdk,ctx,ground}=setup(),previous={uid:1,category:'helmet',w:2,h:2},incoming={uid:2,category:'ring',x:0,y:0};ctx.carry.equipped.one=previous;ctx.carry.items.push(incoming);
 for(let y=0;y<2;y++)for(let x=0;x<3;x++)if(x||y)ctx.carry.items.push({uid:10+y*3+x,category:'ring',x,y});
 ctx.drop=item=>{assert.equal(ctx.carry.equipped.one,incoming);assert(!ctx.carry.items.includes(incoming));assert.equal(incoming.x,undefined);ground.push(item);};
 assert(sdk.equip(ctx,2,'one').changed);assert.deepEqual(ground,[previous]);assert.equal(ctx.carry.items.length,5);
});
test('missing displacement sink and throwing reads fail before ownership changes',()=>{
 const {sdk,ctx,ports}=setup(),old={uid:1,category:'helmet',w:3,h:2},item={uid:2,category:'ring',x:0,y:0};ctx.carry.equipped.one=old;ctx.carry.items=[item,{uid:3,category:'ring',x:1,y:0}];ctx.drop=undefined;const before=structuredClone(ctx.carry);
 assert.throws(()=>sdk.equip(ctx,2,'one'),/ownership sink/);assert.deepEqual(ctx.carry,before);
 const bad=new EquipmentActions({...ports,level:()=>{throw new Error('read failure');}});assert.throws(()=>bad.equip(ctx,2),/read failure/);assert.deepEqual(ctx.carry,before);
});
test('unequip honors exact placement, keeps identity and refuses a full bag',()=>{
 const {sdk,ctx}=setup(),item={uid:1,category:'ring'};ctx.carry.equipped.one=item;ctx.carry.items.push({uid:2,category:'ring',x:0,y:0});
 assert.equal(sdk.unequip(ctx,'one',0,0).changed,false);assert.equal(ctx.carry.equipped.one,item);assert(sdk.unequip(ctx,'one',2,1).changed);assert.equal(ctx.carry.items[1],item);assert.deepEqual([item.x,item.y],[2,1]);assert.equal(ctx.carry.equipped.one,undefined);
});
test('bag and board moves share atomic simultaneous swap geometry and same-cell success',()=>{
 const {sdk}=setup(),a={uid:1,x:0,y:0,w:2},b={uid:2,x:3,y:0},items=[a,b],board={w:4,h:2};assert(sdk.move(items,1,board,2,0));assert.deepEqual([a.x,b.x],[2,0]);assert(sdk.move(items,1,board,2,0));
 const before=structuredClone(items);assert.equal(sdk.move(items,1,board,4,0),false);assert.deepEqual(items,before);
});
test('generic-container refusal preserves the observed source array ordering',()=>{
 const {sdk,ctx}=setup(),a={uid:1,category:'ring',x:0,y:0},b={uid:2,category:'ring',x:1,y:0},held={uid:3,category:'ring',x:0,y:0};ctx.carry.items.push(a,b);ctx.carry.containers.case=[held];
 const container={...ctx,id:'case',definition:{label:'case',accepts:{categories:['ring']}},board:{w:1,h:1,open:[true],cells:1}};
 assert.equal(sdk.place(container,1).changed,false);assert.deepEqual(ctx.carry.items,[b,a]);assert.deepEqual([a.x,a.y],[0,0]);
 const second={uid:4,category:'ring',x:1,y:0};ctx.carry.containers.case.push(second);assert.equal(sdk.take(ctx,'case',3,0,0).changed,false);assert.deepEqual(ctx.carry.containers.case,[second,held]);
});
test('generic-container exchanges plan both destinations and preserve drop callback ordering',()=>{
 const {sdk,ctx}=setup(),incoming={uid:1,category:'ring',x:0,y:0},held={uid:2,category:'ring',x:0,y:0};ctx.carry.items=[incoming];ctx.carry.containers.case=[held];
 const container={...ctx,id:'case',definition:{label:'case',accepts:{categories:['ring']}},board:{w:2,h:1,open:[true,true],cells:2}};
 assert(sdk.place(container,1,0,0).changed);assert.equal(ctx.carry.items[0],held);assert.equal(ctx.carry.containers.case[0],incoming);assert.deepEqual([held.x,held.y],[0,0]);
 assert(sdk.take(ctx,'case',1,1,0).changed);assert.equal(ctx.carry.containers.case,undefined);assert.equal(ctx.carry.items[1],incoming);
 const large={uid:3,category:'ring',w:2,h:1,x:0,y:0};ctx.carry.items=[incoming];incoming.x=0;incoming.y=0;ctx.carry.containers.case=[large];for(let y=0;y<2;y++)for(let x=0;x<3;x++)if(x||y)ctx.carry.items.push({uid:10+y*3+x,category:'ring',x,y});
 container.definition.accountStorage=true;let delivered;container.drop=item=>{assert.deepEqual(ctx.carry.containers.case,[]);assert(!ctx.carry.items.includes(incoming));assert.equal(item.x,undefined);delivered=item;};assert(sdk.place(container,1,0,0).changed);assert.equal(delivered,large);assert.equal(ctx.carry.containers.case[0],incoming);
});
test('unplaceable source recovery fails before removing the source item',()=>{
 const {sdk,ctx}=setup(),item={uid:1,category:'ring',w:4,h:4};ctx.carry.items=[item];ctx.carry.containers.case=[];
 const container={...ctx,id:'case',definition:{label:'case',accepts:{categories:['ring']}},board:{w:1,h:1,open:[true],cells:1}},before=structuredClone(ctx.carry);
 assert.throws(()=>sdk.place(container,1),/restore source/);assert.deepEqual(ctx.carry,before);assert.equal(ctx.carry.items[0],item);
});
test('custom prototype-named slots are safe and geometry never enumerates item payloads',()=>{
 const {ctx,ports}=setup(),slots=new EquipmentSlots({...pack(),slots:[{id:'__proto__',enabled:true,accepts:['ring']}]}),sdk=new EquipmentActions({...ports,slots:()=>slots.slots(),slot:id=>slots.slot(id)}),item={uid:1,category:'ring',x:0,y:0};Object.defineProperty(item,'payload',{enumerable:true,get(){throw new Error('Payload copy');}});ctx.carry.items=[item];
 assert(sdk.equip(ctx,1).changed);assert.equal(Object.getPrototypeOf(ctx.carry.equipped),Object.prototype);assert.equal(ctx.carry.equipped.__proto__,item);assert(sdk.unequip(ctx,'__proto__').changed);assert.equal(ctx.carry.items[0],item);
});
test('reentrant read ports are rejected and the action guard recovers',()=>{
 const {ctx,ports}=setup();let sdk;sdk=new EquipmentActions({...ports,level:()=>{sdk.equip(ctx,1);return 1;}});ctx.carry.items=[{uid:1,category:'ring',x:0,y:0}];const before=structuredClone(ctx.carry);assert.throws(()=>sdk.equip(ctx,1),/Reentrant/);assert.deepEqual(ctx.carry,before);
 assert.equal(sdk.equip(ctx,999).changed,false);
});
