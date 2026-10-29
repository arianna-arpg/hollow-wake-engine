import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceSkillCooldowns as advance, calculateSkillCooldown as price, stampSkillCooldown as stamp,
  refundSkillCooldown as refund, refundCooldownsOnOrb as orb, reduceOtherSkillCooldowns as reduce} from '../dist/cooldown-lifecycle.js';

const skill=id=>({def:{id}});
const state=()=>({cooldowns:new Map([['a',10],['b',4],['orphan',0.25]]),cooldownTotals:new Map([['a',10],['b',8]]),skills:[skill('a'),skill('b')]});
const rates={global:()=>1,hasTagged:()=>false,scoped:()=>{throw Error('Unexpected scoped read');}};

test('elapsed clocks use resolved time and preserve stamped totals',()=>{
  const a=state(); advance(a,1.5,{...rates,global:()=>2});
  assert.deepEqual([...a.cooldowns],[['a',7],['b',1]]); assert.deepEqual([...a.cooldownTotals],[['a',10],['b',8]]);
});
test('empty and zero-time sweeps retain query and deletion semantics',()=>{
  const a=state(),calls=[]; a.cooldowns.clear();
  const p={...rates,global:()=>{calls.push('global');return 1;},hasTagged:()=>{calls.push('tagged');return false;}};
  advance(a,0,p); assert.deepEqual(calls,['global','tagged']);
  a.cooldowns.set('zero',0); advance(a,0,p); assert.equal(a.cooldowns.size,0);
});
test('tagged recovery uses the first matching bar instance and untagged orphan fallback',()=>{
  const a=state(),first=skill('a'),calls=[]; a.skills=[null,first,skill('a')];
  advance(a,0.1,{...rates,hasTagged:()=>true,scoped:(_actor,inst)=>{calls.push(inst);return 3;}});
  assert.deepEqual(calls,[first]); assert.equal(a.cooldowns.get('a'),9.7); assert.equal(a.cooldowns.get('b'),3.9);
});
test('live map iteration visits additions and skips removed future entries',()=>{
  const a=state(),set=a.cooldowns.set.bind(a.cooldowns);
  a.cooldowns.set=(id,n)=>{if(id==='a'){set('late',7);a.cooldowns.delete('b');}return set(id,n);};
  advance(a,1,rates); assert.deepEqual([...a.cooldowns],[['a',9],['late',6]]);
});
test('destination replacement does not replace the active iterator',()=>{
  const a=state(),original=a.cooldowns,set=original.set.bind(original);
  original.set=(id,n)=>{if(id==='a')a.cooldowns=new Map([['replacement',12]]);return set(id,n);};
  advance(a,1,rates); assert.deepEqual([...a.cooldowns],[['replacement',12],['b',3]]);
  assert.deepEqual([...original],[['a',9],['b',4],['orphan',0.25]]);
});
test('global recovery is captured once while scoped recovery remains live',()=>{
  const a=state(); let rate=1,reads=0; const set=a.cooldowns.set.bind(a.cooldowns);
  a.cooldowns.set=(id,n)=>{rate=9;return set(id,n);};
  advance(a,1,{...rates,global:()=>{reads++;return rate;}});
  assert.equal(reads,1); assert.equal(a.cooldowns.get('b'),3);
  const b=state();let calls=0;advance(b,1,{...rates,hasTagged:()=>true,scoped:()=>++calls});assert.equal(b.cooldowns.get('b'),2);
});
test('later clock write failure preserves earlier commits',()=>{
  const a=state(),set=a.cooldowns.set.bind(a.cooldowns);
  a.cooldowns.set=(id,n)=>{if(id==='b')throw Error('write');return set(id,n);};
  assert.throws(()=>advance(a,1,rates),/write/);assert.deepEqual([...a.cooldowns],[['a',9],['b',4],['orphan',0.25]]);
});
test('existing leaf validation rejects bad elapsed/rate at the visited entry',()=>{
  const a=state();assert.throws(()=>advance(a,-1,rates),/dt/);assert.equal(a.cooldowns.get('a'),10);
  assert.throws(()=>advance(a,1,{...rates,hasTagged:()=>true,scoped:(_a,s)=>s.def.id==='b'?NaN:1}),/cooldown recovery/);
  assert.equal(a.cooldowns.get('a'),9);assert.equal(a.cooldowns.get('b'),4);
});

