// One real game graph per process. Setup, validation, hashing and GC are not timed.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
import type * as arena from '../src/sim/arena';import type {Actor} from '../src/engine/actor';
import type * as stats from '../src/engine/stats';import type * as procs from '../src/data/procs';
import type {seedGlobalRandom} from '../src/sim/rng';
type Api={arena:typeof arena;Actor:typeof Actor;stats:typeof stats;procs:typeof procs;seedGlobalRandom:typeof seedGlobalRandom};
type Kind='shield-positive'|'shield-full'|'poise-positive'|'poise-overcharge'|'instant-mana'|'proc-mana'|'proc-poise'|'world-shield-conversion';
type Course={name:Kind;actors:number;callsPerActor?:number;frames?:number;dt?:number};
type Plan={warmups:number;samples:number;memorySamples:number;workloads:Course[];memory:{actorCounts:number[];states:string[]}};
const[game,output,planFile]=process.argv.slice(2),validationOnly=process.argv.includes('--validate-only');
const plan:Plan=JSON.parse(fs.readFileSync(planFile,'utf8')),get=(file:string)=>import(pathToFileURL(path.join(game,'src',file+'.ts')).href);
const api:Api={arena:await get('sim/arena'),Actor:(await get('engine/actor')).Actor,stats:await get('engine/stats'),procs:await get('data/procs'),seedGlobalRandom:(await get('sim/rng')).seedGlobalRandom};
api.arena.bootSimEngine();
const gc=(globalThis as typeof globalThis&{gc?:()=>void}).gc;assert(gc,'Run with --expose-gc');
const collect=()=>{gc!();gc!();return process.memoryUsage().heapUsed;};
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const median=(values:number[])=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)];
const manaProc=api.procs.PROCS.desperate_reserves,poiseProc=api.procs.PROCS.relic_guard_refrain;
assert.deepEqual(manaProc.effect,{type:'restore',resource:'mana',pctMax:.1});
assert.deepEqual(poiseProc.effect,{type:'restore',resource:'poise',pctMax:.06});
function clean(p:Actor){
  p.sheet=new api.stats.StatSheet();
  p.sheet.setSource('restoration-benchmark',[
    ...['life','mana','energyShield','poise'].map(stat=>api.stats.mod(stat,'override',1000)),
    ...['lifeRegen','lifeRegenPct','manaRegen','esRechargeRate','poiseRegenPct','critChance','poiseOvercharge'].map(stat=>api.stats.mod(stat,'override',0)),
    ...['attackSpeed','castSpeed','effectDuration','cooldownRecovery','healTaken',api.procs.procPowerStat(manaProc.id),api.procs.procPowerStat(poiseProc.id)].map(stat=>api.stats.mod(stat,'override',1)),
  ]);
  p.life=1000;p.mana=p.es=p.poise=400;p.esDelay=1000;p.esRecharging=false;p.esJustFilled=false;p.esRechargeJustStarted=false;
  p.poiseBroken=false;p.poiseDelay=0;p.poiseJustRearmed=false;p.reservedMana=100;p.reservedLife=0;p.lifeSealAt=undefined;
  p.dead=false;p.brain=undefined;p.skills=[];p.radius=10;p.tier=0;p.level=5;p.ward=p.insight=p.endurance=p.absorb=0;p.healedSince=0;
  p.buffs.clear();p.charges.clear();p.statuses=[];p.gainEvents=[];p.restoreGains=[];p.restoreStreams=[];p.condRose=[];
  p.procReadyAt.clear();p.procAttemptAt.clear();p.procFiredAt.clear();p.procCues=undefined;p.procCuePulses=[];p.procPopEvents=[];
}
function makeActor(i:number){const p=new api.Actor('restoration-benchmark-'+i,'player',{x:700+i*20,y:700});clean(p);return p;}
function state(p:Actor){return structuredClone({
  life:p.life,mana:p.mana,es:p.es,poise:p.poise,dead:p.dead,healedSince:p.healedSince,reservedMana:p.reservedMana,reservedLife:p.reservedLife,
  esDelay:p.esDelay,esJustFilled:p.esJustFilled,esRecharging:p.esRecharging,esRechargeJustStarted:p.esRechargeJustStarted,
  poiseBroken:p.poiseBroken,poiseDelay:p.poiseDelay,poiseJustRearmed:p.poiseJustRearmed,poiseCalm:p.poiseCalm,
  gainEvents:p.gainEvents,feeding:p.restoreGains,streams:p.restoreStreams,pulses:p.procCuePulses,pops:p.procPopEvents,
  ready:[...p.procReadyAt],attempted:[...p.procAttemptAt],fired:[...p.procFiredAt],cooldowns:[...p.cooldowns],conditions:p.condRose,
});}
function summarize(actors:Actor[]){
  const states=createHash('sha256'),fields=createHash('sha256');
  const totals={life:0,mana:0,es:0,poise:0,events:0,eventAmount:0,feeding:0,pulses:0,pops:0,streams:0};
  for(let i=0;i<actors.length;i++){
    const p=actors[i];states.update(i+':'+JSON.stringify(state(p))+'\n');fields.update(i+':'+JSON.stringify(Object.getOwnPropertyNames(p).sort())+'\n');
    totals.life+=p.life;totals.mana+=p.mana;totals.es+=p.es;totals.poise+=p.poise;totals.events+=p.gainEvents.length;
    for(const e of p.gainEvents)totals.eventAmount+=e.n??0;totals.feeding+=p.restoreGains.length;totals.pulses+=p.procCuePulses.length;totals.pops+=p.procPopEvents.length;totals.streams+=p.restoreStreams.length;
  }
  return{actorStateSha256:states.digest('hex'),actorOwnFieldsSha256:fields.digest('hex'),totals,representatives:[0,Math.floor(actors.length/2),actors.length-1].map(i=>({index:i,state:state(actors[i])}))};
}
function makeWorld(){const w=api.arena.makeSimWorld('warrior',0xb043);w.walk=null;w.time=10;w.texts=[];w.flashes=[];w.devIgnoreSkillAttributes=true;return w;}
function setup(c:Course){
  const restore=api.seedGlobalRandom(0xb043),world=['instant-mana','proc-mana','proc-poise','world-shield-conversion'].includes(c.name)?makeWorld():undefined;
  const actors=Array.from({length:c.actors},(_,i)=>{if(world&&c.name==='world-shield-conversion'&&i===0){clean(world.player);world.player.pos={x:700,y:700};return world.player;}return makeActor(i);});
  for(const p of actors){
    if(c.name==='shield-full')p.es=1000;
    if(c.name==='poise-overcharge'){p.poise=1000;p.sheet.setSource('overcharge',[api.stats.mod('poiseOvercharge','override',.5)]);}
    if(c.name==='world-shield-conversion')p.sheet.setSource('conversion',[api.stats.mod('lifeRegen','override',20),api.stats.mod('lifeRegenToEs','override',1)]);
    // Identical live stat caches are warmed outside the measured interval.
    p.maxLife();p.maxMana();p.availableMaxMana();p.maxEs();p.maxPoise();p.sheet.get('poiseOvercharge');
    p.sheet.get(api.procs.procPowerStat(manaProc.id));p.sheet.get(api.procs.procPowerStat(poiseProc.id));
  }
  if(world&&c.name==='world-shield-conversion')world.actors=actors;
  let returned=0,draws=0;const random=Math.random;Math.random=()=>{draws++;return random();};
  const effect={resource:'mana' as const,amount:3};let run:()=>void;
  switch(c.name){
    case 'shield-positive':case 'shield-full':run=()=>{for(let n=0;n<c.callsPerActor!;n++)for(const p of actors)returned+=p.gainEs(3);};break;
    case 'poise-positive':case 'poise-overcharge':{const amount=c.name==='poise-overcharge'?20:3;run=()=>{for(let n=0;n<c.callsPerActor!;n++)for(const p of actors)returned+=p.gainPoise(amount);};break;}
    case 'instant-mana':run=()=>{for(let n=0;n<c.callsPerActor!;n++)for(const p of actors)returned+=world!['applyRestore'](p,effect);};break;
    case 'proc-mana':case 'proc-poise':{const proc=c.name==='proc-mana'?manaProc:poiseProc;run=()=>{for(let n=0;n<c.callsPerActor!;n++)for(const p of actors)world!['executeProc'](proc,p,null,null,0);};break;}
    case 'world-shield-conversion':run=()=>{for(let frame=0;frame<c.frames!;frame++)world!.update(c.dt!);};break;
    default:throw Error('Unknown restoration workload: '+c.name);
  }
  const receipt=()=>{
    const count=c.callsPerActor??0,calls=count*c.actors;
    for(const p of actors){
      assert.equal(p.life,1000);assert(!p.dead);assert(!p.poiseBroken);assert(!p.esJustFilled);assert(!p.esRecharging);
      if(c.name==='shield-positive')assert.equal(p.es,400+3*count);
      if(c.name==='shield-full')assert.equal(p.es,1000);
      if(c.name==='poise-positive')assert.equal(p.poise,400+3*count);
      if(c.name==='poise-overcharge')assert.equal(p.poise,Math.min(1500,1000+20*count));
      if(c.name==='instant-mana'){assert.equal(p.mana,400+3*count);assert.equal(p.gainEvents.length,count);assert(p.gainEvents.every(e=>e.kind==='restore'&&e.id==='mana'&&e.n===3&&e.depth===0));assert.equal(p.restoreGains.length,1);}
      else assert.equal(p.gainEvents.length,0);
      if(c.name==='proc-mana'){assert.equal(p.mana,900);assert(p.procCuePulses.some(c=>c.id===manaProc.id&&c.phase==='gain'));}
      if(c.name==='proc-poise'){assert.equal(p.poise,1000);assert(p.procCuePulses.some(c=>c.id===poiseProc.id&&c.phase==='gain'));}
      if(c.name==='world-shield-conversion'){assert.equal(p.es,400+20*c.frames!*c.dt!);assert.equal(p.esDelay,1000-c.frames!*c.dt!);}
    }
    if(['shield-positive','poise-positive','instant-mana'].includes(c.name))assert.equal(returned,calls*3);
    if(c.name==='shield-full')assert.equal(returned,0);
    if(c.name==='poise-overcharge')assert.equal(returned,c.actors*Math.min(500,20*count));
    return{name:c.name,actors:c.actors,operations:c.frames?c.frames:calls,actorUpdateOpportunities:c.frames?c.frames*c.actors:0,returned,draws,...summarize(actors),
      world:world?{time:world.time,texts:structuredClone(world.texts),flashes:structuredClone(world.flashes),pendingBursts:world['pendingBursts'].length}:null};
  };
  return{run,receipt,restore};
}
const results:unknown[]=[];
for(const course of plan.workloads){
  const samples:number[]=[];let expected='';
  for(let trial=validationOnly?0:-plan.warmups;trial<(validationOnly?1:plan.samples);trial++){
    const prepared=setup(course);
    try{collect();const start=validationOnly?0:performance.now();prepared.run();const elapsed=validationOnly?0:performance.now()-start;
      const actual=JSON.stringify(prepared.receipt());if(!expected)expected=actual;else assert.equal(actual,expected,'Within-graph restoration outcome drift');
      if(trial>=0&&!validationOnly)samples.push(elapsed);
    }finally{prepared.restore();}
  }
  const sorted=samples.slice().sort((a,b)=>a-b);
  results.push({name:course.name,actors:course.actors,receipt:JSON.parse(expected),receiptSha256:digest(JSON.parse(expected)),...(validationOnly?{}:{samplesMs:samples,medianMs:median(samples),p95Ms:sorted[Math.floor(sorted.length*.95)]})});
  console.log((validationOnly?'Validated ':'Measured ')+course.name+'/'+course.actors);
}
function batch(count:number,mode:string,world:ReturnType<typeof makeWorld>){
  let actors:Actor[]|null=Array.from({length:count},(_,i)=>makeActor(i));
  if(mode==='restored')for(const p of actors){p.gainEs(3);p.gainPoise(3);world['applyRestore'](p,{resource:'mana',amount:3});world['executeProc'](manaProc,p,null,null,0);world['executeProc'](poiseProc,p,null,null,0);}
  else assert.equal(mode,'unused');
  const usedHeapBeforeReceipt=process.memoryUsage().heapUsed,receipt=summarize(actors),witnesses=actors.map(p=>new WeakRef(p));
  return{receipt,usedHeapBeforeReceipt,witnesses,release(){actors=null;}};
}
const memory:unknown[]=[];
for(const mode of plan.memory.states)for(const count of plan.memory.actorCounts){
  const samples:unknown[]=[],retained:number[]=[];let expected='';
  for(let trial=0;trial<(validationOnly?1:plan.memorySamples);trial++){
    const restore=api.seedGlobalRandom(0xb043),world=makeWorld();
    try{const beforeHeap=collect(),b=batch(count,mode,world);const receipt=JSON.stringify(b.receipt);if(!expected)expected=receipt;else assert.equal(receipt,expected);
      const retainedHeap=collect();b.release();await new Promise<void>(resolve=>setImmediate(resolve));const releasedHeap=collect();
      assert(b.witnesses.every(ref=>ref.deref()===undefined),'Released restoration Actors remain reachable');
      if(!validationOnly){retained.push(retainedHeap-releasedHeap);samples.push({beforeHeap,usedHeapBeforeReceipt:b.usedHeapBeforeReceipt,retainedHeap,releasedHeap,retainedBytes:retainedHeap-releasedHeap,allActorWeakRefsReleased:true});}
    }finally{restore();}
  }
  memory.push({mode,count,receipt:JSON.parse(expected),receiptSha256:digest(JSON.parse(expected)),allActorWeakRefsReleased:true,...(validationOnly?{}:{samples,medianBytesPerActor:median(retained)/count})});
  console.log((validationOnly?'Validated memory ':'Measured memory ')+mode+'/'+count);
}
fs.writeFileSync(output,JSON.stringify({validationOnly,node:process.version,v8:process.versions.v8,platform:process.platform,osRelease:os.release(),arch:process.arch,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,totalMemoryBytes:os.totalmem(),
  planSha256:createHash('sha256').update(fs.readFileSync(planFile)).digest('hex'),authoredProcs:{mana:manaProc,poise:poiseProc},results,memory},null,2)+'\n',{flag:'wx'});
