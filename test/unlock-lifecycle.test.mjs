
import test from 'node:test';
import assert from 'node:assert/strict';
import {UnlockLifecycle} from '../dist/unlock-lifecycle.js';
import {fixture,account,card,snapshot} from './unlock-fixture.mjs';
const noRandom=()=>{throw new Error('Unexpected random draw');};

test('ordinary purchases clamp, floor, retain partial investments and grant once',()=>{
 const rows=[card('slot',{slotCount:4}),card('class',{classId:'new',skillIds:['a'],supportIds:['s']}),
  card('classtier',{classId:'starter',tierId:'novice',skillIds:['a']}),card('skill',{skillIds:['a']}),
  card('support',{supportIds:['s']}),card('feature',{flag:'f'}),card('graft')];
 for(const row of rows){
  const {sdk}=fixture(),a=account();
  assert.equal(sdk.investUnlock(a,row,3.9,noRandom),3,row.kind);
  assert.equal(a.credits,97);assert.equal(sdk.investedToward(a,row),3);
  assert.equal(sdk.applyUnlock(a,row,noRandom),true);
  assert.equal(a.credits,90);assert.equal(sdk.investedToward(a,row),0);
  assert(sdk.unlockCompleted(a,row));assert.equal(sdk.applyUnlock(a,row,noRandom),false);
  if(['skill','classtier'].includes(row.kind))assert(a.explicitSkillUnlocks.has('a'));
  if(row.kind==='class')assert(!a.explicitSkillUnlocks.has('a'));
 }
});

test('owned, earned and gated purchases preserve state and consume no randomness',()=>{
 for(const row of [card('slot',{slotCount:3}),card('feature',{flag:'f'},{earned:true}),
  card('feature',{flag:'f'},{reqLevel:1}),card('feature',{flag:'f'},{requiresUnlock:'absent'})]){
  const {sdk}=fixture(),a=account(),before=snapshot(a);
  assert.equal(sdk.investUnlock(a,row,100,noRandom),0);assert.equal(sdk.applyUnlock(a,row,noRandom),false);
  assert.equal(snapshot(a),before);
 }
});

test('ordinary infinity requests retain finite clamping while memory refuses them',()=>{
 const {sdk}=fixture(),a=account(),row=card('feature',{flag:'f'});
 assert.equal(sdk.investUnlock(a,row,Infinity,noRandom),10);assert.equal(a.credits,90);
 const offer=card('memory',{memoryUnlockId:'discovery'}),before=snapshot(a);
 assert.equal(sdk.investUnlock(a,offer,Infinity,noRandom),0);assert.equal(snapshot(a),before);
});

test('invalid currency, amount, cost and investment refuse before mutation',()=>{
 for(const edit of [
  (a,u)=>{a.credits=NaN;},(a,u)=>{a.credits=Infinity;},
  (a,u)=>{a.invested[u.id]=NaN;},(a,u)=>{a.invested[u.id]=Infinity;},
  (a,u)=>{a.invested[u.id]=-Infinity;},
  (a,u)=>{u.cost=NaN;},(a,u)=>{u.cost=Infinity;},(a,u)=>{u.cost=-1;},
 ]){
  const {sdk}=fixture(),a=account(),row=card('feature',{flag:'f'});edit(a,row);const before=snapshot(a);
  assert.equal(sdk.investUnlock(a,row,10,noRandom),0);assert.equal(sdk.applyUnlock(a,row,noRandom),false);
  assert.equal(snapshot(a),before);
 }
 const {sdk}=fixture(),a=account(),row=card('feature',{flag:'f'}),before=snapshot(a);
 assert.equal(sdk.investUnlock(a,row,NaN,noRandom),0);assert.equal(snapshot(a),before);
});

