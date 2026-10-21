import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import * as arena from '../src/sim/arena';import * as skills from '../src/engine/skills';import {SKILLS} from '../src/data/skills';import {Actor} from '../src/engine/actor';import {seedGlobalRandom} from '../src/sim/rng';
const [previous,current,output]=process.argv.slice(2);
const load=async(game:string)=>{const get=(file:string)=>import(pathToFileURL(path.join(game,file)).href);return {arena:await get('src/sim/arena.ts'),skills:await get('src/engine/skills.ts'),...await get('src/data/skills.ts'),...await get('src/engine/actor.ts'),...await get('src/sim/rng.ts')};};
const apis:any={original:{arena,skills,SKILLS,Actor,seedGlobalRandom},previous:await load(previous),current:await load(current)},keys=Object.keys(apis),configs:any={},results:any[]=[];
for(const key of keys){
 const api=apis[key];api.arena.bootSimEngine();const restore=api.seedGlobalRandom(241000);let world:any;try{world=api.arena.makeSimWorld('magician',241000);}finally{restore();}
 world.devIgnoreSkillAttributes=true;
 const actors=Array.from({length:64},(_,i)=>{
  const actor=new api.Actor('Held worker','player',{x:500,y:500});
  for(const [id,value]of Object.entries({life:1000,mana:1000,energyShield:0,lifeRegen:0,manaRegen:0,poise:0}))actor.sheet.setBase(id,value);
  const definition={...api.SKILLS.firebolt,id:'held_benchmark_'+(i%2?'stages':'charge'),manaCost:6,lifeCost:2,cooldown:2,
   castMode:i%2?'overcharge':'charge',chargeUp:i%2?undefined:{maxTime:2,minScale:.5,maxScale:2,arcTaper:2,speedAtFull:.7},
   overcharge:i%2?{stages:3,time:.8,perStage:.4,aoePerStage:.12,window:.25}:undefined};
  actor.skills=[api.skills.makeSkillInstance(definition,1,0)];return actor;
 });
 world.actors=[world.player,...actors];configs[key]={world,actors};
}
const prepare=(key:string)=>{
 const {world,actors}=configs[key],restore=apis[key].seedGlobalRandom(241001);
 try{
  world.time=0;world.projectiles.length=0;world.flashes.length=0;
  for(const actor of actors){actor.casting=null;actor.fillResources();actor.useLock=0;actor.cooldowns.clear();actor.cooldownTotals.clear();actor.gainEvents.length=0;
   assert(world.useSkill(actor,actor.skills[0],{x:900,y:500}));actor.casting.aiHold=1000;
  }
 }finally{restore();}
};
const run=(key:string,withActorTimers:boolean)=>{
 const {world,actors}=configs[key],restore=apis[key].seedGlobalRandom(241002);
 try{
  for(let frame=0;frame<128;frame++){
   world.time+=.025;
   for(const actor of actors){if(frame===127&&actor.casting)actor.casting.aiHold=0;if(withActorTimers)actor.updateTimers(.025);world.updateCasting(actor,.025);}
  }
  return {actors:actors.map((a:any)=>({mana:a.mana,life:a.life,recovery:a.useLock,cast:a.casting?{mode:a.casting.mode,elapsed:a.casting.elapsed,stage:a.casting.stage}:null,cooldowns:[...a.cooldowns],events:a.gainEvents})),projectiles:world.projectiles.map((p:any)=>({mult:p.mult,speed:p.speed})),flashes:world.flashes.map((f:any)=>({radius:f.radius,color:f.color,life:f.life}))};
 }finally{restore();}
};
for(const [name,timers]of [['admitted-cast-phase',false],['actor-timers-and-cast-phase',true]] as const){
 const samples:Record<string,number[]>=Object.fromEntries(keys.map(k=>[k,[]]));let expected='';
 for(let trial=-5;trial<25;trial++)for(let offset=0;offset<keys.length;offset++){
  const key=keys[((trial+keys.length*2)%keys.length+offset)%keys.length];prepare(key);
  const start=performance.now(),result=run(key,timers),elapsed=performance.now()-start,actual=JSON.stringify(result);
  if(!expected)expected=actual;else assert.equal(actual,expected,name+'/'+key);if(trial>=0)samples[key].push(elapsed);
 }
 const timing=Object.fromEntries(keys.map(k=>{const sorted=[...samples[k]].sort((a,b)=>a-b);return[k,{samplesMs:samples[k],medianMs:sorted[12],p95Ms:sorted[23]}];}));
 results.push({name,derivedSha256:createHash('sha256').update(expected).digest('hex'),...timing});console.log(name+': '+keys.map(k=>k+'='+timing[k].medianMs.toFixed(4)+'ms').join(', '));
}
fs.writeFileSync(output,JSON.stringify({scope:'64 real Actors, half charge-up and half overcharge, admitted through actual World.useSkill outside timing. Each receives 128 updates of 0.025 seconds through real World.updateCasting, with and without Actor.updateTimers. Autonomous holds are preset and released on the final frame; actual native payments, stage triggers and firebolt deliveries execute. Setup/equality excluded; result projection included equally. Five warmups and 25 rotating samples; complete derived outputs must agree. Desktop Node path measurements, not renderer, allocation/GC, native-engine, whole-frame or target-device budgets.',node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,results},null,2)+'\n',{flag:'wx'});
