import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './character-build-fixture.mjs';

test('explicit learned replacement creates fresh ownership and preserves its existing bar position',()=>{
 const {builds,input,learned,ports}=setup(),restore=ports.restoreLearned;
 // Independent cold policy: retained warm investment is legal, new acquisition
 // must go through restoration and cannot borrow the old logical identity.
 ports.restoreLearned=payload=>{const skill=restore(payload);if(skill.treeNodes)skill.treeNodes=skill.treeNodes.slice(0,1);return skill;};
 input.learned=[learned('bolt'),learned('wave')];const first=builds.open(input,['bolt',null]);
 input.learned[0].gem.treeNodes=['a','b'];input.learned[0].gem.level=7;
 const warm=builds.rebuild(first,input);assert.deepEqual(builds.read(warm).known[0][1].tree,['a','b']);
 const before=builds.read(warm),raw=structuredClone(input);
 const replaced=builds.rebuild(warm,input,{replaceLearned:['bolt','wave']});
 assert.deepEqual(builds.read(replaced).bar.map(row=>row?.id??null),['bolt',null]);
 assert.deepEqual(builds.read(replaced).bar[0].tree,['a']);assert.equal(builds.read(replaced).bar[0].level,7);
 for(const id of ['bolt','wave'])assert.notEqual(builds.lineages(warm).get('learned/'+id),builds.lineages(replaced).get('learned/'+id));
 const continued=builds.rebuild(replaced,input);
 assert.equal(builds.lineages(replaced).get('learned/bolt'),builds.lineages(continued).get('learned/bolt'));
 assert.deepEqual(builds.read(warm),before);assert.deepEqual(input,raw);
});

test('learned replacement rejects duplicate, absent, removed and grant-only ownership',()=>{
 const {builds,input,learned,item}=setup();input.learned=[learned('wave')];input.equipped.head=item(1);
 const first=builds.open(input,['bolt','wave']),before=builds.read(first);
 for(const replaceLearned of [['wave','wave'],['missing'],['bolt'],[''],[1]]){
  const raw=structuredClone(input);assert.throws(()=>builds.rebuild(first,input,{replaceLearned}),/Invalid learned replacement/);
  assert.deepEqual(input,raw);assert.deepEqual(builds.read(first),before);
 }
 const removed={...input,learned:[]};assert.throws(()=>builds.rebuild(first,removed,{replaceLearned:['wave']}),/Invalid learned replacement/);
 assert.deepEqual(builds.read(first),before);
});

test('support compatibility queries use the owned instance and rolled choices without changing builds',()=>{
 const {builds,input,learned,item,ports}=setup();input.equipped.head=item(1);const granted=builds.open(input,['bolt',null]);
 assert.throws(()=>builds.canSocket(granted,'bolt','repeat'),/support admission is unavailable/);
 const calls=[];ports.socketFits=(def,inst,rolled)=>{calls.push([def.id,inst.def.id,inst.level,rolled?.mode]);return inst.level>=7&&rolled?.mode==='chain';};
 const before=builds.read(granted),roll={mode:'chain'};
 assert.equal(builds.canSocket(granted,'bolt','repeat',roll),true);
 input.learned=[learned('bolt',4)];const known=builds.rebuild(granted,input);
 assert.equal(builds.canSocket(known,'bolt','repeat',roll),false);
 assert.equal(builds.canSocket(granted,'bolt','repeat',{mode:'beam'}),false);
 assert.equal(builds.canSocket(granted,'missing','repeat',roll),false);
 assert.equal(builds.canSocket(granted,'bolt','missing',roll),false);
 assert.equal(calls.length,3);assert.deepEqual(calls[0],['repeat','bolt',10,'chain']);assert.deepEqual(calls[1],['repeat','bolt',4,'chain']);
 assert.throws(()=>builds.canSocket({},'bolt','repeat',roll),/Foreign character build/);
 assert.deepEqual(builds.read(granted),before);assert.deepEqual(roll,{mode:'chain'});
});