function pricing({added=2,scoped=4,global=2,absorb=undefined}={}) {
  const calls=[],tags=new Set(['spell']),mods=[];
  const ports={tags:s=>{calls.push(['tags',s]);return tags;},modifiers:s=>{calls.push(['mods',s]);return mods;},
    absorbCooldown:s=>{calls.push(['absorb',s]);return absorb;},read:(a,id,t,m)=>{calls.push(['read',a,id,t,m]);return id==='addedCooldown'?added:t?scoped:global;}};
  return {calls,tags,mods,ports};
}
test('pricing preserves context identity, query order and ratio arithmetic',()=>{
  const a={},s={},p=pricing();assert.equal(price(a,s,10,p.ports),6);
  assert.deepEqual(p.calls,[['tags',s],['mods',s],['absorb',s],['read',a,'addedCooldown',p.tags,p.mods],['read',a,'cooldownRecovery',p.tags,p.mods],['read',a,'cooldownRecovery',undefined,undefined]]);
});
test('nonpositive price skips both recovery reads',()=>{
  const p=pricing({added:-10});assert.equal(price({}, {},5,p.ports),0);assert.equal(p.calls.length,4);
});
test('absorb overrides base and ratio floor remains 0.1',()=>{
  assert.equal(price({}, {},100,pricing({absorb:8,added:2,scoped:0.01,global:1}).ports),100);
  assert.equal(price({}, {},10,pricing({absorb:0,added:0}).ports),0);
});
test('null absorb falls back to supplied base without clamping host stat values',()=>{
  assert.equal(price({}, {},10,pricing({absorb:null,added:0,scoped:1,global:1}).ports),10);
});
test('context or stat failures stop pricing without clock writes',()=>{
  const a=state(),p=pricing();p.ports.modifiers=()=>{throw Error('mods');};assert.throws(()=>price(a,{},3,p.ports),/mods/);assert.equal(p.calls.length,1);assert.equal(a.cooldowns.get('a'),10);
});
test('ordinary stamp skips ultimate policy and writes both denominators',()=>{
  const a=state();stamp(a,skill('a'),8,{price:()=>6,ultimateCap:()=>{throw Error('cap');}});
  assert.equal(a.cooldowns.get('a'),6);assert.equal(a.cooldownTotals.get('a'),6);
});
test('ultimate cap is lazy after price, including a nonpositive result',()=>{
  const a=state(),s={def:{id:'a',ultimate:{}}},calls=[];
  stamp(a,s,20,{price:()=>{calls.push('price');return 20;},ultimateCap:()=>{calls.push('cap');return 3;}});
  assert.equal(a.cooldowns.get('a'),3);assert.deepEqual(calls,['price','cap']);
  stamp(a,s,0,{price:()=>0,ultimateCap:()=>{calls.push('zero-cap');return 3;}});assert.equal(a.cooldowns.get('a'),3);assert.equal(calls.at(-1),'zero-cap');
});
test('nonpositive ordinary stamps preserve old clock and total',()=>{
  const a=state();stamp(a,skill('a'),0,{price:()=>-1,ultimateCap:()=>0});assert.equal(a.cooldowns.get('a'),10);assert.equal(a.cooldownTotals.get('a'),10);
});
test('stamp reads the second id and destination after the first write',()=>{
  const a=state(),s=skill('a'),set=a.cooldowns.set.bind(a.cooldowns);
  a.cooldowns.set=(id,n)=>{s.def.id='changed';a.cooldownTotals=new Map();return set(id,n);};
  stamp(a,s,7,{price:()=>7,ultimateCap:()=>0});assert.equal(a.cooldowns.get('a'),7);assert.deepEqual([...a.cooldownTotals],[['changed',7]]);
});
test('total write failure retains the already stamped clock',()=>{
  const a=state();a.cooldownTotals.set=()=>{throw Error('total');};assert.throws(()=>stamp(a,skill('a'),7,{price:()=>7,ultimateCap:()=>0}),/total/);assert.equal(a.cooldowns.get('a'),7);
});
test('refund deletes clock before total and preserves partial failure',()=>{
  const a=state();a.cooldownTotals.delete=()=>{throw Error('total');};assert.throws(()=>refund(a,'a'),/total/);assert(!a.cooldowns.has('a'));assert.equal(a.cooldownTotals.get('a'),10);
});
test('refund can target missing clocks and reads a replaced totals store',()=>{
  const a=state(),del=a.cooldowns.delete.bind(a.cooldowns);a.cooldowns.delete=id=>{a.cooldownTotals=new Map([[id,2]]);return del(id);};
  refund(a,'missing');assert.equal(a.cooldownTotals.size,0);
});
test('orb refunds skip absent bars, preserve totals and apply duplicates repeatedly',()=>{
  const a=state();a.skills=[null,a.skills[0],a.skills[0],undefined,skill('absent')];let reads=0;
  orb(a,'life',{seconds:(_a,kind)=>{assert.equal(kind,'life');reads++;return 2;}});
  assert.equal(reads,2);assert.equal(a.cooldowns.get('a'),6);assert.equal(a.cooldowns.get('b'),4);assert.equal(a.cooldownTotals.get('a'),10);
});
test('empty orb refund reads neither the bar nor stat ports',()=>{
  const a=state();a.cooldowns.clear();Object.defineProperty(a,'skills',{get(){throw Error('bar');}});orb(a,'life',{seconds:()=>{throw Error('stat');}});
});
test('orb nonpositive values are ignored and expiry deletes remaining clock only',()=>{
  const a=state();orb(a,'life',{seconds:(_a,s,i)=>i.def.id==='a'?-2:9});assert.equal(a.cooldowns.get('a'),10);assert(!a.cooldowns.has('b'));assert.equal(a.cooldownTotals.get('b'),8);
});
test('orb traversal sees appended bar entries and changed ids after stat reads',()=>{
  const a=state();a.skills=[skill('a')];let n=0;
  orb(a,'life',{seconds:(_a,_k,s)=>{if(++n===1){s.def.id='redirect';a.skills.push(skill('b'));}return 2;}});
  assert.equal(a.cooldowns.get('a'),10);assert.equal(a.cooldowns.get('redirect'),8);assert.equal(a.cooldowns.get('b'),2);
});
test('orb query failure keeps earlier refunds',()=>{
  const a=state();orb(a,'life',{seconds:(_a,_k,s)=>{if(s.def.id==='b')return 0;return 2;}});
  assert.throws(()=>orb(a,'life',{seconds:(_a,_k,s)=>{if(s.def.id==='b')throw Error('stat');return 2;}}),/stat/);assert.equal(a.cooldowns.get('a'),6);
});
test('skill reduction uses original remaining time for the fraction and spares self',()=>{
  const a=state();assert.equal(reduce(a,{id:'b'},{type:'reduceCooldowns',seconds:2,fraction:0.25}),2);
  assert.deepEqual([...a.cooldowns],[['a',5.5],['b',4]]);assert.equal(a.cooldownTotals.get('a'),10);
});
test('zero changes and signed extensions still count visited entries',()=>{
  const a=state();assert.equal(reduce(a,{id:'absent'},{type:'reduceCooldowns'}),3);
  assert.equal(reduce(a,{id:'b'},{type:'reduceCooldowns',seconds:-2,fraction:-0.5}),2);assert.equal(a.cooldowns.get('a'),17);
});
test('skill effect snapshot excludes insertions and retains stale removed entries',()=>{
  const a=state(),set=a.cooldowns.set.bind(a.cooldowns);
  a.cooldowns.set=(id,n)=>{if(id==='a'){set('late',9);a.cooldowns.delete('b');}return set(id,n);};
  assert.equal(reduce(a,{id:'none'},{type:'reduceCooldowns',seconds:1}),3);assert.equal(a.cooldowns.get('b'),3);assert.equal(a.cooldowns.get('late'),9);
});
test('skill effect reads live definition and propagates partial failures',()=>{
  const a=state(),def={id:'none'},set=a.cooldowns.set.bind(a.cooldowns);
  a.cooldowns.set=(id,n)=>{if(id==='a')def.id='b';return set(id,n);};assert.equal(reduce(a,def,{type:'reduceCooldowns',seconds:1}),2);assert.equal(a.cooldowns.get('b'),4);
  const b=state();b.cooldowns.delete=()=>{throw Error('delete');};assert.throws(()=>reduce(b,{id:'none'},{type:'reduceCooldowns',seconds:1}),/delete/);assert.equal(b.cooldowns.get('a'),9);
});
test('shared ports do not retain or mix actor state',()=>{
  const a=state(),b=state();advance(a,1,rates);assert.equal(b.cooldowns.get('a'),10);advance(b,2,rates);assert.equal(a.cooldowns.get('a'),9);assert.equal(b.cooldowns.get('a'),8);
});
