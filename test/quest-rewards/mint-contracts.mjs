import assert from 'node:assert/strict';
import {prepareQuestMemories as prepare} from 'candidate/quest-memory-mint';
import {Random} from '../../src/random.js';
const copy=value=>JSON.parse(JSON.stringify(value)),initial=new Random(42).snapshot(),checks=[];
let retained,calls=0;
const factory=({random})=>{retained=random;calls++;return{worldKey:'world',at:{x:100,y:200},services:{clamp:p=>p,floor:()=>undefined,level:()=>1,tileset:()=>undefined,config:()=>({skillShare:1,memoryShare:1,preformedShare:0,foundProvenance:'found'}),rollSkill:()=>{random();random();return{};},rollSupport:()=>null,presentation:()=>({jitter:random()})}};};
const before=copy(initial),ambient=Math.random;Math.random=()=>{throw Error('ambient-random-disallowed');};
try{
 const result=prepare(initial,6,factory);assert.equal(result.random.draws,42,'Mint stream omitted original roll or presentation draws');assert.equal(calls,1);assert.equal(result.drops.length,6);assert.equal(result.presentations.length,6);assert(result.placements.every(p=>p.tier===undefined));assert.deepEqual(initial,before);assert.throws(retained,/expired-quest-mint-stream/);checks.push('owned-stream-and-expiry');
 const zero=prepare(initial,0,()=>assert.fail('Zero payout called mint factory'));assert.deepEqual(zero,{random:initial,drops:[],placements:[],presentations:[]});checks.push('zero-payout');
 const part=prepare(initial,2,factory),rest=prepare(part.random,4,factory);assert.deepEqual([...part.drops,...rest.drops],result.drops);assert.deepEqual([...part.placements,...rest.placements],result.placements);assert.deepEqual([...part.presentations,...rest.presentations],result.presentations);assert.deepEqual(rest.random,result.random);checks.push('continuation-matches-uninterrupted');
 for(const count of [-1,65,NaN]){assert.throws(()=>prepare(initial,count,()=>assert.fail('Invalid count called factory')));assert.deepEqual(initial,before);}checks.push('bounded-payout');
 for(const bad of [{...initial,extra:true},{...initial,draws:Infinity},{...initial,state:-1},{...initial,algorithm:'unknown'}])assert.throws(()=>prepare(bad,1,()=>assert.fail('Invalid stream called factory')));checks.push('strict-stream-admission');
 const rejected=(name,make)=>{assert.throws(()=>prepare(initial,1,scope=>make(factory(scope),scope)),name);assert.deepEqual(initial,before,name+' changed caller stream');assert.throws(retained,/expired-quest-mint-stream/,name+' retained a live stream');checks.push(name);};
 rejected('factory-failure-after-draw',(_context,scope)=>{scope.random();throw Error('injected-factory-failure');});
 rejected('async-factory',context=>Promise.resolve(context));
 rejected('unsupported-bare-gem-policy',context=>{context.services.config=()=>({skillShare:1,memoryShare:0,preformedShare:0,foundProvenance:'found'});return context;});
 rejected('invalid-placement',context=>{context.services.clamp=()=>({x:Infinity,y:0});return context;});
 rejected('invalid-story',context=>({...context,tier:NaN}));
 rejected('asynchronous-roll',context=>{context.services.rollSkill=()=>Promise.resolve({});return context;});
 rejected('asynchronous-presentation',context=>{context.services.presentation=()=>Promise.resolve({});return context;});
 const limit={...initial,draws:Number.MAX_SAFE_INTEGER};assert.throws(()=>prepare(limit,1,factory),/quest-mint-stream-exhausted/);assert.equal(limit.draws,Number.MAX_SAFE_INTEGER);assert.throws(retained,/expired-quest-mint-stream/);checks.push('stream-overflow');
}finally{Math.random=ambient;}
console.log(JSON.stringify({passed:true,contracts:checks.length,checks}));
