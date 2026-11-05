import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ledgerPrefixHeld,gateRowMet,gateRowLabel,gateMet,
  gateRowProgress,gateLevelNeeds,gateClassLevelNeeds
} from '../dist/progression-gates.js';

function context() {
  return {
    reachedLevelKey:level=>'level:'+level,
    classLevelLedgerKey:(id,level)=>'class:'+id+':'+level,
    vocationUnlockKey:id=>'vocation:'+id,
    questDoneKey:id=>'quest:'+id,
    vocationPrefix:'vocation:',
    questDonePrefix:'quest:',
    questsCompletedKey:'quests-total',
    className:id=>id==='hero'?'Hero':undefined
  };
}
const state=(ledger={},features=[])=>({ledger,features:new Set(features)});
const never=()=>assert.fail('Unexpected ownership query');

test('prefix requirements inspect individual counters and inherited ledger entries',()=>{
  const ledger={'family:a':2,'family:b':2,other:10};
  assert.equal(ledgerPrefixHeld({ledger},'family:',3),false);
  Object.setPrototypeOf(ledger,{'family:inherited':3});
  assert.equal(ledgerPrefixHeld({ledger},'family:',3),true);
  assert.equal(ledgerPrefixHeld({ledger},'',9),true);
  assert.equal(ledgerPrefixHeld({ledger:{}},'',0),false);
});

test('numeric thresholds retain zero, fractional, negative and missing-value rules',()=>{
  const cases=[
    [{},{ledger:'count'},false,0],
    [{count:.25},{ledger:'count'},false,.25],
    [{count:1},{ledger:'count'},true,1],
    [{count:2},{ledger:'count',n:4},false,.5],
    [{count:-3},{ledger:'count'},false,0],
    [{count:0},{ledger:'count',n:0},true,1],
    [{count:-1},{ledger:'count',n:-2},true,1],
    [{count:.25},{ledger:'count',n:.5},false,.25]
  ];
  for(const [ledger,row,held,progress]of cases){
    assert.equal(gateRowMet(state(ledger),row,never,context()),held);
    assert.equal(gateRowProgress(state(ledger),row,never,context()),progress);
  }
});

test('empty and earlier-priority rows avoid unrelated host services',()=>{
  const forbidden=new Proxy({}, {get(){throw Error('Unused context read');}});
  const account=state({count:0});
  assert.equal(gateRowMet(account,{},never,forbidden),true);
  assert.equal(gateRowMet(account,{ledger:'count',unlock:'owned'},never,forbidden),false);
  assert.equal(gateMet(account,undefined,'any',never,forbidden),true);
  assert.equal(gateRowLabel({classLevel:{classId:'hero',level:5},label:'Custom'},forbidden),'Custom');
  assert.equal(gateRowLabel({ledger:'count'},forbidden),'count');
});

test('milestone progress ignores higher and fractional-only stamps',()=>{
  const account=state({'level:3':1,'level:15':1,'level:3.5':1});
  assert.equal(gateRowProgress(account,{level:10},never,context()),.3);
  account.ledger['level: 05 ']=1;
  assert.equal(gateRowProgress(account,{level:10},never,context()),.5);
  account.ledger['level:10']=1;
  assert.equal(gateRowProgress(account,{level:10},never,context()),1);
  assert.equal(gateRowProgress(state({'level:3.5':1}),{level:10},never,context()),0);
});

test('per-class milestones use their own namespace and live class names',()=>{
  const account=state({'level:10':1,'class:hero:5':1,'class:other:10':1});
  const row={classLevel:{classId:'hero',level:10}};
  assert.equal(gateRowMet(account,row,never,context()),false);
  assert.equal(gateRowProgress(account,row,never,context()),.5);
  let name='First';
  const keys={...context(),className:()=>name};
  assert.equal(gateRowLabel(row,keys),'reach level 10 as the First');
  name='Second';
  assert.equal(gateRowLabel(row,keys),'reach level 10 as the Second');
});

test('vocation and quest flags retain specific and legacy-any behavior',()=>{
  const keys=context();
  assert(gateRowMet(state({'vocation:other':1}),{vocation:true,n:99},never,keys));
  assert.equal(gateRowMet(state({'vocation:other':1}),{vocation:'path'},never,keys),false);
  assert(gateRowMet(state({'quest:other':1}),{quest:true},never,keys));
  assert(gateRowMet(state({'quests-total':1}),{quest:true},never,keys));
  assert.equal(gateRowMet(state({'quests-total':1}),{quest:'specific'},never,keys),false);
  assert.equal(gateRowProgress(state(),{feature:'missing'},never,keys),0);
});

