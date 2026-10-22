// Direct native-method comparisons; no copied gauge or bank implementation.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import * as arena from '../src/sim/arena';import {Actor} from '../src/engine/actor';import * as skills from '../src/engine/skills';import {SKILLS} from '../src/data/skills';import {seedGlobalRandom} from '../src/sim/rng';
const [previous,current,output]=process.argv.slice(2),validationOnly=process.argv.includes('--validate-only');
const load=async(game:string)=>{const get=(file:string)=>import(pathToFileURL(path.join(game,file)).href);return {arena:await get('src/sim/arena.ts'),Actor:(await get('src/engine/actor.ts')).Actor,skills:await get('src/engine/skills.ts'),...(await get('src/data/skills.ts')),...(await get('src/sim/rng.ts'))};};
const apis:any={original:{arena,Actor,skills,SKILLS,seedGlobalRandom},previous:await load(previous),current:await load(current)};
const comparisonAt=process.argv.indexOf('--comparison-adapter');if(comparisonAt>=0)apis.comparison=await load(process.argv[comparisonAt+1]);
const keys=Object.keys(apis);for(const key of keys)apis[key].arena.bootSimEngine();
const gc=(globalThis as typeof globalThis&{gc?:()=>void}).gc;assert(gc,'Run with --expose-gc');
function collect(){gc!();gc!();return process.memoryUsage().heapUsed;}
function populate(actor:any,api:any,inst:any){
 actor.statuses=[{id:'poison',stacks:2,remaining:1e6,dps:0,sourceName:'benchmark'}];
 actor.charges=new Map([['communion',1],['frenzy',2],['bloodlust',3]]);
 actor.brims=new Map([['firebolt',{fill:.4,inst,spec:{fillTime:1,decay:.005}}],['communion',{fill:.6,inst:api.skills.makeSkillInstance(api.SKILLS.communion,1,1),spec:{fillTime:1,decay:.005}}]]);
 actor.reserves=new Map([['wick',{pips:4,cur:4,max:10,lastSpendAt:0,ventUntil:0}]]);
 actor.derivedGauges=new Map([['nearbyEnemies',3],['nearbyAllies',2]]);
 actor.sheet.setSource('gauge-benchmark',[
  {stat:'damage',kind:'increased',value:.1,gauge:'charge:communion'},
  {stat:'damage',kind:'increased',value:.2,gauge:'brim:firebolt'},
 ]);
}
function summarize(actors:any[],publications:number){
 return {actors:actors.length,publications,damage:actors.map(a=>a.sheet.get('damage')),gauges:actors.map(a=>['status:poison','charge:communion','brim:firebolt','reserve:wick','nearbyEnemies'].map(id=>a.sheet.gauge(id))),banks:actors.map(a=>[...(a.brims??[])].map(([id,b]:any)=>[id,b.fill]))};
}
function setup(key:string,workload:string){
 const api=apis[key],restore=api.seedGlobalRandom(361501),inst=api.skills.makeSkillInstance(api.SKILLS.firebolt,1,1);let publications=0;
 const instrument=(a:any)=>{const set=a.sheet.setGauges.bind(a.sheet);a.sheet.setGauges=(entries:any)=>{publications++;set(entries);};};
 if(workload==='native-world-bank-frames'){
  const world=api.arena.makeSimWorld('magician',361501),actors=[world.player];world.walk=null;world.actors=actors;
  world.player.pos={x:500,y:500};
  for(let i=1;i<16;i++){const a=world.createMonster('zombie',1,'enemy');a.brain=undefined;a.pos={x:700+i*40,y:500};actors.push(a);}
  for(const a of actors){populate(a,api,inst);a.sheet.setSource('frame-resources',[{stat:'life',kind:'override',value:10000},{stat:'mana',kind:'override',value:10000},{stat:'lifeRegen',kind:'override',value:0},{stat:'manaRegen',kind:'override',value:0}]);a.fillResources();a.casting=null;instrument(a);a.refreshConditions();}
  return {restore,run:()=>{for(let i=0;i<128;i++)world.update(1/60);const receipt={frames:128,time:world.time,liveActors:world.actors.length,life:actors.map(a=>a.life),...summarize(actors,publications)};assert.equal(receipt.liveActors,16);return receipt;}};
 }
 const actors=Array.from({length:64},(_,i)=>new api.Actor('benchmark-'+i,'player',{x:0,y:0}));
 for(const a of actors){if(workload!=='empty-gauge-samples')populate(a,api,inst);instrument(a);a.refreshConditions();}
 const changing=workload==='changing-gauge-samples',operations=changing?16384:32768;
 return {restore,run:()=>{
  for(let i=0;i<operations;i++){
   const a=actors[i%actors.length];if(changing){const phase=Math.floor(i/actors.length)%2;a.charges.set('communion',1+phase);a.brims.get('firebolt').fill=phase?.6:.4;}
   a.refreshConditions();
  }
  return {samples:operations,...summarize(actors,publications)};
 }};
}
const results:any[]=[];
for(const name of ['empty-gauge-samples','stable-populated-gauge-samples','changing-gauge-samples','native-world-bank-frames']){
 const samples:Record<string,number[]>=Object.fromEntries(keys.map(key=>[key,[]]));let expected='';
 for(let trial=validationOnly?0:-5;trial<(validationOnly?1:25);trial++)for(let offset=0;offset<keys.length;offset++){
  const key=keys[((trial+keys.length*2)%keys.length+offset)%keys.length],prepared=setup(key,name);
  try{
   // Set-up and forced collection are outside the timed operation. The loop,
   // native calls, mutations, assertions and receipt construction are timed.
   collect();const start=performance.now(),receipt=prepared.run(),elapsed=performance.now()-start,actual=JSON.stringify(receipt);
   if(!expected)expected=actual;else assert.equal(actual,expected,name+'/'+key);
   if(trial>=0)samples[key].push(elapsed);
  }finally{prepared.restore();}
 }
 const timing=Object.fromEntries(keys.map(key=>{const sorted=[...samples[key]].sort((a,b)=>a-b);return [key,{samplesMs:samples[key],medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.floor(sorted.length*.95)]}];}));
 results.push({name,receipt:JSON.parse(expected),receiptSha256:createHash('sha256').update(expected).digest('hex'),...timing});
 console.log(validationOnly?name+': receipt equality validated':name+': '+keys.map(key=>key+'='+timing[key].medianMs.toFixed(4)+'ms').join(', '));
}
const memory:any[]=[];
function memorySample(key:string,populated:boolean,count:number){
 const api=apis[key],inst=api.skills.makeSkillInstance(api.SKILLS.firebolt,1,1);let actors:any[]|null=null;
 const before=collect();actors=Array.from({length:count},(_,i)=>new api.Actor('retained-'+i,'player',{x:0,y:0}));
 const constructed=collect();if(populated)for(const a of actors)populate(a,api,inst);
 const populatedBytes=collect();for(const a of actors)a.refreshConditions();
 const sampled=collect(),receipt=summarize(actors,0);assert.equal(receipt.actors,count);
 // Receipt creation occurs after the measured heap samples. Only its hash
 // escapes this function; actor and source references can then be collected.
 const hash=createHash('sha256').update(JSON.stringify(receipt)).digest('hex');actors=null;
 return {before,constructed,populated:populatedBytes,sampled,constructorBytes:constructed-before,sourceBytes:populatedBytes-constructed,samplingBytes:sampled-populatedBytes,totalRetainedBytes:sampled-before,receiptSha256:hash};
}
if(!validationOnly)for(const populated of [false,true]){
 const count=1024,samples:Record<string,any[]>=Object.fromEntries(keys.map(key=>[key,[]]));let expected='';
 for(let trial=0;trial<3;trial++)for(let offset=0;offset<keys.length;offset++){
  const key=keys[(trial+offset)%keys.length],sample=memorySample(key,populated,count);if(!expected)expected=sample.receiptSha256;else assert.equal(sample.receiptSha256,expected,'Memory scenario receipts differ');samples[key].push(sample);
 }
 const median=(values:number[])=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)];
 const summary=Object.fromEntries(keys.map(key=>[key,{samples:samples[key],medianRetainedBytesPerActor:median(samples[key].map(s=>s.totalRetainedBytes))/count,medianSamplingBytesPerActor:median(samples[key].map(s=>s.samplingBytes))/count}]));
 memory.push({name:populated?'populated-actors':'empty-actors',count,...summary});console.log('Retained heap '+(populated?'populated':'empty')+': '+keys.map(key=>key+'='+summary[key].medianRetainedBytesPerActor.toFixed(1)+' bytes/actor').join(', '));
}
fs.writeFileSync(output,JSON.stringify({validationOnly,comparisonIncluded:comparisonAt>=0,node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,
 scope:validationOnly?'Validation only: one sample per control confirms receipt equality. Timing is not performance evidence; retained-memory sampling is skipped.':'Desktop Node comparison of real Actor.refreshConditions and World.update. Rotating controls, five warmups and 25 timed samples. Fresh actor/world setup and forced GC are outside timing; mutations, loops, native work, assertions and receipt construction are inside. Source records, resources and quiet worlds are explicit harness setup. The 16-actor world case runs 128 complete native updates with idle decaying banks, not rendering, input or full combat. Memory scenarios retain 1,024 real actors and use three rotating forced-GC heap samples; they measure retained heap, not allocation count, total GC cost, peak RSS or device memory. No Steam Deck/mobile or general FPS claim.',results,memory},null,2)+'\n',{flag:'wx'});
