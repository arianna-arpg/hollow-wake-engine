// Original-only lifetime/alias evidence for attack-sequence continuation.
import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {seedGlobalRandom} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';import {SKILLS} from '../src/data/skills';import {makeSkillInstance} from '../src/engine/skills';
bootSimEngine();const restore=seedGlobalRandom(0x7736),rows:unknown[]=[];
try{
 const w=makeSimWorld('warrior',0x7736),p=w.player,t=new Actor('Sequence target','enemy',{x:p.pos.x+10,y:p.pos.y});w.actors=[p,t];w.walk=null;t.tier=p.tier;t.life=1000;
 const host=makeSkillInstance(SKILLS.cleave,20);host.treeNodes=['readied_cleave','deep_notches'];p.skills=[host];
 const controller=w.attackSequences,native=controller as any,cast=controller.prepare(p,host,t.pos),hit=controller.forTarget(p,cast,t,0),second=controller.forTarget(p,cast,t,0),captured=native.casts.get(cast),state=captured.state;
 assert.notEqual(hit,cast);assert.notEqual(second,hit);assert.equal(native.casts.get(hit),captured);assert.equal(native.casts.get(second),captured);assert.equal(captured.inst,cast);assert.equal(state.owner,p);assert.equal(state.host,host);assert.equal(native.active.size,0);
 rows.push({name:'distinct-hit-variants-share-one-captured-cast',value:{distinctHandles:true,capturedCastShared:true,primaryRetained:true,activeRecovery:false,stateKey:state.key}});
 controller.landed(p,hit,t,12,9,0);assert.equal(state.stacks.get(t),1);assert.equal(captured.receipt.target,t);assert.equal(captured.receipt.dealt,12);assert.equal(captured.receipt.physical,9);
 controller.landed(p,second,t,8,6,0);assert.equal(state.stacks.get(t),2);assert.equal(native.casts.get(hit).receipt.dealt,8);
 rows.push({name:'aliases-update-shared-receipt-and-target-cycle',value:{stacks:2,receipt:{dealt:8,physical:6},targetIdentity:true}});
 controller.landed(p,cast,t,5,4,0);controller.landed(p,hit,t,5,4,0);assert.equal(state.stacks.get(t),0);assert.equal(state.buffs.size,1);const buff=state.buffs.get(p);assert(buff);assert.equal(p.buffs.get(buff.id)?.def,buff);
 rows.push({name:'controller-buff-record-is-actor-buff-definition',value:{stacks:0,buffIdentity:true,buffId:buff.id}});
 controller.clear(p,host);assert(state.retired);assert.equal(native.states.size,0);assert.equal(p.buffs.has(buff.id),false);assert.equal(native.casts.get(hit),captured);assert.equal(native.casts.get(second),captured);
 controller.landed(p,hit,t,100,100,0);assert.equal(state.stacks.get(t),0);assert.equal(controller.stacks(p,hit,t),0);assert.equal(native.states.size,0);assert.equal(captured.receipt.dealt,5);
 rows.push({name:'retired-cast-aliases-remain-known-without-reopening-state',value:{retired:true,stateCount:0,buffRemoved:true,receiptRetained:5,allAliasesRetained:true}});
 const next=controller.prepare(p,host,t.pos),nextCast=native.casts.get(next),nextState=nextCast.state;assert.notEqual(nextState,state);assert.notEqual(nextState.key,state.key);assert.equal(nextState.retired,false);
 controller.landed(p,next,t,9,7,0);assert.equal(nextState.stacks.get(t),1);controller.landed(p,second,t,100,100,0);assert.equal(nextState.stacks.get(t),1);assert.equal(state.stacks.get(t),0);
 rows.push({name:'new-cast-is-independent-of-retained-retired-variants',value:{newStateKey:nextState.key,newStacks:1,oldStacks:0,oldStillRetired:true}});
 writeFileSync(process.argv[2],JSON.stringify({scope:'original-sequence-continuation/v1',notes:'Readied Cleave identity lifetime with retained external variant handles; no general graph copy, thrown recovery, flight-rain or private publication acceptance.',observations:rows},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({scope:'original-sequence-continuation/v1',observations:rows.length}));
}finally{restore();}
