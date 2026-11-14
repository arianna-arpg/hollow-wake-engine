import assert from 'node:assert/strict';
import {compileMemoryRollPolicy} from 'candidate/memory-roll-policy';
const row=(id,weight=1,tags=['fire'])=>({id,weight,tags,min:0});
const fixture=()=>({content:{skills:[row('starter'),row('locked')],supports:[row('support')],starters:new Set(['starter']),rules:{tagWeights:{},biasMult:2.5,floorMult:2,carriedMult:.25}},context:{level:1,all:false,skills:new Set(['starter']),supports:new Set(['support']),carriedSkills:new Set(),carriedSupports:new Set()}});
let cases=0;
const check=(name,edit,expected)=>{const {content,context}=fixture();edit(content,context);const plan=compileMemoryRollPolicy(content,context);assert.deepEqual([plan.skillDraws,plan.supportDraws,plan.supportAvailable],expected,name);let draws=0;const random=()=>{draws++;return .75;};const gem=plan.skill(random);assert.equal(draws,plan.skillDraws);assert(gem&&Object.isFrozen(gem));assert.strictEqual(plan.skill(random),gem);draws=0;const support=plan.support(random);assert.equal(draws,plan.supportDraws);assert.strictEqual(support,plan.supportAvailable?gem:null);assert(Object.isFrozen(plan));cases++;};
check('ordinary',()=>{},[2,1,true]);
check('absent tag multiplier',c=>{c.rules.tagWeights.fire=undefined;},[2,1,true]);
check('zero totals',c=>{for(const r of [...c.skills,...c.supports])r.weight=0;},[1,0,true]);
check('empty supports',(_,x)=>x.supports.clear(),[2,0,false]);
check('master access',(_,x)=>{x.skills.clear();x.supports.clear();x.all=true;},[2,1,true]);
check('floor access',(_,x)=>{x.skills.clear();x.supports.clear();x.floor={skills:new Set(['locked']),supports:new Set(['support'])};},[2,1,true]);
check('minimum applies to floor', (c,x)=>{c.supports[0].min=2;x.floor={skills:new Set(),supports:new Set(['support'])};},[2,0,false]);
check('minimum applies to master', (c,x)=>{c.supports[0].min=2;x.all=true;},[2,0,false]);
check('fallback ignores minimum', (c,x)=>{c.skills[0].min=2;c.skills[0].weight=0;x.skills.clear();},[1,1,true]);
check('noDrop before fallback', (c,x)=>{c.skills[0].noDrop=true;c.starters.add('locked');c.skills[1].weight=0;},[1,1,true]);
check('tags reach zero',c=>{c.rules.tagWeights.fire=0;},[1,0,true]);
check('bias reaches zero',(c,x)=>{c.rules.biasMult=0;x.bias=['fire'];},[1,0,true]);
check('unmatched bias',(c,x)=>{c.rules.biasMult=0;x.bias=['cold'];},[2,1,true]);
check('carried reaches zero',(c,x)=>{c.rules.carriedMult=0;x.carriedSkills.add('starter');x.carriedSupports.add('support');},[1,0,true]);
check('floor reaches zero',(c,x)=>{c.rules.floorMult=0;x.floor={skills:new Set(['starter','locked']),supports:new Set(['support'])};},[1,0,true]);
check('floating point underflow',(c,x)=>{for(const r of [...c.skills,...c.supports])r.weight=Number.MIN_VALUE;x.carriedSkills.add('starter');x.carriedSupports.add('support');},[1,0,true]);
check('floor multiplication precedes tags',(c,x)=>{for(const r of [...c.skills,...c.supports])r.weight=Number.MIN_VALUE;c.rules.floorMult=2;c.rules.tagWeights.fire=.5;x.floor={skills:new Set(['starter','locked']),supports:new Set(['support'])};},[2,1,true]);
check('tag multiplication preserves order',c=>{for(const r of [...c.skills,...c.supports]){r.weight=Number.MIN_VALUE;r.tags=['tiny','large'];}c.rules.tagWeights={tiny:.5,large:2};},[1,0,true]);
for(const edit of [c=>c.rules.floorMult=-1,c=>c.rules.carriedMult=NaN,c=>c.rules.biasMult=Infinity,c=>c.rules.tagWeights.fire=-1,c=>c.skills[0].weight=NaN,c=>c.supports[0].weight=-1,c=>c.skills[0].min=.5]){
 const {content,context}=fixture();edit(content);assert.throws(()=>compileMemoryRollPolicy(content,context),/invalid-memory-roll/);cases++;
}
for(const level of [-1,NaN,Infinity]){const {content,context}=fixture();context.level=level;assert.throws(()=>compileMemoryRollPolicy(content,context),/invalid-memory-roll-level/);cases++;}
{
 const {content,context}=fixture();content.starters.clear();context.skills.clear();assert.throws(()=>compileMemoryRollPolicy(content,context),/missing-memory-roll-starter/);cases++;
}
{
 const {content,context}=fixture();content.skills[0].weight=Number.MAX_VALUE;content.rules.floorMult=2;context.floor={skills:new Set(['starter']),supports:new Set()};assert.throws(()=>compileMemoryRollPolicy(content,context),/invalid-memory-roll-weight/);cases++;
}
{
 const {content,context}=fixture();content.skills.forEach(r=>r.weight=Number.MAX_VALUE);context.all=true;assert.throws(()=>compileMemoryRollPolicy(content,context),/invalid-memory-roll-weight/);cases++;
}
{
 const {content,context}=fixture(),plan=compileMemoryRollPolicy(content,context);context.supports.clear();content.skills[0].weight=0;content.rules.tagWeights.fire=0;let draws=0;const random=()=>{draws++;return 0;};plan.skill(random);plan.support(random);assert.equal(draws,3,'Borrowed context changed the captured schedule');cases++;
 for(const value of [-1,1,NaN,Infinity,Promise.resolve(.5)])for(const method of ['skill','support']){assert.throws(()=>plan[method](()=>value),/invalid-memory-roll-random/);cases++;}
 const previous=Math.random;Math.random=()=>{throw Error('ambient-random-disallowed');};try{for(let i=0;i<64;i++){plan.skill(random);plan.support(random);}}finally{Math.random=previous;}cases++;
 let failedDraws=0;assert.throws(()=>plan.skill(()=>{failedDraws++;throw Error('expired');}),/expired/);assert.equal(failedDraws,1);cases++;
}
{
 const {content,context}=fixture(),plan=compileMemoryRollPolicy(content,context),fail=()=>{throw Error('runtime-content-read');};
 for(const obj of [...content.skills,...content.supports,content.rules,content,context])for(const key of Object.keys(obj))Object.defineProperty(obj,key,{get:fail,configurable:true});
 let draws=0;const random=()=>{draws++;return .5;};for(let i=0;i<64;i++){plan.skill(random);plan.support(random);}assert.equal(draws,192,'Prepared rolls re-read authored content');cases++;
}
console.log(JSON.stringify({passed:true,cases,capturedContext:true,discardedGemAllocationPerRoll:false,devicePerformanceQualified:false}));
