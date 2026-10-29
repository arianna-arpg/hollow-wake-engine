import test from 'node:test';import assert from 'node:assert/strict';
import {lockSequenceRecovery as lock,releaseSequenceRecovery as release,settleSequenceRecoveries as settle} from '../dist/sequence-recovery.js';
function rig(){
  const owner={skillRecoveryLocks:new Set(),cooldowns:new Map(),cooldownTotals:new Map()};
  const state={owner,host:{def:{id:'axe'}},spec:{recovery:{missCooldown:2},catchBuff:true},caught:2};
  const cast={state,connected:true,caught:0,done:false};
  const r={state,cast,active:new Set([cast]),flight:false,pending:false,objects:[],removed:0,events:[]};
  r.ports={flying:(_c,s)=>{assert.equal(s,state);r.events.push('flight');return r.flight;},pending:()=>{r.events.push('pending');return r.pending;},objects:()=>{r.events.push('objects');return r.objects;},clearCatch:()=>{r.removed++;}};
  lock(state);return r;
}
const stores=s=>({locks:[...s.owner.skillRecoveryLocks],clocks:[...s.owner.cooldowns],totals:[...s.owner.cooldownTotals]});
test('flight, airborne catch window, grounded pickup and returned weapon form one lifecycle',()=>{
  const r=rig();r.flight=true;settle(r.active,r.ports);assert.deepEqual(stores(r.state),{locks:['axe'],clocks:[['axe',1]],totals:[['axe',1]]});assert(!r.cast.done);
  r.flight=false;r.objects=[{airborne:true}];settle(r.active,r.ports);assert(!r.cast.done);assert.equal(r.removed,0);
  r.objects[0].airborne=false;settle(r.active,r.ports);assert(r.cast.done);assert.equal(r.state.caught,0);assert.equal(r.removed,1);assert(r.active.has(r.cast));assert(r.state.owner.skillRecoveryLocks.has('axe'));
  settle(r.active,r.ports);assert.equal(r.removed,1);
  r.objects=[];settle(r.active,r.ports);assert.equal(r.active.size,0);assert.deepEqual(stores(r.state),{locks:[],clocks:[],totals:[]});
});
test('queued work alone holds recovery and observations keep their order',()=>{const r=rig();r.pending=true;settle(r.active,r.ports);assert(!r.cast.done);assert.equal(r.active.size,1);assert.deepEqual(r.events,['flight','pending','objects']);assert(r.state.owner.skillRecoveryLocks.has('axe'));});
test('flight does not skip pending or object observations',()=>{const r=rig();r.flight=true;settle(r.active,r.ports);assert.deepEqual(r.events,['flight','pending','objects']);});
test('caught cast preserves its bank after the last airborne object lands',()=>{const r=rig();r.cast.caught=1;r.objects=[{airborne:false}];settle(r.active,r.ports);assert.equal(r.state.caught,2);assert.equal(r.removed,0);assert(r.cast.done);});
test('absent catch policy preserves the bank',()=>{const r=rig();r.state.spec.catchBuff=undefined;settle(r.active,r.ports);assert.equal(r.state.caught,2);assert.equal(r.removed,0);});
test('miss penalty is stamped after the hold is released',()=>{const r=rig();r.cast.connected=false;settle(r.active,r.ports);assert.deepEqual(stores(r.state),{locks:[],clocks:[['axe',2]],totals:[['axe',2]]});});
test('zero and negative penalties leave a missed skill ready',()=>{for(const penalty of [0,-1]){const r=rig();r.state.spec.recovery.missCooldown=penalty;release(r.state,true);assert.deepEqual(stores(r.state),{locks:[],clocks:[],totals:[]});}});
test('retirement clears hold and clocks without needing a penalty policy',()=>{const r=rig();r.state.spec.recovery=undefined;release(r.state,false);assert.deepEqual(stores(r.state),{locks:[],clocks:[],totals:[]});});
test('unrelated skill clocks survive lock and release',()=>{const r=rig();r.state.owner.cooldowns.set('other',9);r.state.owner.cooldownTotals.set('other',12);r.state.owner.skillRecoveryLocks.add('other');lock(r.state);release(r.state,true);assert.equal(r.state.owner.cooldowns.get('other'),9);assert.equal(r.state.owner.cooldownTotals.get('other'),12);assert(r.state.owner.skillRecoveryLocks.has('other'));});
test('lock reads the live skill identity between writes',()=>{const r=rig(),set=r.state.owner.skillRecoveryLocks;set.add=id=>{r.state.host.def.id='renamed';return Set.prototype.add.call(set,id);};lock(r.state);assert(set.has('axe'));assert.equal(r.state.owner.cooldowns.get('renamed'),1);assert.equal(r.state.owner.cooldownTotals.get('renamed'),1);});
test('lock reads the live owner between writes',()=>{const r=rig(),other=rig().state.owner,set=r.state.owner.skillRecoveryLocks;other.cooldowns.clear();other.cooldownTotals.clear();set.add=id=>{r.state.owner=other;return Set.prototype.add.call(set,id);};lock(r.state);assert.equal(other.cooldowns.get('axe'),1);assert.equal(other.cooldownTotals.get('axe'),1);});
test('release reads the live skill identity after removing the lock',()=>{const r=rig(),set=r.state.owner.skillRecoveryLocks;set.delete=id=>{r.state.host.def.id='renamed';return Set.prototype.delete.call(set,id);};release(r.state,true);assert.equal(r.state.owner.cooldowns.get('axe'),1);assert.equal(r.state.owner.cooldowns.get('renamed'),2);assert.equal(r.state.owner.cooldownTotals.get('renamed'),2);});
test('release reads the penalty separately for eligibility, clock and total',()=>{const r=rig();let reads=0;r.state.spec.recovery={get missCooldown(){return ++reads;}};release(r.state,true);assert.equal(reads,3);assert.equal(r.state.owner.cooldowns.get('axe'),2);assert.equal(r.state.owner.cooldownTotals.get('axe'),3);});
for(const stage of ['lock','clock','total'])test('lock partial writes survive a '+stage+' failure',()=>{
  const r=rig(),o=r.state.owner;o.skillRecoveryLocks.clear();o.cooldowns.clear();o.cooldownTotals.clear();
  const target=stage==='lock'?o.skillRecoveryLocks:stage==='clock'?o.cooldowns:o.cooldownTotals;target[stage==='lock'?'add':'set']=()=>{throw Error('write');};
  assert.throws(()=>lock(r.state),/write/);assert.equal(o.skillRecoveryLocks.has('axe'),stage!=='lock');assert.equal(o.cooldowns.has('axe'),stage==='total');assert.equal(o.cooldownTotals.size,0);
});
for(const stage of ['lock-delete','clock-delete','total-delete','clock-set','total-set'])test('release partial writes survive a '+stage+' failure',()=>{
  const r=rig(),o=r.state.owner,[kind,operation]=stage.split('-'),target=kind==='lock'?o.skillRecoveryLocks:kind==='clock'?o.cooldowns:o.cooldownTotals;
  target[operation]=()=>{throw Error('write');};assert.throws(()=>release(r.state,true),/write/);
  const expected={'lock-delete':{locks:['axe'],clocks:[['axe',1]],totals:[['axe',1]]},'clock-delete':{locks:[],clocks:[['axe',1]],totals:[['axe',1]]},'total-delete':{locks:[],clocks:[],totals:[['axe',1]]},'clock-set':{locks:[],clocks:[],totals:[]},'total-set':{locks:[],clocks:[['axe',2]],totals:[]}};
  assert.deepEqual(stores(r.state),expected[stage]);
});
test('last cast determines the miss penalty even after another connected',()=>{const r=rig();r.active.add({...r.cast,connected:false});settle(r.active,r.ports);assert.equal(r.active.size,0);assert.equal(r.state.owner.cooldowns.get('axe'),2);});
test('an outstanding sibling keeps the shared state locked',()=>{const r=rig(),sibling={...r.cast};r.active.add(sibling);r.ports.flying=c=>c===sibling;settle(r.active,r.ports);assert.deepEqual([...r.active],[sibling]);assert(r.state.owner.skillRecoveryLocks.has('axe'));assert.equal(r.state.owner.cooldowns.get('axe'),1);});
test('newly added casts block release but wait until the next settlement',()=>{const r=rig(),added={...r.cast,connected:false};r.ports.clearCatch=()=>{r.active.add(added);};settle(r.active,r.ports);assert.deepEqual([...r.active],[added]);assert(!added.done);assert(r.state.owner.skillRecoveryLocks.has('axe'));});
test('removed casts remain in the current iteration snapshot',()=>{const r=rig(),removed={...r.cast,connected:false};r.active.add(removed);r.ports.clearCatch=()=>{r.active.delete(removed);};settle(r.active,r.ports);assert(removed.done);assert.equal(r.state.owner.cooldowns.get('axe'),2);});
test('catch failure preserves done and bank writes before removing the active cast',()=>{const r=rig();r.ports.clearCatch=()=>{throw Error('catch');};assert.throws(()=>settle(r.active,r.ports),/catch/);assert(r.cast.done);assert.equal(r.state.caught,0);assert(r.active.has(r.cast));assert(r.state.owner.skillRecoveryLocks.has('axe'));settle(r.active,r.ports);assert.equal(r.active.size,0);});
test('retirement during catch removal retains the original non-atomic settlement behavior',()=>{const r=rig();r.cast.connected=false;r.ports.clearCatch=()=>{r.active.clear();release(r.state,false);};settle(r.active,r.ports);assert.equal(r.state.owner.cooldowns.get('axe'),2);assert(!r.state.owner.skillRecoveryLocks.has('axe'));});
test('separate simulations never share state',()=>{const first=rig(),second=rig();first.cast.connected=false;settle(first.active,first.ports);assert.equal(first.state.owner.cooldowns.get('axe'),2);assert.equal(second.state.owner.cooldowns.get('axe'),1);assert(!second.cast.done);assert.equal(second.state.caught,2);});
