// Real native scheduling, delivery, contact and frame paths. Imports below are
// type-only: the pinned original is used to check the helper, not timed as a
// third, differently integrated game. Each installed graph has its own modules.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
import type * as arena from '../src/sim/arena';import type {Actor} from '../src/engine/actor';import type {StatSheet} from '../src/engine/stats';import type * as procs from '../src/data/procs';import type * as skills from '../src/engine/skills';import type {SKILLS} from '../src/data/skills';import type {seedGlobalRandom} from '../src/sim/rng';
type Api={arena:typeof arena;Actor:typeof Actor;StatSheet:typeof StatSheet;procs:typeof procs;skills:typeof skills;SKILLS:typeof SKILLS;seedGlobalRandom:typeof seedGlobalRandom};
type Course={name:string;calls?:number;pending?:number;actors?:number;waves?:number;pendingPerWave?:number;batches?:number;targets?:number;interval?:number;frames?:number;attemptEveryFrames?:number;quietTailFrames?:number};
const [previous,current,output,planPath]=process.argv.slice(2),validationOnly=process.argv.includes('--validate-only');
const plan: {warmups:number;samples:number;memorySamples:number;memoryEntries:number[];workloads:Course[]}=JSON.parse(fs.readFileSync(planPath,'utf8'));
const load=async(game:string):Promise<Api>=>{const get=(file:string)=>import(pathToFileURL(path.join(game,'src',file+'.ts')).href);return {arena:await get('sim/arena'),Actor:(await get('engine/actor')).Actor,StatSheet:(await get('engine/stats')).StatSheet,procs:await get('data/procs'),skills:await get('engine/skills'),SKILLS:(await get('data/skills')).SKILLS,seedGlobalRandom:(await get('sim/rng')).seedGlobalRandom};};
const apis:Record<string,Api>={previous:await load(previous),current:await load(current)},comparisonAt=process.argv.indexOf('--comparison-adapter');if(comparisonAt>=0)apis.comparison=await load(process.argv[comparisonAt+1]);
const names=Object.keys(apis),orderAt=process.argv.indexOf('--order'),order=orderAt<0?undefined:process.argv[orderAt+1];assert(orderAt<0||order,'Missing --order');
const keys=order?order.split(','):names;assert.deepEqual([...keys].sort(),[...names].sort(),'Order must include each graph exactly once');
const ids=['radiant_reprisal','radiant_cascade','sainted_ash'];for(const api of Object.values(apis)){api.arena.bootSimEngine();assert.equal(api.procs.PROC_LIST.filter(p=>p.effect.type==='delayedBurst').length,5);}
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),gc=(globalThis as typeof globalThis&{gc?:()=>void}).gc;assert(gc,'Run with --expose-gc');
const collect=()=>{gc!();gc!();return process.memoryUsage().heapUsed;},median=(values:number[])=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)];
const rotate=(trial:number,offset:number)=>keys[((trial%keys.length)+keys.length+offset)%keys.length];
function clean(api:Api,a:Actor){
 a.sheet=new api.StatSheet();a.sheet.setBase('life',1e9);a.life=5e8;a.sheet.setBase('mana',1e9);a.mana=1e9;a.sheet.setBase('critChance',0);a.sheet.setBase('accuracy',1e6);a.sheet.setBase('killProcOnHit',1);a.sheet.setBase('strength',100);a.sheet.setBase('willpower',100);
 a.es=0;a.poise=0;a.ward=0;a.insight=0;a.endurance=0;a.absorb=0;a.tier=0;a.radius=10;a.level=5;a.dead=false;a.brain=undefined;a.skills=[];a.statuses=[];a.charges.clear();a.buffs.clear();a.healedSince=0;a.procReadyAt.clear();a.procAttemptAt.clear();a.procFiredAt.clear();a.condRose=[];a.gasped=false;
}
function setup(api:Api,c:Course){
 const restore=api.seedGlobalRandom(0xbc40),w=api.arena.makeSimWorld('warrior',0xbc40),p=w.player;clean(api,p);p.pos={x:700,y:700};w.walk=null;w.time=10;w.flashes=[];w.texts=[];
 const actorCount=c.actors??(1+c.targets!),actors=[p];
 for(let i=1;i<actorCount;i++){
  const team=c.targets?'enemy':i%2?'enemy':'player',a=new api.Actor('burst-'+i,team,{x:710+i*.5,y:700});clean(api,a);a.rarity='rare';
  if(c.name==='sparse-deliveries'&&i>1)a.pos={x:2000+i*10,y:2000};
  if(c.name==='filtered-deliveries'){if(i%4===0)a.dead=true;else if(i%4===1)a.untargetable=true;else if(i%4===2)a.tier=1;}
  actors.push(a);
 }
 w.actors=actors;let draws=0;const random=Math.random;Math.random=()=>{draws++;return random();};
 const queue=()=>w['pendingBursts'],schedule=()=>w['executeProc'](api.procs.PROCS.radiant_cascade,p,null,actors[1]??p,0);
 const observe=()=>({time:w.time,draws,pending:queue().length,queueSha256:digest(queue().map(b=>({when:b.when,owner:actors.indexOf(b.owner),at:b.at,fx:b.fx,color:b.color,depth:b.depth,tier:b.tier}))),
  actorsSha256:digest(actors.map((a,index)=>({index,pos:a.pos,life:a.life,mana:a.mana,es:a.es,ward:a.ward,dead:a.dead,hitFlash:a.hitFlash,esBroke:a.esBroke,healedSince:a.healedSince,ready:[...a.procReadyAt],attempt:[...a.procAttemptAt],fired:[...a.procFiredAt],conditions:[...a.condRose],gains:a.gainEvents,buffs:[...a.buffs],statuses:a.statuses,cooldowns:[...a.cooldowns],casting:a.casting?{skill:a.casting.inst.def.id}:null}))),
  flashes:w.flashes.length,flashesSha256:digest(w.flashes),texts:w.texts.length,textsSha256:digest(w.texts),ownerLife:p.life,enemyLife:actors[1]?.life??null});
 if(c.name==='empty-drain'||c.name==='waiting-drain'){
  for(let i=0;i<c.pending!;i++)schedule();const before=digest(observe());
  return {restore,world:w,schedule,observe,run:()=>{for(let i=0;i<c.calls!;i++)w['updatePendingBursts']();},receipt:()=>{assert.equal(digest(observe()),before);return {...c,...observe()};}};
 }
 if(c.waves){
  const waves:ReturnType<typeof queue>[]=[];for(let wave=0;wave<c.waves;wave++){w['pendingBursts']=[];for(let i=0;i<c.pendingPerWave!;i++)schedule();waves.push(queue());}
  w.flashes=[];w.time+=.5;
  return {restore,world:w,schedule,observe,run:()=>{for(const wave of waves){w['pendingBursts']=wave;w['updatePendingBursts']();}},receipt:()=>{assert(waves.every(a=>a.length===0));assert.equal(w.flashes.length,c.waves!*c.pendingPerWave!);assert(p.life>5e8);assert(w.texts.length>0);if(c.name!=='filtered-deliveries')assert(actors[1].life<5e8);return {...c,...observe()};}};
 }
 for(const id of ids)p.sheet.setBase(api.procs.procStat(id),1);
 const inst=api.skills.makeSkillInstance(api.SKILLS.sanctified_strike);assert.equal(inst.def,api.SKILLS.sanctified_strike);p.skills=[inst];
 let peak=0,accepted=0,contacts=0;const targets=actors.slice(1);
 if(c.batches){
  return {restore,world:w,schedule,observe,run:()=>{for(let batch=0;batch<c.batches!;batch++){w.time=10+batch*c.interval!;for(const target of targets){w['resolveHit'](p,inst,target);contacts++;}peak=Math.max(peak,queue().length);w['updatePendingBursts']();}w.time+=.5;w['updatePendingBursts']();},receipt:()=>{assert.equal(contacts,c.batches!*c.targets!);assert(peak>0);assert.equal(queue().length,0);assert(targets.every(a=>a.life<5e8&&!a.dead));assert(p.life>5e8);return {...c,contacts,peak,...observe()};}};
 }
 assert(c.frames);
 return {restore,world:w,schedule,observe,run:()=>{for(let frame=0;frame<c.frames!;frame++){if(c.attemptEveryFrames&&frame<c.frames!-c.quietTailFrames!&&frame%c.attemptEveryFrames===0){if(w.useSkill(p,inst,actors[1].pos))accepted++;}w.update(1/60);peak=Math.max(peak,queue().length);}},receipt:()=>{assert.equal(w.actors.length,actors.length);assert.equal(queue().length,0);assert(!p.dead);if(c.name==='casting-frames'){assert(accepted>0);assert(peak>0);assert(actors.some(a=>a.team==='enemy'&&a.life<5e8));assert(p.life>5e8);}else{assert.equal(peak,0);assert.equal(accepted,0);}return {...c,accepted,peak,...observe()};}};
}
const results:unknown[]=[];
for(const course of plan.workloads){
 const samples:Record<string,number[]>=Object.fromEntries(keys.map(key=>[key,[]]));let expected='';
 for(let trial=validationOnly?0:-plan.warmups;trial<(validationOnly?1:plan.samples);trial++)for(let offset=0;offset<keys.length;offset++){
  const key=rotate(trial,offset),prepared=setup(apis[key],course);
  try{collect();const start=performance.now();prepared.run();const elapsed=performance.now()-start,actual=JSON.stringify(prepared.receipt());if(!expected)expected=actual;else assert.equal(actual,expected,course.name+'/'+key);if(trial>=0)samples[key].push(elapsed);}finally{prepared.restore();}
 }
 const timing=Object.fromEntries(keys.map(key=>{const sorted=[...samples[key]].sort((a,b)=>a-b);return[key,{samplesMs:samples[key],medianMs:median(sorted),p95Ms:sorted[Math.floor(sorted.length*.95)]}];}));
 results.push({name:course.name,receipt:JSON.parse(expected),receiptSha256:digest(JSON.parse(expected)),...timing});console.log((validationOnly?'Validated ':'Measured ')+course.name+': '+keys.map(key=>key+'='+timing[key].medianMs.toFixed(4)+'ms').join(', '));
}
const memory:unknown[]=[];
for(const count of plan.memoryEntries){
 const samples:Record<string,unknown[]>=Object.fromEntries(keys.map(key=>[key,[]]));let expected='';
 for(let trial=0;trial<(validationOnly?1:plan.memorySamples);trial++)for(let offset=0;offset<keys.length;offset++){
  const key=rotate(trial,offset),prepared=setup(apis[key],{name:'waiting-drain',actors:1,pending:0,calls:0});
  try{for(let i=0;i<count;i++)prepared.schedule();assert.equal(prepared.world['pendingBursts'].length,count);prepared.world.flashes=[];
   const receiptSha256=digest(prepared.observe());if(!expected)expected=receiptSha256;else assert.equal(receiptSha256,expected,'Retained queue receipt differs');
   const retainedHeap=collect();prepared.world['pendingBursts']=[];const releasedHeap=collect();assert.equal(prepared.world['pendingBursts'].length,0);samples[key].push({retainedHeap,releasedHeap,retainedBytes:retainedHeap-releasedHeap,receiptSha256});
  }finally{prepared.restore();}
 }
 const summary=Object.fromEntries(keys.map(key=>[key,{samples:samples[key],medianBytesPerEntry:median((samples[key] as {retainedBytes:number}[]).map(s=>s.retainedBytes))/count}]));
 memory.push({count,...summary});console.log((validationOnly?'Validated retained queue ':'Measured retained queue ')+count+': '+keys.map(key=>key+'='+summary[key].medianBytesPerEntry.toFixed(1)+' bytes/entry').join(', '));
}
fs.writeFileSync(output,JSON.stringify({validationOnly,comparisonIncluded:comparisonAt>=0,graphOrder:keys,node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,planSha256:createHash('sha256').update(fs.readFileSync(planPath)).digest('hex'),scope:validationOnly?'Receipt validation only; no performance conclusion.':'Controlled desktop Node comparison. See the hashed performance plan for workloads, exclusions, memory method and required repeat runs. No renderer, physical input, device, FPS, allocation-volume or peak-memory claim.',results,memory},null,2)+'\n',{flag:'wx'});
