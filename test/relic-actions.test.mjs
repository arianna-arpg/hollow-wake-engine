import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {gunzipSync} from 'node:zlib';
import {RelicActions,relicCanManage,relicEquipmentRefusal} from '../dist/relic-actions.js';
import {RelicCustody} from '../dist/relic-custody.js';
import {ContainerLayout} from '../dist/container-layout.js';
const read=name=>JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/'+name,import.meta.url))));
const observed=read('milestone-fifteen/relic-actions.json.gz'),content=read('milestone-thirteen/containers.json.gz').authored,custodyContent=read('milestone-fourteen/relic-custody.json.gz').authored;
const access=()=>({ownHosted:true,featureOwned:true,fallen:false,casting:()=>false,oracleReach:()=>true,foeNear:()=>false,elapsedSinceCombat:10,calmSeconds:5});
function setup(){
 let uid=10000;const bases=content.bases,ports={isRelic:i=>bases[i.baseId]?.category==='relic',footprint:i=>bases[i.baseId]??{w:1,h:1},base:i=>bases[i.baseId],level:()=>1,unique:i=>content.uniques[i.uniqueId]};
 const custody=new RelicCustody({...ports,nextUid:()=>uid++,bumpUidFloor:n=>{uid=Math.max(uid,n+1);},cloneItems:structuredClone,stash:()=>({...custodyContent.stash,accepts:i=>ports.isRelic(i)&&!i.questId}),bagBoard:()=>({w:3,h:2}),progression:()=>custodyContent.config});
 const sdk=new RelicActions(custody,ports),definition=content.containers.find(d=>d.id==='reliquary'),board=new ContainerLayout(definition.ladder).fullBoard();
 const ctx={state:custody.empty(),carry:{items:[],equipped:{},containers:{reliquary:[]}},access:access(),definition,board,bagBoard:{w:3,h:2},scope:'actions',level:1,lesson:false};
 return {sdk,custody,ctx};
}
test('relic access matches 2048 original queries covering 512 distinct near/far authority combinations',()=>{
 let count=0;const distinct=new Set();
 for(const scenario of observed.scenarios)for(const row of scenario.authority){
  const a={ownHosted:row.local&&!row.client,featureOwned:row.feature,fallen:row.dead||row.downed,casting:()=>row.casting,oracleReach:()=>row.near,foeNear:()=>row.foe,elapsedSinceCombat:row.recent?0:999,calmSeconds:5};
  assert.equal(relicCanManage(a),row.manage);assert.equal(relicEquipmentRefusal(a),row.refusal);const {manage,refusal,...flags}=row;distinct.add(JSON.stringify(flags));count++;
 }
 assert.equal(count,2048);assert.equal(distinct.size,512);
});
test('authorization reads stop at the first refusal and calm boundary is inclusive',()=>{
 const calls=[],a={...access(),casting:()=>{calls.push('casting');return false;},foeNear:()=>{calls.push('foe');return false;},oracleReach:()=>{calls.push('oracle');return true;}};
 a.ownHosted=false;assert(relicEquipmentRefusal(a));assert.equal(relicCanManage(a),false);assert.deepEqual(calls,[]);
 a.ownHosted=true;a.fallen=true;assert(relicEquipmentRefusal(a));assert.equal(relicCanManage(a),false);assert.deepEqual(calls,[]);
 a.fallen=false;a.elapsedSinceCombat=4.999;assert.match(relicEquipmentRefusal(a),/combat/);assert.deepEqual(calls,['casting']);
 calls.length=0;a.elapsedSinceCombat=5;assert.equal(relicEquipmentRefusal(a),null);assert.deepEqual(calls,['casting','foe']);
});
test('relic transfer chain preserves canonical identity through swap, bag, reserve, release and stale replay',()=>{
 const {sdk,custody,ctx}=setup(),first={uid:1,baseId:'relic_charm',x:0,y:0},second={uid:2,baseId:'relic_charm',x:1,y:0};ctx.carry.items.push(first,second);
 assert.equal(sdk.place(ctx,1,0,0).changed,true);sdk.sync(ctx);assert.equal(ctx.carry.containers.reliquary[0],first);assert.equal(ctx.state.items[0],first);
 assert.equal(sdk.place(ctx,2,0,0).changed,true);sdk.sync(ctx);assert.deepEqual(ctx.carry.items,[first]);assert.equal(first.x,1);assert.equal(first.y,0);assert.equal(ctx.carry.containers.reliquary[0],second);
 assert.equal(sdk.release(ctx,1).changed,false);assert.equal(sdk.withdraw(ctx,2,0,0).changed,true);sdk.sync(ctx);assert.deepEqual(ctx.carry.items,[first,second]);
 assert.equal(sdk.store(ctx,1).changed,true);sdk.sync(ctx);assert.deepEqual(custody.reserve(ctx.state).map(e=>e.item),[first]);assert.deepEqual(ctx.carry.items,[second]);
 const stale={...structuredClone(first),uid:99};assert.equal(sdk.release(ctx,1).changed,true);sdk.sync(ctx);assert(ctx.state.released.includes(first.relicKey));ctx.carry.items.push(stale);
 const before=structuredClone(ctx.state);assert.equal(sdk.store(ctx,99).changed,false);assert.deepEqual(ctx.state,before);assert(ctx.carry.items.includes(stale));assert.equal(ctx.state.items[0],second);
});
test('full bag and recovery refusals keep the complete source ownership intact',()=>{
 const {sdk,custody,ctx}=setup(),item={uid:1,baseId:'relic_charm'};custody.bank(ctx.state,item,ctx.scope);item.x=0;item.y=0;ctx.carry.containers.reliquary=[item];sdk.sync(ctx);
 for(let y=0;y<2;y++)for(let x=0;x<3;x++)ctx.carry.items.push({uid:100+y*3+x,baseId:'relic_charm',x,y});
 const before=structuredClone({state:ctx.state,carry:ctx.carry});assert.match(sdk.withdraw(ctx,1).refusal.reason,/No room/);assert.deepEqual({state:ctx.state,carry:ctx.carry},before);assert.equal(ctx.carry.containers.reliquary[0],item);
 for(let i=0;i<25;i++)custody.bank(ctx.state,{uid:300+i,baseId:'relic_charm'},ctx.scope);custody.reconcile(ctx.state);
 const newcomer=ctx.carry.items[0],full=structuredClone({state:ctx.state,carry:ctx.carry});assert.match(sdk.store(ctx,newcomer.uid).refusal.reason,/No room/);assert.deepEqual({state:ctx.state,carry:ctx.carry},full);
});
test('lesson seating bypasses calm/casting but never host identity, death or missing board',()=>{
 const {sdk,ctx}=setup(),item={uid:1,baseId:'relic_charm',x:0,y:0};ctx.carry.items.push(item);ctx.access.casting=()=>true;ctx.access.elapsedSinceCombat=0;
 assert.equal(sdk.place(ctx,1,0,0).changed,false);ctx.lesson=true;ctx.access.fallen=true;assert.equal(sdk.place(ctx,1,0,0).changed,false);ctx.access.fallen=false;
 const board=ctx.board;ctx.board=null;assert.equal(sdk.place(ctx,1,0,0).changed,false);ctx.board=board;ctx.access.ownHosted=false;assert.equal(sdk.place(ctx,1,0,0).changed,false);ctx.access.ownHosted=true;
 assert.deepEqual(sdk.place(ctx,1,0,0),{changed:true,lessonCompleted:true});assert.equal(ctx.carry.containers.reliquary[0],item);
});
test('personal locker transfers keep body identity and honor exact destinations',()=>{
 const {sdk,ctx}=setup(),item={uid:1,baseId:'ring_mi_gnoll',x:0,y:0},def={id:'personal',board:{w:1,h:1},initialPages:1,maxPages:1,pageCostBase:0,accepts:i=>i.baseId==='ring_mi_gnoll'};ctx.carry.items=[item];
 assert.equal(sdk.personal(ctx.carry,ctx.access,def,ctx.bagBoard,1,'store').changed,true);assert.equal(ctx.carry.stash.items[0],item);assert.deepEqual(ctx.carry.items,[]);
 assert.equal(sdk.personal(ctx.carry,ctx.access,def,ctx.bagBoard,1,'take',2,1).changed,true);assert.equal(ctx.carry.items[0],item);assert.deepEqual([item.x,item.y],[2,1]);
});
test('storage exchange retains canonical bodies and reuses the departing reserve capacity',()=>{
 const {sdk,custody,ctx}=setup(),first={uid:1,baseId:'relic_charm',x:0,y:0},second={uid:2,baseId:'relic_charm'};ctx.carry.items.push(first);
 assert(sdk.place(ctx,1,0,0).changed);sdk.sync(ctx);custody.bank(ctx.state,second,ctx.scope);custody.reconcile(ctx.state);
 assert(sdk.place(ctx,2,0,0).changed);sdk.sync(ctx);assert.deepEqual(ctx.carry.containers.reliquary,[second]);assert.deepEqual(ctx.carry.items,[]);
 assert.equal(custody.reserve(ctx.state)[0].item,first);assert(ctx.state.stash.cells[first.relicKey]);assert.equal(ctx.state.stash.cells[second.relicKey],undefined);
});
test('personal locker refuses full destinations without losing or relocating either body',()=>{
 const {sdk,ctx}=setup(),first={uid:1,baseId:'relic_charm',x:0,y:0},second={uid:2,baseId:'relic_charm',x:1,y:0};ctx.carry.items.push(first,second);
 const def={id:'personal',board:{w:1,h:1},initialPages:1,maxPages:1,pageCostBase:0,accepts:()=>true};
 assert(sdk.personal(ctx.carry,ctx.access,def,ctx.bagBoard,1,'store').changed);const before=structuredClone(ctx.carry);
 assert.match(sdk.personal(ctx.carry,ctx.access,def,ctx.bagBoard,2,'store').refusal.reason,/No room/);assert.deepEqual(ctx.carry,before);
 assert.match(sdk.personal(ctx.carry,ctx.access,def,ctx.bagBoard,1,'take',1,0).refusal.reason,/No room/);assert.deepEqual(ctx.carry,before);assert.equal(ctx.carry.stash.items[0],first);assert.equal(ctx.carry.items[0],second);
});
test('reentrant observations fail before mutation and release the operation guard',()=>{
 const {sdk,ctx}=setup(),before=structuredClone(ctx.state);ctx.access.casting=()=>{sdk.toggle(ctx.state,access(),false);return false;};
 assert.throws(()=>sdk.toggle(ctx.state,ctx.access,false),/Reentrant/);assert.deepEqual(ctx.state,before);
 ctx.access.casting=()=>{throw new Error('Observation failed');};assert.throws(()=>sdk.toggle(ctx.state,ctx.access,false),/Observation failed/);assert.deepEqual(ctx.state,before);
 ctx.access.casting=()=>false;assert(sdk.toggle(ctx.state,ctx.access,false).changed);
});
test('placement and withdrawal do not enumerate unrelated item payload fields',()=>{
 const {sdk,ctx}=setup(),item={uid:1,baseId:'relic_charm',x:0,y:0};Object.defineProperty(item,'unrelatedPayload',{enumerable:true,get(){throw new Error('Payload was copied for geometry');}});ctx.carry.items.push(item);
 assert(sdk.place(ctx,1,0,0).changed);sdk.sync(ctx);assert(sdk.withdraw(ctx,1).changed);sdk.sync(ctx);assert(sdk.store(ctx,1).changed);sdk.sync(ctx);assert.equal(ctx.state.items[0],item);
});
