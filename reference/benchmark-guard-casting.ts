import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import * as arena from '../src/sim/arena';import * as skills from '../src/engine/skills';import {SKILLS} from '../src/data/skills';import {SUPPORTS} from '../src/data/supports';import {Actor} from '../src/engine/actor';import {seedGlobalRandom} from '../src/sim/rng';
const [previous,current,output]=process.argv.slice(2);
const load=async(game:string)=>{const get=(file:string)=>import(pathToFileURL(path.join(game,file)).href);return {arena:await get('src/sim/arena.ts'),skills:await get('src/engine/skills.ts'),...await get('src/data/skills.ts'),...await get('src/data/supports.ts'),...await get('src/engine/actor.ts'),...await get('src/sim/rng.ts')};};
const apis:any={original:{arena,skills,SKILLS,SUPPORTS,Actor,seedGlobalRandom},previous:await load(previous),current:await load(current)},keys=Object.keys(apis),configs:any={},results:any[]=[];
const guards=[['shield_up'],['spiked_bulwark','answering_wall'],['defiant_bulwark'],['riposte'],['ice_shield'],['marching_bulwark','hollow_answer']];
for(const key of keys){
 const api=apis[key];api.arena.bootSimEngine();const restore=api.seedGlobalRandom(281000);let world:any;try{world=api.arena.makeSimWorld('guardian',281000);}finally{restore();}
 world.devIgnoreSkillAttributes=true;world.walk=null;
 const actors=Array.from({length:64},(_,i)=>{
  const actor=new api.Actor('Guard worker','player',{x:500,y:500});
  for(const [id,value]of Object.entries({life:1000,mana:1000,energyShield:0,lifeRegen:0,manaRegen:0,poise:0,guardStrength:1,bashFloor:1,bashArmTime:1,bashPower:1,critChance:0}))actor.sheet.setBase(id,value);
  const [id,support]=guards[i%guards.length],inst=api.skills.makeSkillInstance(api.SKILLS[id],1,1);
  if(support)inst.sockets[0]={def:api.SUPPORTS[support],level:1};actor.skills=[inst];return actor;
 });
 const target=new api.Actor('Guard target','enemy',{x:540,y:500});
 for(const[id,value]of Object.entries({life:1e9,armor:0,evasion:0,blockChance:0,poise:0,energyShield:0,lifeRegen:0}))target.sheet.setBase(id,value);
 target.tier=world.player.tier;target.fillResources();world.actors=[world.player,...actors,target];configs[key]={world,actors,target};
}
const prepare=(key:string)=>{
 const {world,actors,target}=configs[key],restore=apis[key].seedGlobalRandom(281001);
 try{
  world.time=0;world.flashes.length=0;world.projectiles.length=0;world.guardArts.clearAll();target.fillResources();target.dead=false;target.statuses=[];target.push=undefined;
  for(const actor of actors){actor.casting=null;actor.fillResources();actor.useLock=0;actor.cooldowns.clear();actor.cooldownTotals.clear();actor.gainEvents.length=0;actor.facing=0;
   assert(world.useSkill(actor,actor.skills[0],{x:540,y:500}));assert.equal(actor.casting?.mode,'guard');actor.casting.aiHold=1000;
   if(actor.skills[0].def.id==='marching_bulwark')actor.casting.shield=actor.casting.maxShield*.3;
  }
 }finally{restore();}
};
const run=(key:string,withActorTimers:boolean)=>{
 const {world,actors,target}=configs[key],restore=apis[key].seedGlobalRandom(281002);
 try{
  for(let frame=0;frame<128;frame++){
   world.time+=.025;
   for(const actor of actors){if(frame===127&&actor.casting)actor.casting.aiHold=0;if(withActorTimers)actor.updateTimers(.025);world.updateCasting(actor,.025);}
  }
  return {actors:actors.map((a:any)=>({mana:a.mana,life:a.life,recovery:a.useLock,cast:a.casting?{held:a.casting.held,time:a.casting.channelTime,pulse:a.casting.guardPulseT,line:a.casting.bashAt}:null,cooldowns:[...a.cooldowns],events:a.gainEvents})),
   target:{life:target.life,statuses:target.statuses.map((s:any)=>({id:s.id,remaining:s.remaining}))},flashes:world.flashes.map((f:any)=>({radius:f.radius,color:f.color,life:f.life}))};
 }finally{restore();}
};
for(const[name,timers]of [['admitted-guard-lifecycle',false],['actor-timers-and-guard-lifecycle',true]] as const){
 const samples:Record<string,number[]>=Object.fromEntries(keys.map(k=>[k,[]]));let expected='';
 for(let trial=-5;trial<25;trial++)for(let offset=0;offset<keys.length;offset++){
  const key=keys[((trial+keys.length*2)%keys.length+offset)%keys.length];prepare(key);
  const start=performance.now(),result=run(key,timers),elapsed=performance.now()-start,actual=JSON.stringify(result);
  if(!expected)expected=actual;else assert.equal(actual,expected,name+'/'+key);if(trial>=0)samples[key].push(elapsed);
 }
 const timing=Object.fromEntries(keys.map(k=>{const sorted=[...samples[k]].sort((a,b)=>a-b);return[k,{samplesMs:samples[k],medianMs:sorted[12],p95Ms:sorted[23]}];}));
 results.push({name,derivedSha256:createHash('sha256').update(expected).digest('hex'),...timing});console.log(name+': '+keys.map(k=>k+'='+timing[k].medianMs.toFixed(4)+'ms').join(', '));
}
fs.writeFileSync(output,JSON.stringify({scope:'64 real Actors across six native guards: Shield Up, taught Spiked Bulwark, Defiant Bulwark, timed Riposte, Ice Shield and inverted Marching Bulwark. Actual World.useSkill admission occurs outside timing. Each receives 128 updates of .025 seconds through World.updateCasting, with and without Actor.updateTimers. Native component taunts and release bashes execute against a living target. Five warmups and 25 rotating samples; all derived outputs must match. Setup/equality excluded, result projection included equally. Desktop Node path measurement, not renderer, allocations/GC, whole frames, native engine or Steam Deck/mobile budgets.',node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,results},null,2)+'\n',{flag:'wx'});