test('literal investment IDs never read inherited balances or alter prototypes',()=>{
 for(const id of ['__proto__','constructor','toString']){
  for(const invested of [{},Object.create({[id]:9}),Object.create(null)]){
   const {sdk}=fixture(),a=account(),row=card('feature',{flag:'f'},{id});a.invested=invested;
   const prototype=Object.getPrototypeOf(a.invested);
   assert.equal(sdk.investedToward(a,row),0);
   assert.equal(sdk.investUnlock(a,row,3,noRandom),3);
   assert.equal(Object.getPrototypeOf(a.invested),prototype);assert(Object.hasOwn(a.invested,id));
   assert.equal(JSON.parse(JSON.stringify(a.invested))[id],3);
   assert(sdk.applyUnlock(a,row,noRandom));assert.equal(a.credits,90);assert(!Object.hasOwn(a.invested,id));
  }
 }
});

test('memory offer aliases complete using their reward receipt and retain overpayment',()=>{
 const {sdk}=fixture(),a=account(),offer=card('memory',{memoryUnlockId:'discovery'},{id:'alias'});
 let draws=0;
 assert.equal(sdk.investUnlock(a,offer,3.9,noRandom),3);
 assert.equal(a.invested.alias,3);assert.equal(a.credits,97);
 assert(sdk.applyUnlock(a,offer,()=>{draws++;return 0;}));assert.equal(draws,1);
 assert.equal(a.credits,90);assert(sdk.unlockCompleted(a,offer,0));
 assert(!sdk.unlockCompleted(a,offer,1));assert(Object.hasOwn(a.memoryReceipts,'discovery'));
 a.invested.alias=15;
 assert(sdk.applyUnlock(a,offer,()=>{draws++;return 0;}));assert.equal(draws,2);
 assert.equal(a.invested.alias,5);assert.equal(a.credits,90);
});

test('legacy investment migration reads only owned balances and preserves literal destinations',()=>{
 for(const id of ['__proto__','constructor','toString']){
  const {sdk,context,catalog}=fixture(),a=account();context.memoryConfig.legacyGemBundles=false;
  context.memoryDefinitions=[{...context.memoryDefinitions[0],id}];
  const retired=card('skill',{skillIds:['a']},{id:'legacy'});catalog.push(retired);
  a.invested=Object.create({[id]:7});a.invested.legacy=4;
  const prototype=Object.getPrototypeOf(a.invested);sdk.reconcileClassBundleGems(a);
  assert.equal(Object.getPrototypeOf(a.invested),prototype);assert(Object.hasOwn(a.invested,id));
  assert.equal(JSON.parse(JSON.stringify(a.invested))[id],4);assert(!Object.hasOwn(a.invested,'legacy'));
  sdk.reconcileClassBundleGems(a);assert.equal(a.invested[id],4);
 }
});

test('zero-remaining relic purchases cannot report a grant the delegated ladder refused',()=>{
 const {sdk,calls}=fixture(),a=account();a.features.add('reliquary');a.ledger.attuned=1;
 for(const row of [card('power',{rank:1}),card('storage',{rank:2})]){
  if(row.kind==='power')a.reliquary.invested=10;else a.reliquary.stash.invested=10;
  assert.equal(sdk.applyUnlock(a,row,noRandom),false);
  assert.deepEqual(calls.at(-1),[row.kind,0]);assert.equal(a.credits,100);
 }
});

test('a free or retuned memory purchase reports refusal when its reward cannot commit',()=>{
 for(const random of [()=>NaN,()=>1,()=>-1]){
  const {sdk}=fixture(),a=account(),offer=card('memory',{memoryUnlockId:'discovery'});
  a.invested[offer.id]=10;const before=snapshot(a);
  assert.equal(sdk.applyUnlock(a,offer,random),false);assert.equal(snapshot(a),before);
 }
 const {sdk}=fixture(),a=account(),offer=card('memory',{memoryUnlockId:'discovery'});
 a.invested[offer.id]=10;a.memoryReceipts.discovery={sequence:Number.MAX_SAFE_INTEGER,id:'a',kind:'skill',tier:'discovery'};
 const before=snapshot(a);assert.equal(sdk.applyUnlock(a,offer,noRandom),false);assert.equal(snapshot(a),before);
});

