import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './character-build-fixture.mjs';

const grant=(builds,token)=>builds.read(token).grants[0][1];

test('builds combine independent base, gear and level inputs',()=>{
  const {builds,input,item}=setup();input.level=3;input.equipped.head=item(1,'life',7);
  const before=JSON.stringify(input),token=builds.open(input,[null,null]);assert.equal(builds.stat(token,'life'),133);assert.equal(JSON.stringify(input),before);
  assert.deepEqual(builds.read(token).sources.map(r=>r[0]),['attributes','class','passives','level','gear:head']);
});
test('warm grants retain investment and logical identity across lower levels',()=>{
  const {builds,input,item}=setup();input.equipped.head=item(1);input.equipped.head.grantState={bolt:{sockets:[null,null],treeNodes:['a','b']}};
  const first=builds.open(input,['bolt',null]),before=JSON.stringify(builds.read(first));input.equipped.head.lines[0].value=5;
  const next=builds.rebuild(first,input);assert.deepEqual(grant(builds,next).tree,['a','b']);assert.equal(grant(builds,next).level,5);
  assert.equal(builds.lineages(first).get('grant/bolt'),builds.lineages(next).get('grant/bolt'));assert.equal(JSON.stringify(builds.read(first)),before);
});
test('replacement hosts cold restore and replace logical identity',()=>{
  const {builds,input,item}=setup();input.equipped.head=item(1);const first=builds.open(input,['bolt',null]);
  input.equipped.head=item(2,'skillgrant_bolt',5);input.equipped.head.grantState={bolt:{sockets:[null,null],treeNodes:['a','b']}};
  const next=builds.rebuild(first,input);assert.deepEqual(grant(builds,next).tree,['a']);assert.equal(builds.read(next).bar[0].host,2);
  assert.notEqual(builds.lineages(first).get('grant/bolt'),builds.lineages(next).get('grant/bolt'));
});
test('remove and re-equip the same UID creates a new grant',()=>{
  const {builds,input,item}=setup();const host=item(1);input.equipped.head=host;const first=builds.open(input,['bolt',null]);
  delete input.equipped.head;const removed=builds.rebuild(first,input);assert.deepEqual(builds.read(removed).bar,[null,null]);
  input.equipped.head=host;const restored=builds.rebuild(removed,input);assert.notEqual(builds.lineages(first).get('grant/bolt'),builds.lineages(restored).get('grant/bolt'));
  assert.deepEqual(builds.read(restored).bar,[null,null]);
});
test('same-host explicit investment edits preserve identity without cold repair',()=>{
  const {builds,input,item}=setup();input.equipped.head=item(1,'skillgrant_bolt',5);const first=builds.open(input,['bolt',null]);
  const next=builds.rebuild(first,input,{grants:[{skillId:'bolt',hostUid:1,state:{sockets:[null,null],treeNodes:['a','b']}}]});
  assert.deepEqual(grant(builds,next).tree,['a','b']);assert.deepEqual(builds.read(next).equipped.head.grantState.bolt.treeNodes,['a','b']);
  assert.equal(grant(builds,first).tree,undefined);assert.equal(builds.lineages(first).get('grant/bolt'),builds.lineages(next).get('grant/bolt'));
});
test('grant edits cannot target another host, replacement or removed grant',()=>{
  const {builds,input,item}=setup();input.equipped.head=item(1);const first=builds.open(input,[null,null]),before=JSON.stringify(builds.read(first));
  const edit={skillId:'bolt',hostUid:1,state:{sockets:[null,null]}};
  assert.throws(()=>builds.rebuild(first,input,{grants:[{...edit,hostUid:2}]}),/Foreign/);
  assert.throws(()=>builds.rebuild(first,input,{grants:[edit,edit]}),/duplicate/);
  input.equipped.head=item(2);assert.throws(()=>builds.rebuild(first,input,{grants:[edit]}),/no longer/);
  delete input.equipped.head;assert.throws(()=>builds.rebuild(first,input,{grants:[edit]}),/no longer/);assert.equal(JSON.stringify(builds.read(first)),before);
});
test('learned takeover and warm learned updates retain the owned learned instance',()=>{
  const {builds,input,item,learned}=setup();input.equipped.head=item(1);const first=builds.open(input,['bolt',null]);
  input.learned=[learned()];const taken=builds.rebuild(first,input);assert.equal(builds.read(taken).bar[0].level,4);assert.equal(builds.read(taken).bar[0].host,undefined);
  input.learned[0].gem.level=7;input.learned[0].gem.treeNodes=['a','b'];const next=builds.rebuild(taken,input);
  assert.equal(builds.read(next).bar[0].level,7);assert.deepEqual(builds.read(next).bar[0].tree,['a','b']);
  assert.equal(builds.lineages(taken).get('learned/bolt'),builds.lineages(next).get('learned/bolt'));assert.equal(builds.read(taken).bar[0].level,4);
});
test('removed and relearned skills do not inherit the removed identity',()=>{
  const {builds,input,learned}=setup();input.learned=[learned()];const first=builds.open(input,['bolt',null]);input.learned=[];
  const removed=builds.rebuild(first,input);assert.deepEqual(builds.read(removed).bar,[null,null]);input.learned=[learned()];
  const again=builds.rebuild(removed,input,{bar:['bolt',null]});assert.notEqual(builds.lineages(first).get('learned/bolt'),builds.lineages(again).get('learned/bolt'));
});
test('learned residence locks survive cold restoration, forks and detached writeback',()=>{
  const {builds,input,learned}=setup();input.learned=[{...learned(),locked:true}];const first=builds.open(input,['bolt',null]);
  const next=builds.rebuild(first,input);assert.equal(builds.investment(first).learned[0].locked,true);assert.equal(builds.investment(next).learned[0].locked,true);
  delete input.learned[0].locked;const unlocked=builds.rebuild(next,input);assert.equal(builds.investment(unlocked).learned[0].locked,undefined);
  assert.equal(builds.investment(next).learned[0].locked,true);assert.equal(builds.lineages(unlocked).get('learned/bolt'),builds.lineages(next).get('learned/bolt'));
});
test('rebind recomputes worn grafts on the requested slot',()=>{
  const {builds,input,item,learned}=setup();input.learned=[learned('bolt'),learned('wave')];input.equipped.head=item(1,'slotgraft_1_repeat',3);
  const first=builds.open(input,['bolt','wave']);assert.deepEqual(builds.read(first).bar[0].grafts,[{id:'repeat',level:3}]);
  const next=builds.rebuild(first,input,{bar:['wave','bolt']});assert.deepEqual(builds.read(next).bar[0].grafts,[{id:'repeat',level:3}]);assert.equal(builds.read(next).bar[1].grafts,undefined);
});
test('companion declarations are independent and account changes stay private',()=>{
  const {builds,input,item}=setup();const relic=item(1,'companiongrant_golem',2);relic.x=0;relic.y=0;relic.relicKey='canonical-1';
  input.containers.reliquary=[relic];input.features=['relics'];const first=builds.open(input,[null,null]);assert.equal(builds.read(first).companions[0][1].level,2);
  input.relicEmpowerment=2;const next=builds.rebuild(first,input);assert.equal(builds.read(next).companions[0][1].level,6);assert.equal(builds.read(first).companions[0][1].level,2);
  assert.equal(builds.lineages(first).get('companion/golem'),builds.lineages(next).get('companion/golem'));
  input.relicEnabled=false;const disabled=builds.rebuild(next,input);assert.equal(builds.read(disabled).companions.length,0);assert.equal(builds.read(next).companions.length,1);
});
test('late binding failure leaves every prior build and input untouched',()=>{
  const {builds,input,item}=setup();input.equipped.head=item(1);const first=builds.open(input,['bolt',null]),before=JSON.stringify(builds.read(first)),raw=JSON.stringify(input);
  assert.throws(()=>builds.rebuild(first,input,{bar:['wave',null]}),/Unresolved/);assert.equal(JSON.stringify(builds.read(first)),before);assert.equal(JSON.stringify(input),raw);
  assert.equal(builds.read(builds.rebuild(first,input)).bar[0].id,'bolt');
});
test('foreign tokens, unresolved bindings and duplicate ownership are rejected',()=>{
  const {builds,input,learned}=setup();assert.throws(()=>builds.open(input,['bolt',null]),/Unresolved/);assert.throws(()=>builds.open(input,[null]),/length/);
  assert.throws(()=>builds.open(input,['bolt','bolt']),/duplicate/);input.learned=[learned(),learned()];assert.throws(()=>builds.open(input,[null,null]),/Duplicate learned/);
  input.learned=[];const first=builds.open(input,[null,null]);assert.throws(()=>setup().builds.rebuild(first,input),/Foreign/);assert.throws(()=>builds.read({}),/Foreign/);
});
test('display data and lineage maps cannot mutate a retained build',()=>{
  const {builds,input,item}=setup();input.equipped.head=item(1);const first=builds.open(input,['bolt',null]),before=JSON.stringify(builds.read(first));
  const view=builds.read(first);view.equipped.head.lines[0].value=0;view.attrs.strength=99;view.bar[0].level=99;view.sources[0][1][0].value=99;
  const lineage=builds.lineages(first);lineage.clear();assert.equal(builds.lineages(first).size,1);assert.equal(JSON.stringify(builds.read(first)),before);
  const investment=builds.investment(first);investment.grants[0].grantState.bolt.sockets=[];assert.equal(builds.investment(first).grants[0].grantState.bolt.sockets.length,2);
});
test('separate branches can proceed without sharing mutable state',()=>{
  const {builds,input,item}=setup();input.equipped.head=item(1);const first=builds.open(input,['bolt',null]);
  const left=builds.rebuild(first,{...input,level:2});const right=builds.rebuild(first,{...input,level:3});
  assert.equal(builds.stat(left,'life'),116);assert.equal(builds.stat(right,'life'),126);assert.equal(builds.stat(first,'life'),106);
});