test('labels retain priority, overrides, fallback names and count spelling',()=>{
  const keys=context();
  assert.equal(gateRowLabel({feature:'some_feature'},keys),'own some feature');
  assert.equal(gateRowLabel({ledgerPrefix:'some_prefix___::',n:2},keys),'some prefix ×2');
  assert.equal(gateRowLabel({ledger:'one_count',n:1,label:''},keys),'one count');
  assert.equal(gateRowLabel({ledger:'one_count',n:2},keys),'one count ×2');
  assert.equal(gateRowLabel({ledger:'count',level:10},keys),'reach level 10');
  assert.equal(gateRowLabel({classLevel:{classId:'retired',level:5}},keys),'reach level 5 as the retired');
  assert.equal(gateRowLabel({classLevel:{classId:'hero',level:5}},{className:()=>''}),'reach level 5 as the ');
});

test('gate composition preserves vacuous and sparse-array semantics',()=>{
  const account=state(),keys=context();
  for(const mode of ['any','all']){
    assert.equal(gateMet(account,[],mode,never,keys),true);
    assert.equal(gateMet(account,undefined,mode,never,keys),true);
  }
  const sparse=new Array(2);
  assert.equal(gateMet(account,sparse,'any',never,keys),false);
  assert.equal(gateMet(account,sparse,'all',never,keys),true);
  const calls=[];
  assert(gateMet(account,[{unlock:'first'},{unlock:'second'}],'any',id=>{calls.push(id);return true;},keys));
  assert.deepEqual(calls,['first']);
});

test('live callbacks can update later facts while appended rows stay outside the initial iteration',()=>{
  for(const mode of ['any','all']){
    const account=state(),calls=[],rows=[{unlock:'mutate'},{ledger:'late'},{unlock:'tail'}];
    assert(gateMet(account,rows,mode,id=>{
      calls.push(id);
      account.ledger.late=1;
      rows.push({unlock:'appended'});
      return mode==='all';
    },context()));
    assert.deepEqual(calls,mode==='any'?['mutate']:['mutate','tail']);
    assert.equal(rows.length,mode==='any'?4:5);
  }
});

test('derived milestone arrays retain duplicates, sparse inputs and borrowed class records',()=>{
  const first={classId:'hero',level:5},second={classId:'other',level:5};
  const rows=new Array(4);
  rows[1]={level:0,classLevel:first};
  rows[3]={level:5,classLevel:second};
  const levels=gateLevelNeeds(rows),classes=gateClassLevelNeeds(rows);
  assert.deepEqual(levels,[0,5]);
  assert.deepEqual(classes,[first,second]);
  assert.equal(classes[0],first);
  first.level=9;
  assert.equal(classes[0].level,9);
  assert.deepEqual(gateLevelNeeds([{level:5},{level:5}]),[5,5]);
  assert(Number.isNaN(gateLevelNeeds([{level:NaN}])[0]));
  assert.deepEqual(gateLevelNeeds(undefined),[]);
  assert.deepEqual(gateClassLevelNeeds(undefined),[]);
});

test('key and name methods preserve their host receiver',()=>{
  const keys={
    ...context(),prefix:'custom:',display:'Named',calls:0,
    reachedLevelKey(level){this.calls++;return this.prefix+level;},
    className(){return this.display;}
  };
  assert(gateRowMet(state({'custom:5':1}),{level:5},never,keys));
  assert.equal(keys.calls,1);
  assert.equal(gateRowLabel({classLevel:{classId:'hero',level:5}},keys),'reach level 5 as the Named');
});

test('queries preserve frozen records and recorded numeric edge behavior',()=>{
  const ledger=Object.freeze(Object.fromEntries([['__proto__',1],['count',1]]));
  const account=Object.freeze({ledger,features:new Set(['known'])});
  const row=Object.freeze({ledger:'__proto__'});
  assert(gateRowMet(account,row,never,context()));
  assert.equal(gateRowProgress(account,row,never,context()),1);
  assert.equal(Object.getPrototypeOf(ledger),Object.prototype);
  assert(Number.isNaN(gateRowProgress(state(),{level:0},never,context())));
  assert(Number.isNaN(gateRowProgress(state(),{ledger:'count',n:NaN},never,context())));
});
