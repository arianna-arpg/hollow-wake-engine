import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ChannelBanks} from '../dist/channel-banks.js';

function rig(){
 const queries=[],keys=[],actor={},instance={id:'spell',sockets:[]};
 const ports={key:inst=>{keys.push(inst);return inst.id;},decayMultiplier:(owner,bank)=>{queries.push([owner,bank]);return owner.multiplier??1;}};
 const service=new ChannelBanks(ports);return {service,ports,queries,keys,actor,instance};
}
const record=(id,fill,spec={decay:.25})=>({fill,inst:{id},spec});
test('absent release lookup and sweep keep storage lazy',()=>{
 const r=rig();assert.equal(r.service.lookup(r.actor,r.instance),undefined);r.service.decay(r.actor,.2);
 assert.equal(r.actor.brims,undefined);assert.deepEqual(r.keys,[]);assert.deepEqual(r.queries,[]);
});
test('binding creates once and preserves map, record and unrelated host fields',()=>{
 const r=rig(),spec={decay:.25},bank=r.service.bind(r.actor,r.instance,spec),map=r.actor.brims;
 assert.equal(bank.fill,0);assert.equal(bank.inst,r.instance);assert.equal(bank.spec,spec);
 bank.fill=.7;bank.hostField=42;const nextInstance={id:'spell',sockets:['new']},nextSpec={decay:.5,bankAt:.8};
 assert.equal(r.service.bind(r.actor,nextInstance,nextSpec),bank);assert.equal(r.actor.brims,map);
 assert.equal(bank.fill,.7);assert.equal(bank.hostField,42);assert.equal(bank.inst,nextInstance);assert.equal(bank.spec,nextSpec);
 assert.equal(r.service.lookup(r.actor,nextInstance),bank);
});
test('one service isolates actor storage even for the same instance',()=>{
 const r=rig(),other={};const first=r.service.bind(r.actor,r.instance,{decay:1}),second=r.service.bind(other,r.instance,{decay:2});
 first.fill=.75;second.fill=.8;r.service.decay(r.actor,.125);assert.equal(first.fill,.625);assert.equal(second.fill,.8);assert.notEqual(first,second);
});
test('held same-skill bank is skipped before empty-record deletion',()=>{
 const r=rig(),bank=record('spell',0);r.actor.brims=new Map([['spell',bank]]);r.actor.casting={mode:'channel',held:true,inst:{id:'spell'}};
 r.service.decay(r.actor,.2);assert.equal(r.actor.brims.get('spell'),bank);assert.deepEqual(r.queries,[]);
 r.actor.casting.held=false;r.service.decay(r.actor,.2);assert.equal(r.actor.brims.size,0);
});
test('held different skill and nonchannel cast do not protect a bank',()=>{
 for(const cast of [{mode:'channel',held:true,inst:{id:'other'}},{mode:'charge',held:true,inst:{id:'spell'}},{mode:'channel',held:false,inst:{id:'spell'}}]){
  const r=rig(),bank=record('spell',.6);r.actor.brims=new Map([['spell',bank]]);r.actor.casting=cast;r.service.decay(r.actor,.4);
  assert.equal(bank.fill,.5);assert.equal(r.queries.length,1);
 }
});
test('empty records are deleted in iteration order without contextual queries',()=>{
 const r=rig(),first=record('first',0),second=record('second',.6),third=record('third',-.2);
 const map=r.actor.brims=new Map([['first',first],['second',second],['third',third]]),deleted=[],remove=map.delete.bind(map);
 map.delete=key=>{deleted.push(key);return remove(key);};r.service.decay(r.actor,.4);
 assert.deepEqual(deleted,['first','third']);assert.deepEqual(r.queries,[[r.actor,second]]);assert.equal(second.fill,.5);assert.equal(third.fill,-.2);
});
test('missing, zero decay and inclusive bank plateau skip the live query',()=>{
 const r=rig();r.actor.brims=new Map([['none',record('none',.5,{})],['zero',record('zero',.5,{decay:0})],['equal',record('equal',.5,{decay:1,bankAt:.5})],['above',record('above',.7,{decay:1,bankAt:.5})]]);
 r.service.decay(r.actor,2);assert.deepEqual([...r.actor.brims.values()].map(b=>b.fill),[.5,.5,.5,.7]);assert.deepEqual(r.queries,[]);
});
test('below-plateau bank consumes current contextual multiplier',()=>{
 const r=rig(),bank=record('spell',.8,{decay:.25,bankAt:.9});r.actor.brims=new Map([['spell',bank]]);r.actor.multiplier=2;
 r.service.decay(r.actor,.5);assert.equal(bank.fill,.55);r.actor.multiplier=0;r.service.decay(r.actor,5);assert.equal(bank.fill,.55);
 r.actor.multiplier=.5;r.service.decay(r.actor,.4);assert.equal(bank.fill,.5);assert(r.queries.every(([,b])=>b===bank));
});
test('large step deletes bank but preserves detached negative fill',()=>{
 const r=rig(),bank=record('spell',.1);r.actor.brims=new Map([['spell',bank]]);r.service.decay(r.actor,4);
 assert.equal(r.actor.brims.size,0);assert.equal(bank.fill,-.9);
});
test('zero elapsed sweep deletes spent entries without advancing retained fill',()=>{
 const r=rig(),bank=record('spell',.5);r.actor.brims=new Map([['spent',record('spent',0)],['spell',bank]]);r.service.decay(r.actor,0);
 assert.deepEqual([...r.actor.brims.keys()],['spell']);assert.equal(bank.fill,.5);assert.equal(r.queries.length,1);
});
test('query failure preserves earlier work and leaves current and later fill untouched',()=>{
 const r=rig(),first=record('first',.2),second=record('second',.6),third=record('third',.8);r.actor.brims=new Map([['first',first],['second',second],['third',third]]);
 const failure=new Error('host query');r.ports.decayMultiplier=(_a,b)=>{if(b===second)throw failure;return 1;};
 assert.throws(()=>r.service.decay(r.actor,1),error=>error===failure);assert.equal(first.fill,-.04999999999999999);
 assert.equal(r.actor.brims.has('first'),false);assert.equal(second.fill,.6);assert.equal(third.fill,.8);
});
test('invalid delta is rejected before mutation or host observation',()=>{
 for(const dt of [-1,NaN,Infinity,-Infinity]){const r=rig(),bank=record('spell',.6);r.actor.brims=new Map([['spell',bank]]);assert.throws(()=>r.service.decay(r.actor,dt));assert.equal(bank.fill,.6);assert.deepEqual(r.keys,[]);assert.deepEqual(r.queries,[]);}
});
test('nonfinite contextual result cannot corrupt the current bank',()=>{
 for(const value of [NaN,Infinity,-Infinity]){const r=rig(),bank=record('spell',.6);r.actor.brims=new Map([['spell',bank]]);r.ports.decayMultiplier=()=>value;assert.throws(()=>r.service.decay(r.actor,.5));assert.equal(bank.fill,.6);assert.equal(r.actor.brims.get('spell'),bank);}
});
