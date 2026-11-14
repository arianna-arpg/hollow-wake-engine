import assert from 'node:assert/strict';
import {MemoryRollCatalogue} from 'candidate/memory-roll-catalogue';
import data from 'candidate/roll-rows';
const copy=value=>JSON.parse(JSON.stringify(value)),rules={tagWeights:{},biasMult:2.5,floorMult:2,carriedMult:.25};
const context={level:1,all:false,skills:new Set(),supports:new Set(),carriedSkills:new Set(),carriedSupports:new Set()};
const raw=copy(data),catalogue=new MemoryRollCatalogue(raw),id=catalogue.contentId;
let cases=0;
const initial=catalogue.prepare(rules,context);assert.equal(initial.supportAvailable,false);assert.equal(initial.skillDraws,2);cases++;
raw.skills.forEach(row=>row.weight=0);raw.starters.length=0;raw.contentId='changed';assert.equal(catalogue.contentId,id);assert.equal(catalogue.prepare(rules,context).skillDraws,2,'Caller changed retained content');cases++;
const all=catalogue.prepare(rules,{...context,level:80,all:true});assert(all.supportAvailable&&all.supportDraws===1);cases++;
for(const mutate of [p=>p.schemaVersion=2,p=>p.capability='unknown',p=>p.extra=1,p=>p.contentId='',p=>p.skills.push(p.skills[0]),p=>p.supports.push(p.supports[0]),p=>p.skills[0].weight=-1,p=>p.skills[0].min=.5,p=>p.skills[0].tags=[4],p=>p.skills[0].extra=true,p=>p.skills[0].noDrop=1,p=>p.supports[0].noDrop=true,p=>p.starters.push(p.starters[0]),p=>p.starters=['unknown'],p=>p.starters=[],p=>p.skills.forEach(row=>row.noDrop=true)]){
 const bad=copy(data);mutate(bad);assert.throws(()=>new MemoryRollCatalogue(bad));cases++;
}
let getterCalls=0;const getter=copy(data);Object.defineProperty(getter.skills[0],'weight',{get(){getterCalls++;return 1;},enumerable:true});assert.throws(()=>new MemoryRollCatalogue(getter));assert.equal(getterCalls,0);cases++;
const previous=Math.random;Math.random=()=>{throw Error('ambient-random-disallowed');};try{let draws=0;for(let i=0;i<64;i++){all.skill(()=>{draws++;return .5;});all.support(()=>{draws++;return .5;});}assert.equal(draws,192);}finally{Math.random=previous;}cases++;
console.log(JSON.stringify({passed:true,cases,skills:data.skills.length,supports:data.supports.length,contentId:id,detachedContent:true,devicePerformanceQualified:false}));
