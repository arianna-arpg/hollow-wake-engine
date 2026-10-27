// One game graph per process, so V8 call-site feedback is not shared by versions.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
import type * as arena from '../src/sim/arena';import type {Actor} from '../src/engine/actor';
import type * as stats from '../src/engine/stats';import type * as skills from '../src/engine/skills';
import type * as procs from '../src/data/procs';import type {SKILLS} from '../src/data/skills';
import type {seedGlobalRandom} from '../src/sim/rng';
type Api={arena:typeof arena;Actor:typeof Actor;stats:typeof stats;skills:typeof skills;procs:typeof procs;SKILLS:typeof SKILLS;seedGlobalRandom:typeof seedGlobalRandom};
type Course={name:string;actors:number;callsPerActor?:number;frames?:number;attemptEveryFrames?:number};
type Plan={warmups:number;samples:number;memorySamples:number;workloads:Course[];memory:{actorCounts:number[];states:string[]}};
const[game,output,planFile]=process.argv.slice(2),validationOnly=process.argv.includes('--validate-only');
const plan:Plan=JSON.parse(fs.readFileSync(planFile,'utf8')),get=(file:string)=>import(pathToFileURL(path.join(game,'src',file+'.ts')).href);
const api:Api={arena:await get('sim/arena'),Actor:(await get('engine/actor')).Actor,stats:await get('engine/stats'),skills:await get('engine/skills'),
  procs:await get('data/procs'),SKILLS:(await get('data/skills')).SKILLS,seedGlobalRandom:(await get('sim/rng')).seedGlobalRandom};
api.arena.bootSimEngine();
const gc=(globalThis as typeof globalThis&{gc?:()=>void}).gc;assert(gc,'Run with --expose-gc');
const collect=()=>{gc!();gc!();return process.memoryUsage().heapUsed;};
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const median=(xs:number[])=>xs.slice().sort((a,b)=>a-b)[Math.floor(xs.length/2)];
function clean(p:Actor){
  p.sheet=new api.stats.StatSheet();
  for(const[id,value]of [['life',1e6],['mana',1e6],['healTaken',1.25],['lifeRegen',0],['lifeRegenPct',0],['manaRegen',0],['critChance',0],
    ['castSpeed',1],['attackSpeed',1],['effectDuration',1],['cooldownRecovery',1],['strength',100],['intelligence',100],['willpower',100]] as const)p.sheet.setBase(id,value);
  p.life=5e5;p.mana=1e6;p.es=0;p.poise=0;p.ward=0;p.insight=0;p.endurance=0;p.absorb=0;p.dead=false;p.brain=undefined;p.skills=[];
  p.radius=10;p.tier=0;p.level=5;p.healedSince=0;p.reservedLife=0;p.lifeSealAt=undefined;p.buffs.clear();p.charges.clear();p.statuses=[];p.gainEvents=[];
  p.condRose=[];p.gasped=false;p.procReadyAt.clear();p.procAttemptAt.clear();p.procFiredAt.clear();p.procCues=undefined;p.procCuePulses=[];p.procPopEvents=[];
}
function makeActor(i:number){const p=new api.Actor('recovery-benchmark-'+i,'player',{x:700+i*20,y:700});clean(p);return p;}
function state(p:Actor){return structuredClone({life:p.life,mana:p.mana,dead:p.dead,healedSince:p.healedSince,since:[...p.since],reserved:p.reservedLife,seal:p.lifeSealAt,
  pulses:p.procCuePulses,pops:p.procPopEvents,absorb:p.absorb,streams:p.restoreStreams,casting:p.casting?{id:p.casting.inst.def.id,mode:p.casting.mode}:null,
  ready:[...p.procReadyAt],attempted:[...p.procAttemptAt],fired:[...p.procFiredAt],cooldowns:[...p.cooldowns],conditions:p.condRose,
  maximum:p.maxLife(),rate:p.sheet.get('healTaken')});}
