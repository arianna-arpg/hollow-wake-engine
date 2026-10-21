import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {gunzipSync} from 'node:zlib';
import {ContainerLayout,ContainerPolicy,findCarried,containerOriginOf,originContainerId} from '../dist/container-policy.js';
const fixture=JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-thirteen/containers.json.gz',import.meta.url))));
const ports={footprint:i=>fixture.authored.bases[i.baseId]??{w:1,h:1},base:i=>fixture.authored.bases[i.baseId],unique:i=>fixture.authored.uniques[i.uniqueId],level:i=>fixture.authored.bases[i.baseId]?.category==='relic'?1:fixture.authored.tierRequirements[i.tier-1]};
test('live container policy matches 2000 original landings, refusals, misfits and ownership lookups',()=>{
 const policy=new ContainerPolicy(ports);let n=0;
 for(const row of fixture.queries){const def=fixture.definitions[row.definition],board=new ContainerLayout(def.ladder).board(new Set(row.features)),held=structuredClone(row.held),item=row.incomingIndex>=0?held[row.incomingIndex]:structuredClone(row.item),bag=structuredClone(row.bag);bag[1]=item;
  const before=JSON.stringify({def,board,held,item,bag}),landing=policy.landing(def,board,held,item,row.from,row.x,row.y,row.level,row.withBag?bag:undefined,row.withBag?row.bagBoard:undefined);
  const carry={items:n%2?bag:[],equipped:{left:held[0]},containers:{first:held.slice(1),second:held}},found=findCarried(carry,item.uid);
  const actual={accepts:policy.accepts(def,item),seatRefusal:policy.seatRefusal(def,board,item,row.level),landing:{...landing,with:undefined,withIndex:landing.with?held.indexOf(landing.with):-1},misfits:policy.misfits(board,held).map(it=>held.indexOf(it)),limit:policy.uniqueLimit(item)??null,refusal:policy.uniqueRefusal(held,item),replaceRefusal:policy.uniqueRefusal(held,item,held[0]),origin:containerOriginOf(carry,item.uid),found:found?{uid:found.item.uid,where:found.where}:null};
  assert.deepEqual(JSON.parse(JSON.stringify(actual)),row.result,`Original container query ${n}`);assert.equal(JSON.stringify({def,board,held,item,bag}),before);n++;
 }
 assert.equal(n,2000);assert(policy.scratchBytes<=4096);
});
test('account exchanges do not require a bag seat; ordinary exchanges and unique limits remain atomic',()=>{
 const policy=new ContainerPolicy({footprint:i=>i,base:()=>({category:'relic',tags:[]}),level:()=>1,unique:i=>i.uniqueId?{name:'Only One',maxPerContainer:1}:undefined}),board={w:1,h:1,open:[true],cells:1},def={label:'Case',accepts:{categories:['relic']}};
 const old={uid:1,uniqueId:'one',w:1,h:1,x:0,y:0},incoming={uid:2,uniqueId:'one',w:1,h:1},held=[old],before=JSON.stringify({held,incoming});
 assert.equal(policy.landing(def,board,held,incoming,'bag',0,0,1).verdict,'blocked');const account=policy.landing({...def,accountStorage:true},board,held,incoming,'bag',0,0,1);assert.equal(account.verdict,'swap');assert.equal(account.with,old);
 assert.equal(policy.uniqueRefusal(held,incoming,old),null);assert.match(policy.uniqueRefusal(held,incoming),/Only 1 copy/);
 assert.equal(policy.uniqueRefusal(held,old),null);assert.equal(JSON.stringify({held,incoming}),before);
 const sameUid={...old};assert.deepEqual(policy.misfits(board,[old,sameUid]),[sameUid]);assert.deepEqual(policy.misfits(null,held),held);
 assert.equal(originContainerId('c:case'),'case');assert.equal(originContainerId('bag'),null);
 const worn={...old},stored={...old},carry={items:[old],equipped:{left:worn},containers:{case:[stored]}};
 assert.equal(findCarried(carry,old.uid).item,old);carry.items=[];assert.equal(findCarried(carry,old.uid).item,worn);
 carry.equipped={};assert.equal(findCarried(carry,old.uid).item,stored);assert.equal(containerOriginOf(carry,old.uid),'c:case');assert.equal(findCarried(carry,999),undefined);
});
test('container ports are live and a reentrant footprint read refuses without mutating caller items',()=>{
 let allow=true,reenter=false;const item={uid:1,x:0,y:0,w:1,h:1},held=[item],board={w:1,h:1,open:[true],cells:1},def={label:'Case',accepts:{categories:['relic']}};
 const policy=new ContainerPolicy({footprint:i=>{if(reenter)policy.misfits(board,held);return i;},base:()=>allow?{category:'relic',tags:[]}:undefined,level:()=>1,unique:()=>undefined});
 assert(policy.accepts(def,item));allow=false;assert(!policy.accepts(def,item));allow=true;reenter=true;assert.throws(()=>policy.misfits(board,held),/Reentrant/);reenter=false;assert.deepEqual(policy.misfits(board,held),[]);assert.equal(item.x,0);
});
