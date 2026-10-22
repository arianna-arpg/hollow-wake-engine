import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import * as arena from '../src/sim/arena';import * as skills from '../src/engine/skills';import {SKILLS} from '../src/data/skills';import {Actor} from '../src/engine/actor';import {seedGlobalRandom} from '../src/sim/rng';
const [previous,current,output]=process.argv.slice(2);
const load=async(game:string)=>{const get=(file:string)=>import(pathToFileURL(path.join(game,file)).href);return {arena:await get('src/sim/arena.ts'),skills:await get('src/engine/skills.ts'),...await get('src/data/skills.ts'),...await get('src/engine/actor.ts'),...await get('src/sim/rng.ts')};};
const apis:any={original:{arena,skills,SKILLS,Actor,seedGlobalRandom},previous:await load(previous),current:await load(current)},keys=Object.keys(apis),configs:any={},results:any[]=[];
const channels=[
 {interval:.25,move:'normal',ramp:{per:.2,max:1}},
 {interval:.3,windup:0,move:'normal',trackAim:false,intervalJitter:[.5,1.5]},
 {interval:.5,move:'normal',maxHold:2,cooldownOnEnd:true,release:{pulses:false,requireFull:true,dmgRamp:{per:.5,max:2}}},
 {interval:.4,move:'normal',brim:{fillTime:2,autoRelease:true},release:{pulses:false}},
 {interval:.5,move:'normal',ramp:{per:.2,max:1},persist:{perHeldSec:2,maxDuration:4,fade:.25}},
 {interval:.25,move:'normal',costRamp:{per:.1,max:1},rampAoe:{per:-.1,max:0}},
];
for(const key of keys){
 const api=apis[key];api.arena.bootSimEngine();const restore=api.seedGlobalRandom(271000);let world:any;try{world=api.arena.makeSimWorld('magician',271000);}finally{restore();}
 world.devIgnoreSkillAttributes=true;
 const actors=Array.from({length:64},(_,i)=>{
  const actor=new api.Actor('Channel worker','player',{x:500,y:500});
  for(const [id,value]of Object.entries({life:1000,mana:1000,energyShield:0,lifeRegen:0,manaRegen:0,poise:0,castSpeed:1,brimFill:1,brimPower:1,effectDuration:1}))actor.sheet.setBase(id,value);
  const definition={...api.SKILLS.firebolt,id:'channel_benchmark_'+i%channels.length,manaCost:4,lifeCost:0,cooldown:2,castMode:'channel',useTime:0,channel:channels[i%channels.length]};
  actor.skills=[api.skills.makeSkillInstance(definition,1,0)];return actor;
 });
 world.actors=[world.player,...actors];configs[key]={world,actors};
}
const prepare=(key:string)=>{
 const {world,actors}=configs[key],restore=apis[key].seedGlobalRandom(271001);
 try{
  world.time=0;world.projectiles.length=0;world.flashes.length=0;world.pendingPersists.length=0;
  for(const actor of actors){actor.casting=null;actor.fillResources();actor.brims?.clear();actor.useLock=0;actor.cooldowns.clear();actor.cooldownTotals.clear();actor.gainEvents.length=0;
   assert(world.useSkill(actor,actor.skills[0],{x:900,y:500}));actor.casting.aiHold=1000;
  }
 }finally{restore();}
};
const run=(key:string,withActorTimers:boolean)=>{
 const {world,actors}=configs[key],restore=apis[key].seedGlobalRandom(271002);
 try{
  for(let frame=0;frame<128;frame++){
   world.time+=.025;
   for(const actor of actors){if(frame===127&&actor.casting)actor.casting.aiHold=0;if(withActorTimers)actor.updateTimers(.025);world.updateCasting(actor,.025);}
   world.updatePendingPersists(.025);
  }
  return {actors:actors.map((a:any)=>({mana:a.mana,life:a.life,recovery:a.useLock,cast:a.casting?{held:a.casting.held,time:a.casting.channelTime,pulse:a.casting.pulseTimer}:null,brims:[...(a.brims??[])].map(([id,b]:any)=>[id,b.fill]),cooldowns:[...a.cooldowns],events:a.gainEvents})),
   persists:world.pendingPersists.map((p:any)=>({timer:p.timer,remaining:p.remaining,power:p.powerMult})),projectiles:world.projectiles.map((p:any)=>({mult:p.mult,speed:p.speed})),flashes:world.flashes.map((f:any)=>({radius:f.radius,color:f.color,life:f.life}))};
 }finally{restore();}
};
for(const [name,timers]of [['admitted-channel-and-persistence',false],['actor-timers-channel-and-persistence',true]] as const){
 const samples:Record<string,number[]>=Object.fromEntries(keys.map(k=>[k,[]]));let expected='';
 for(let trial=-5;trial<25;trial++)for(let offset=0;offset<keys.length;offset++){
  const key=keys[((trial+keys.length*2)%keys.length+offset)%keys.length];prepare(key);
  const start=performance.now(),result=run(key,timers),elapsed=performance.now()-start,actual=JSON.stringify(result);
  if(!expected)expected=actual;else assert.equal(actual,expected,name+'/'+key);if(trial>=0)samples[key].push(elapsed);
 }
 const timing=Object.fromEntries(keys.map(k=>{const sorted=[...samples[k]].sort((a,b)=>a-b);return[k,{samplesMs:samples[k],medianMs:sorted[12],p95Ms:sorted[23]}];}));
 results.push({name,derivedSha256:createHash('sha256').update(expected).digest('hex'),...timing});console.log(name+': '+keys.map(k=>k+'='+timing[k].medianMs.toFixed(4)+'ms').join(', '));
}
fs.writeFileSync(output,JSON.stringify({scope:'64 real Actors across six authored-vocabulary channel configurations: ramped pulses, jittered locked aim, capped gather, brim auto-release, persistent pulses and escalating cost. Admitted by actual World.useSkill outside timing. Each receives 128 updates of .025 seconds through actual World.updateCasting and updatePendingPersists, with and without Actor.updateTimers. Actual payments, triggers, cue creation and Firebolt projectile delivery execute. Five warmups and 25 rotating samples; all derived outputs must match. Setup/equality excluded, result projection included equally. Desktop Node path measurement, not renderer, allocations/GC, whole frames, native engine or Steam Deck/mobile budgets.',node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,results},null,2)+'\n',{flag:'wx'});