test('stale resurrection cards cannot charge a risen or removed character',()=>{
 const {sdk}=fixture(),a=account();a.roster.push({charId:'vessel',name:'Vessel',fallen:{level:5,fee:10}});
 const row=sdk.allUnlockables(a).find(u=>u.kind==='resurrect');
 assert(row);assert.equal(sdk.investUnlock(a,row,4,noRandom),4);assert(sdk.applyUnlock(a,row,noRandom));
 assert(!a.roster[0].fallen);assert(sdk.unlockCompleted(a,row));assert.equal(sdk.investUnlock(a,row,10,noRandom),0);
 assert.equal(a.credits,90);a.roster.length=0;assert.equal(sdk.applyUnlock(a,row,noRandom),false);
});

test('package tiers require base and every preceding tier and read predicates lazily',()=>{
 const {sdk,packages,calls}=fixture(),a=account();
 packages.push({id:'p',label:'P',blurb:'P',cost:10,defaultEnabled:false,
  unlock:{label:'Base',test:()=>{calls.push('base');return true;}},
  tiers:[{id:'t1',label:'One',requirement:'One',cost:10,test:()=>{calls.push('one');return true;}},
   {id:'t2',label:'Two',requirement:'Two',cost:10,test:()=>{calls.push('two');return true;}}]});
 const rows=sdk.allUnlockables(a).filter(u=>u.kind==='package');
 assert(!sdk.isUnlockVisible(a,rows[1]));assert.deepEqual(calls,[]);
 assert(!sdk.isUnlockVisible(a,rows[2]));assert.deepEqual(calls,[]);
 assert(sdk.applyUnlock(a,rows[0],noRandom));calls.length=0;
 assert(!sdk.isUnlockVisible(a,rows[2]));assert.deepEqual(calls,[]);
 assert(sdk.applyUnlock(a,rows[1],noRandom));assert(sdk.applyUnlock(a,rows[2],noRandom));
 assert.equal(a.credits,70);assert.equal(sdk.lockedPackages(a).length,0);
});

test('class claims reach a fixed point and activation remains a separate operation',()=>{
 const {sdk,catalog}=fixture(),a=account();
 const first=card('class',{classId:'first',skillIds:['a'],supportIds:[]},{id:'class_first',earned:true,reqLedger:'deed'});
 const next=card('class',{classId:'next',skillIds:['b'],supportIds:[]},{id:'class_next',earned:true,requiresUnlock:'class_first'});
 catalog.push(next,first);
 assert.deepEqual(sdk.settleClassUnlocks(a),[]);
 assert.deepEqual(sdk.settleClassUnlocks(a,{deed:1}),[first,next]);assert.equal(a.credits,100);
 assert(a.pendingClassUnlocks.has('first'));assert(a.unlockedSkills.has('a'));
 assert.deepEqual(sdk.settleClassUnlocks(a,{deed:1}),[]);
 assert(sdk.acknowledgeClassUnlock(a,first));assert(!sdk.acknowledgeClassUnlock(a,first));
 assert(!a.pendingClassUnlocks.has('first'));
});

test('live gates, sealed lines, rumors and shelves retain catalog object identity',()=>{
 const {sdk,catalog}=fixture(),a=account();
 const row=card('feature',{flag:'f'},{tease:true,reqLedger:'deed'});catalog.push(row);
 const sealed=sdk.sealedUnlocks(a);assert.equal(sealed[0].u,row);assert.equal(sealed[0].lines[0].met,false);
 assert.equal(sdk.availableUnlocks(a).includes(row),false);
 a.ledger.deed=1;assert.equal(sdk.availableUnlocks(a)[0],row);assert.deepEqual(sdk.sealedUnlocks(a),[]);
 const census=sdk.vaultShelfCensus(a);assert.equal(census[0].stock[0],row);assert(census[0].visible);
 assert.equal(sdk.vaultStripVisible(a,census),false);
});

