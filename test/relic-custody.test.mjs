import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {RelicCustody} from '../dist/relic-custody.js';
const fixture=JSON.parse(gunzipSync(fs.readFileSync(new URL('../baseline/milestone-fourteen/relic-custody.json.gz',import.meta.url))));
const copy=structuredClone,wire=value=>JSON.parse(JSON.stringify(value));
function setup(uid=1,bagBoard={w:4,h:3},overrides={}){
 const config=copy(fixture.authored.config),bases=copy(fixture.authored.bases),stash={...copy(fixture.authored.stash),accepts:item=>bases[item.baseId]?.category==='relic'&&!item.questId};
 const ports={isRelic:item=>bases[item.baseId]?.category==='relic',footprint:item=>bases[item.baseId]??{w:1,h:1},nextUid:()=>uid++,bumpUidFloor:seen=>{if(Number.isFinite(seen)&&seen>=uid)uid=Math.floor(seen)+1;},cloneItems:items=>copy(items),stash:()=>stash,bagBoard:()=>bagBoard,progression:()=>config,...overrides};
 return {sdk:new RelicCustody(ports),ports,config,stash,bases};
}
test('relic restoration matches 240 original legacy shapes and UID floors',()=>{
 for(const row of fixture.restores){
  const {sdk,ports}=setup(row.uidStart),source=copy(row.source),before=copy(source),result=sdk.restore(source);
  assert.deepEqual(wire(result),row.result);assert.equal(ports.nextUid(),row.uidAfter);assert.deepEqual(source,before);
  for(const item of result.items)assert(!source.items.includes(item));
 }
});
test('relic investment matches 600 original bounded pours, gates and invalid amounts',()=>{
 const {sdk}=setup();
 for(const row of fixture.pours){
  const a=copy(row.before),amount=row.amount==='default'?undefined:row.amount==='NaN'?NaN:row.amount==='Infinity'?Infinity:row.amount;
  const spent=row.kind==='power'?sdk.investPower(a.reliquary,a,!!a.ledger[fixture.authored.config.attunement],amount):sdk.investStorage(a.reliquary,a,a.features.includes('reliquary'),amount);
  assert.equal(spent,row.spent);assert.deepEqual(a,row.after);assert.equal(sdk.cost(a.reliquary),row.cost);assert.equal(sdk.power(a.reliquary),row.power);
 }
});
test('canonical relic custody matches 2520 original bank, migration, storage and loss transitions',()=>{
 let count=0;
 for(const sequence of fixture.sequences){
  const {sdk,ports}=setup(sequence.uidStart,sequence.bagBoard),r=sdk.empty(),pool=copy(sequence.initial),scope=sequence.scope;
  const state=()=>wire({reliquary:r,pool,reserve:sdk.reserve(r).map(e=>e.key),board:sdk.board(r).map(item=>pool.indexOf(item)),canonical:r.items.map(item=>pool.indexOf(item))});
  for(const row of sequence.rows){
   const op=row.op;let result;
   switch(op.kind){
    case 'bank':{const got=sdk.bank(r,pool[op.index],scope);result=got?{index:pool.indexOf(got),key:got.relicKey}:null;break;}
    case 'stale':{const stale={...pool[op.index],name:'stale overwrite attempt'},got=sdk.bank(r,stale,scope);result={index:pool.indexOf(got),stale};break;}
    case 'selections':r.seated=[pool[0].relicKey,pool[2].relicKey];r.carried=[pool[1].relicKey,pool[6].relicKey];sdk.reconcile(r);break;
    case 'plan':result=sdk.planStorage(r,pool[op.index],op.target)??null;break;
    case 'migrate':{const carry=copy(op.carry);sdk.migrateCarry(r,carry,scope,op.legacy);result={carry,bagCanonical:carry.items.map(i=>r.items.indexOf(i)),boardCanonical:carry.containers.reliquary.map(i=>r.items.indexOf(i))};break;}
    case 'lose':result=sdk.loseCarried(r,copy(op.bag),scope);break;
    case 'corpses':result=copy(op.deaths);sdk.migrateCorpses(r,result);break;
    default:throw new Error('Unknown observation command '+op.kind);
   }
   assert.deepEqual(wire({op,result,state:state()}),row,`${scope} ${count} ${op.kind}`);count++;
  }
  assert.equal(ports.nextUid(),sequence.uidAfter);
 }
 assert.equal(count,2520);
});
test('occupied-cell experience matches 160 original folds including disabled state',()=>{
 const {sdk}=setup();for(const row of fixture.experience)assert.equal(sdk.experience(row.items,row.enabled),row.result);
});
test('relic ownership is canonical, loss is irreversible on replay, and accounts are isolated',()=>{
 const {sdk}=setup(100),a=sdk.empty(),b=sdk.empty(),body={uid:1,baseId:'relic_charm',x:2,y:1,payload:{rolls:[.2,.8]}},scope='a';
 const stored=sdk.bank(a,body,scope);assert.equal(stored,body);assert.equal(body.relicKey,'legacy:a:1');assert(!('x' in body));
 const stale={...copy(body),payload:{rolls:[1,1]}};assert.equal(sdk.bank(a,stale,scope),body);assert.deepEqual(body.payload.rolls,[.2,.8]);
 assert.equal(sdk.bank(b,stale,scope),stale);assert.notEqual(a.items[0],b.items[0]);
 a.seated=[body.relicKey];a.carried=[];sdk.reconcile(a);assert.deepEqual(sdk.reserve(a),[]);assert.equal(sdk.board(a)[0],body);
 assert.equal(sdk.loseCarried(a,[body,body],scope),1);assert.deepEqual(a.items,[]);assert.equal(sdk.bank(a,copy(stale),scope),undefined);
 const carry={items:[copy(stale)],equipped:{},containers:{reliquary:[copy(stale)]}};sdk.migrateCarry(a,carry,scope);assert.deepEqual(carry.items,[]);assert.deepEqual(carry.containers.reliquary,[]);
 assert.equal(b.items[0],stale);assert.deepEqual(b.released,[]);
 const restored=sdk.restore(b);assert.notEqual(restored.items[0],stale);assert.notEqual(restored.items[0].payload,stale.payload);assert.deepEqual(restored.items[0],stale);
});
test('relic pour conserves funds, advances one rung, and observes live tuning',()=>{
 const {sdk,config}=setup(),r=sdk.empty(),purse={credits:1000};
 assert.equal(sdk.investPower(r,purse,false,1000),0);assert.equal(purse.credits,1000);
 assert.equal(sdk.investPower(r,purse,true,10.9),10);assert.equal(r.invested,10);assert.equal(purse.credits,990);
 assert.equal(sdk.investPower(r,purse,true,1000),15);assert.equal(r.rank,1);assert.equal(r.invested,0);assert.equal(purse.credits,975);
 config.costBase=40;config.powerPerRank=.1;assert.equal(sdk.cost(r),160);assert.equal(sdk.power(r),.1);
 assert.equal(sdk.investPower(r,purse,true,1000),160);assert.equal(r.rank,2);assert.equal(purse.credits,815);
 const snapshot=copy({r,purse});for(const amount of [NaN,Infinity,-1,0])assert.equal(sdk.investPower(r,purse,true,amount),0);assert.deepEqual({r,purse},snapshot);
 config.costBase=Infinity;assert.throws(()=>sdk.cost(r),/finite/);config.costBase=40;assert.equal(sdk.cost(r),360);
});
test('custody rejects bad UID providers and reentrancy and releases failed-call guards',()=>{
 const {sdk,ports}=setup(1),r=sdk.empty();sdk.bank(r,{uid:1,baseId:'relic_charm',relicKey:'one'},'s');
 const second={uid:1,baseId:'relic_charm',relicKey:'two',x:0,y:0};assert.throws(()=>sdk.bank(r,second,'s'),/owned address/);assert.equal(r.items.length,1);assert.equal(second.x,0);
 // The provider advances after its rejected duplicate; a later valid call works.
 assert.equal(sdk.bank(r,second,'s'),second);assert.equal(second.uid,2);
 let nested,fail=true;const guarded=setup(100,undefined,{cloneItems:items=>{if(fail)nested.empty();return copy(items);}});nested=guarded.sdk;
 assert.throws(()=>nested.restore(r),/Reentrant/);fail=false;assert.equal(nested.restore(r).items.length,2);
 const proto={counter:10,nextUid(){return this.counter++;}};const bound=new RelicCustody(Object.assign(Object.create(proto),{...ports,nextUid:proto.nextUid}));const state=bound.empty();
 bound.bank(state,{uid:1,baseId:'relic_charm',relicKey:'a'},'s');const item={uid:1,baseId:'relic_charm',relicKey:'b'};bound.bank(state,item,'s');assert.equal(item.uid,10);
});
