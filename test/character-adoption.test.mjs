import test from 'node:test';
import assert from 'node:assert/strict';
import {CharacterBuilds} from '../dist/character-builds.js';
import {setup} from './character-build-fixture.mjs';

const copy=value=>JSON.parse(JSON.stringify(value));
function prepared(){
  const fixture=setup(),{input,item}=fixture;
  input.equipped.head=item(1,'skillgrant_bolt',5);
  input.equipped.head.grantState={bolt:{sockets:[null,null],treeNodes:['a','b']}};
  input.equipped.ring=item(2,'life',7);
  return {...fixture,bar:['bolt',null],seed:{sourceOrder:['attributes','class','passives','level','gear:ring','gear:head'],
    grants:[{skillId:'bolt',hostUid:1,level:5,state:copy(input.equipped.head.grantState.bolt)}],companions:[]}};
}

test('adoption preserves existing grant investment and durable source history',()=>{
  const {builds,input,bar,seed}=prepared(),before=copy({input,bar,seed});
  const cold=builds.open(input,bar);let adopted;assert.doesNotThrow(()=>{adopted=builds.adopt(input,bar,seed);});const view=builds.read(adopted);
  assert.deepEqual(builds.read(cold).grants[0][1].tree,['a']);assert.deepEqual(view.grants[0][1].tree,['a','b']);
  assert.deepEqual(view.sources.map(row=>row[0]),seed.sourceOrder);assert.notDeepEqual(builds.read(cold).sources.map(row=>row[0]),seed.sourceOrder);
  assert.deepEqual({input,bar,seed},before);assert.equal(builds.stat(adopted,'life'),113);
});
test('adoption requires a complete unique set of allowed durable sources',()=>{
  const {builds,input,bar,seed}=prepared();
  for(const sourceOrder of [[...seed.sourceOrder,'temporary:combat'],[...seed.sourceOrder,'gear:ring'],seed.sourceOrder.filter(id=>id!=='level')])
    assert.throws(()=>builds.adopt(input,bar,{...seed,sourceOrder}),/Invalid durable source order/);
  assert.throws(()=>builds.adopt(input,bar,{...seed,sourceOrder:seed.sourceOrder.filter(id=>id!=='gear:ring')}),/Stale adopted source order/);
});
test('adoption requires the complete derived grant identity set',()=>{
  const {builds,input,bar,seed}=prepared();
  assert.throws(()=>builds.adopt(input,bar,{...seed,grants:[]}),/Stale adopted grant set/);
  assert.throws(()=>builds.adopt(input,bar,{...seed,grants:[seed.grants[0],seed.grants[0]]}),/Invalid adopted grant/);
  assert.throws(()=>builds.adopt(input,bar,{...seed,grants:[{...seed.grants[0],skillId:'unknown'}]}),/Invalid adopted grant/);
  for(const sockets of [[null],[null,null,null]])assert.throws(()=>builds.adopt(input,bar,{...seed,
    grants:[{...seed.grants[0],state:{...seed.grants[0].state,sockets}}]}),/Stale adopted grant sockets/);
});
test('adoption rejects stale grant hosts and observed levels',()=>{
  const {builds,input,bar,seed}=prepared();
  for(const change of [{hostUid:2},{hostUid:undefined},{level:6}])
    assert.throws(()=>builds.adopt(input,bar,{...seed,grants:[{...seed.grants[0],...change}]}),/Stale adopted grant/);
  for(const change of [{hostUid:-1},{level:NaN},{level:0}])
    assert.throws(()=>builds.adopt(input,bar,{...seed,grants:[{...seed.grants[0],...change}]}));
});
test('adoption preserves learned investment and its residence lock without cold repair',()=>{
  const {ports,input,learned}=setup(),restore=ports.restoreLearned;
  ports.restoreLearned=payload=>{const inst=restore(payload);if(inst.treeNodes)inst.treeNodes=inst.treeNodes.slice(0,1);return inst;};
  const builds=new CharacterBuilds(ports);input.learned=[{...learned('bolt',5),locked:true}];input.learned[0].gem.treeNodes=['a','b'];
  const seed={sourceOrder:['attributes','class','passives','level'],grants:[],companions:[]};
  assert.deepEqual(builds.read(builds.open(input,['bolt',null])).known[0][1].tree,['a']);
  const first=builds.adopt(input,['bolt',null],seed),next=builds.rebuild(first,input);
  assert.deepEqual(builds.read(first).known[0][1].tree,['a','b']);assert.deepEqual(builds.read(next),builds.read(first));
  assert.equal(builds.investment(first).learned[0].locked,true);
  assert.equal(builds.lineages(first).get('learned/bolt'),builds.lineages(next).get('learned/bolt'));
});
test('adoption checks complete companion declarations and levels',()=>{
  const {builds,input,item}=setup(),relic=item(3,'companiongrant_golem',2);
  Object.assign(relic,{x:0,y:0,relicKey:'canonical'});input.features=['relics'];input.containers.reliquary=[relic];
  const seed={sourceOrder:['attributes','class','passives','level','container:reliquary'],grants:[],companions:[{skillId:'golem',level:2}]};
  const token=builds.adopt(input,[null,null],seed);assert.equal(builds.read(token).companions[0][1].level,2);
  for(const companions of [[],[...seed.companions,...seed.companions]])
    assert.throws(()=>builds.adopt(input,[null,null],{...seed,companions}),/Stale adopted companions/);
  assert.throws(()=>builds.adopt(input,[null,null],{...seed,companions:[{skillId:'golem',level:3}]}),/Stale adopted companion/);
});
test('failed adoption does not change inputs or an existing owned build',()=>{
  const {builds,input,bar,seed}=prepared(),first=builds.adopt(input,bar,seed),before=builds.read(first),raw=copy({input,bar,seed});
  assert.throws(()=>builds.adopt(input,bar,{...seed,grants:[{...seed.grants[0],hostUid:2}]}),/Stale adopted grant/);
  assert.throws(()=>builds.adopt(input,['wave',null],seed),/Unresolved/);
  assert.deepEqual(builds.read(first),before);assert.deepEqual({input,bar,seed},raw);
  assert.deepEqual(builds.read(builds.rebuild(first,input)),before);
});
test('adoption observations and display reads cannot retain mutable aliases',()=>{
  const {builds,input,bar,seed}=prepared(),first=builds.adopt(input,bar,seed),before=builds.read(first);
  seed.grants[0].state.treeNodes.length=0;seed.sourceOrder.reverse();input.equipped.head.name='changed';bar.fill(null);
  const view=builds.read(first);view.bar[0].tree.length=0;view.equipped.head.grantState.bolt.treeNodes.length=0;
  assert.deepEqual(builds.read(first),before);
});
test('separate adoptions establish independent lifetimes while warm forks preserve them',()=>{
  const {builds,input,bar,seed}=prepared(),first=builds.adopt(input,bar,seed),second=builds.adopt(input,bar,seed);
  assert.notEqual(builds.lineages(first).get('grant/bolt'),builds.lineages(second).get('grant/bolt'));
  const next=builds.rebuild(first,input,{grants:[{skillId:'bolt',hostUid:1,state:{sockets:[null,null],treeNodes:['a','b','c']}}]});
  assert.equal(builds.lineages(first).get('grant/bolt'),builds.lineages(next).get('grant/bolt'));
  assert.deepEqual(builds.read(second).grants[0][1].tree,['a','b']);assert.deepEqual(builds.read(next).grants[0][1].tree,['a','b','c']);
});
test('adopted skills receive a new lifetime after removal and re-equipping',()=>{
  const {builds,input,bar,seed}=prepared(),first=builds.adopt(input,bar,seed),hat=input.equipped.head;
  delete input.equipped.head;const removed=builds.rebuild(first,input);assert.deepEqual(builds.read(removed).bar,[null,null]);
  input.equipped.head=hat;const readded=builds.rebuild(removed,input);
  assert.notEqual(builds.lineages(first).get('grant/bolt'),builds.lineages(readded).get('grant/bolt'));
  assert.deepEqual(builds.read(readded).grants[0][1].tree,['a']);assert.deepEqual(builds.read(first).grants[0][1].tree,['a','b']);
});