test('milestone caches are owned by each lifecycle and preserve cached-array identity',()=>{
 const one=fixture(),two=fixture();
 one.catalog.push(card('feature',{flag:'f'},{reqAnyOf:[{level:5},{classLevel:{classId:'mage',level:12}}]}));
 two.catalog.push(card('feature',{flag:'g'},{reqLedger:'level_9'}));
 assert.deepEqual(one.sdk.catalogLevelMilestones(),[5]);assert.deepEqual(two.sdk.catalogLevelMilestones(),[9]);
 assert.equal(one.sdk.catalogLevelMilestones(),one.sdk.catalogLevelMilestones());
 assert.equal(one.sdk.catalogClassLevelMilestones('mage'),one.sdk.catalogClassLevelMilestones('mage'));
 assert.deepEqual(one.sdk.catalogClassLevelMilestones('mage'),[12]);
 one.catalog.push(card('feature',{flag:'h'},{reqAnyOf:[{level:20}]}));
 assert.deepEqual(one.sdk.catalogLevelMilestones(),[5]);
 assert.deepEqual(new UnlockLifecycle(one.context).catalogLevelMilestones(),[5,20]);
});

test('class milestone IDs and configured ledger prefixes are literal strings',()=>{
 for(const id of ['mage.a','mage[one]','mage+one','mage\\one','mage(','mage|rogue','mage^$']){
  const {sdk,catalog,context}=fixture();
  context.gates.classLevelLedgerKey=(key,level)=>'class[.'+key+']+'+level;
  catalog.push(card('feature',{flag:'f'},{reqLedger:[
   context.gates.classLevelLedgerKey(id,12),context.gates.classLevelLedgerKey(id,3),
   context.gates.classLevelLedgerKey(id.replace('a','x'),99)+'invalid',
   context.gates.classLevelLedgerKey(id,7)+'tail',context.gates.classLevelLedgerKey(id,-2),
  ],reqLedgerCounts:{[context.gates.classLevelLedgerKey(id,8)]:1}}));
  assert.deepEqual(sdk.catalogClassLevelMilestones(id),[3,8,12],id);
 }
 const {sdk,catalog}=fixture();
 catalog.push(card('feature',{flag:'f'},{reqLedger:['class_mageXa_99','class_mage.a_12']}));
 assert.deepEqual(sdk.catalogClassLevelMilestones('mage.a'),[12],'a dot cannot match a different class');
 const levels=fixture();levels.context.gates.reachedLevelKey=n=>'level[.+'+n;
 levels.catalog.push(card('feature',{flag:'f'},{reqLedger:['level[.+7','other[.+99','level[.+4tail','level[.+-2'],
  reqLedgerCounts:{'level[.+12':1},reqAnyOf:[{level:3}]}));
 assert.deepEqual(levels.sdk.catalogLevelMilestones(),[3,7,12]);
});

test('objective totals retain literal own keys and maximum requirements',()=>{
 const {sdk,catalog,context}=fixture();
 context.gates.classLevelLedgerKey=()=> '__proto__';
 catalog.push(card('class',{classId:'c'},{earned:true,reqAnyOf:[
  {ledger:'__proto__',n:5},{ledger:'constructor',n:8},{ledger:'toString',n:9},
  {ledger:'__proto__',n:7},{ledger:'constructor',n:2},{classLevel:{classId:'c',level:10}},
 ]}));
 const needs=sdk.classObjectiveNeeds();
 assert.deepEqual(needs,JSON.parse('{"__proto__":7,"constructor":8,"toString":9}'));
 assert.equal(Object.getPrototypeOf(needs),Object.prototype);
 assert.deepEqual(sdk.classObjectiveKeys(),['__proto__','constructor','toString']);
 assert.deepEqual(JSON.parse(JSON.stringify(needs)),needs);
});