function setup(c:Course){
  const restore=api.seedGlobalRandom(0xb042),isWorld=c.name.endsWith('world-frames')||c.name==='heal-proc-dispatch';
  const world=isWorld?api.arena.makeSimWorld('warrior',0xb042):undefined;
  const actors=Array.from({length:c.actors},(_,i)=>{if(i===0&&world){clean(world.player);world.player.pos={x:700,y:700};return world.player;}return makeActor(i);});
  const counts={observed:0,ordinary:0,silent:0,healed:0,returned:0,attempts:0,accepted:0};
  for(const p of actors){
    const observer=p.onLifeHealed;
    p.onLifeHealed=function(amount,silent){counts.observed++;counts.healed+=amount;if(silent)counts.silent++;else counts.ordinary++;observer?.call(this,amount,silent);};
    if(c.name==='refused')p.dead=actors.indexOf(p)%2===1;
    if(c.name==='already-full')p.life=1e6;
    if(c.name==='sealed-clipping'){p.lifeSealAt=500002;p.reservedLife=400000;}
    if(c.name==='regenerating-world-frames')p.sheet.setBase('lifeRegen',20);
    // Warm identical native stat caches outside the measured region.
    p.maxLife();p.sheet.get('healTaken');
  }
  if(world){world.actors=actors;world.walk=null;world.time=10;world.texts=[];world.flashes=[];world.devIgnoreSkillAttributes=true;}
  const instance=c.name==='casting-world-frames'?api.skills.makeSkillInstance(api.SKILLS.mend,1,1):undefined;
  if(instance){assert(world);actors[0].skills=[instance];world.meta.knownSkills.set(instance.def.id,instance);}
  const proc=api.procs.PROCS.guarded_heart;
  if(c.name==='heal-proc-dispatch')for(const p of actors)p.sheet.setBase(api.procs.procPowerStat(proc.id),1);
  let draws=0;const random=Math.random;Math.random=()=>{draws++;return random();};
  const run=()=>{
    if(c.frames){assert(world);for(let frame=0;frame<c.frames;frame++){
      if(instance&&frame % c.attemptEveryFrames! === 0){counts.attempts++;if(world.useSkill(actors[0],instance,actors[1].pos))counts.accepted++;}
      world.update(1/60);
    }}else for(let call=0;call<c.callsPerActor!;call++)for(let i=0;i<actors.length;i++){
      const p=actors[i];
      switch(c.name){
        case 'refused':counts.returned+=p.healBy(i%2===0?0:3);break;
        case 'already-full':case 'ordinary':counts.returned+=p.healBy(3);break;
        case 'silent':counts.returned+=p.healBy(3,true);break;
        case 'sealed-clipping':p.life=5e5;counts.returned+=p.healBy(3);break;
        case 'full-refill':p.life=5e5;p.refillLife();break;
        case 'heal-proc-dispatch':p.life=5e5;world!['executeProc'](proc,p,null,null,0);break;
        default:throw Error('Unknown recovery workload: '+c.name);
      }
    }
  };
  const receipt=()=>{
    const calls=(c.callsPerActor??0)*c.actors;
    if(c.name==='refused'||c.name==='already-full'){assert.equal(counts.observed,0);assert.equal(counts.returned,0);}
    if(c.name==='ordinary'||c.name==='silent'){assert.equal(counts.observed,calls);assert.equal(counts.returned,calls*3.75);assert.equal(counts.healed,counts.returned);assert.equal(counts.silent,c.name==='silent'?calls:0);assert(actors.every(p=>p.life===5e5+c.callsPerActor!*3.75));}
    if(c.name==='sealed-clipping'){assert.equal(counts.returned,calls*2);assert.equal(counts.observed,calls);assert(actors.every(p=>p.life===500002));}
    if(c.name==='full-refill'){assert.equal(counts.silent,calls);assert.equal(counts.healed,calls*5e5);assert(actors.every(p=>p.life===1e6&&p.healedSince===0));}
    if(c.name==='heal-proc-dispatch'){assert.equal(counts.ordinary,calls);assert(counts.healed>0);assert(actors.every(p=>p.procCuePulses.some(c=>c.phase==='gain')));}
    if(c.name==='regenerating-world-frames'){assert(counts.silent>0);assert.equal(counts.ordinary,0);assert(actors.every(p=>p.life>5e5));}
    if(instance){assert(counts.accepted>1);assert(counts.ordinary>0);assert(actors[1].life>5e5);}
    return{name:c.name,counts,draws,actors:actors.map(state),world:world?{time:world.time,texts:world.texts,flashes:world.flashes,pendingBursts:world['pendingBursts'].length}:null};
  };
  return{run,receipt,restore};
}
const results:unknown[]=[];
for(const course of plan.workloads){
  const samples:number[]=[];let expected='';
  for(let trial=validationOnly?0:-plan.warmups;trial<(validationOnly?1:plan.samples);trial++){
    const prepared=setup(course);
    try{collect();const start=validationOnly?0:performance.now();prepared.run();const elapsed=validationOnly?0:performance.now()-start;
      const actual=JSON.stringify(prepared.receipt());if(!expected)expected=actual;else assert.equal(actual,expected,'Within-graph recovery outcome drift');
      if(trial>=0&&!validationOnly)samples.push(elapsed);
    }finally{prepared.restore();}
  }
  const sorted=samples.slice().sort((a,b)=>a-b);
  results.push({name:course.name,receipt:JSON.parse(expected),receiptSha256:digest(JSON.parse(expected)),...(validationOnly?{}:{samplesMs:samples,medianMs:median(samples),p95Ms:sorted[Math.floor(sorted.length*.95)]})});
  console.log((validationOnly?'Validated ':'Measured ')+course.name);
}
function batch(count:number,mode:string){
  let actors:Actor[]|null=Array.from({length:count},(_,i)=>makeActor(i));
  if(mode==='used')for(const p of actors){p.healBy(3);p.refillLife();}else assert.equal(mode,'unused');
  const receipt=digest(actors.map(state)),witnesses=[0,Math.floor(count/2),count-1].map(i=>new WeakRef(actors![i]));
  return{receipt,witnesses,release(){actors=null;}};
}
const memory:unknown[]=[];
for(const mode of plan.memory.states)for(const count of plan.memory.actorCounts){
  const samples:unknown[]=[];let expected='';const retained:number[]=[];
  for(let trial=0;trial<(validationOnly?1:plan.memorySamples);trial++){
    const restore=api.seedGlobalRandom(0xb042);
    try{const b=batch(count,mode);if(!expected)expected=b.receipt;else assert.equal(b.receipt,expected);
      const retainedHeap=collect();b.release();await new Promise<void>(resolve=>setImmediate(resolve));const releasedHeap=collect();
      assert(b.witnesses.every(ref=>ref.deref()===undefined),'Released recovery Actors remain reachable');
      if(!validationOnly){retained.push(retainedHeap-releasedHeap);samples.push({retainedHeap,releasedHeap,retainedBytes:retainedHeap-releasedHeap,witnessesReleased:true});}
    }finally{restore();}
  }
  memory.push({mode,count,receiptSha256:expected,witnessesReleased:true,...(validationOnly?{}:{samples,medianBytesPerActor:median(retained)/count})});
  console.log((validationOnly?'Validated memory ':'Measured memory ')+mode+'/'+count);
}
fs.writeFileSync(output,JSON.stringify({validationOnly,node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,
  planSha256:createHash('sha256').update(fs.readFileSync(planFile)).digest('hex'),results,memory},null,2)+'\n',{flag:'wx'});
