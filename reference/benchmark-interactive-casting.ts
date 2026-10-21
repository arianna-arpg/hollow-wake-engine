import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import * as arena from '../src/sim/arena';import * as skills from '../src/engine/skills';import {SKILLS} from '../src/data/skills';import {Actor} from '../src/engine/actor';import {seedGlobalRandom} from '../src/sim/rng';
const [previous,current,output]=process.argv.slice(2);
const load=async(game:string)=>{const get=(file:string)=>import(pathToFileURL(path.join(game,file)).href);return{arena:await get('src/sim/arena.ts'),skills:await get('src/engine/skills.ts'),...await get('src/data/skills.ts'),...await get('src/engine/actor.ts'),...await get('src/sim/rng.ts')};};
const apis:any={original:{arena,skills,SKILLS,Actor,seedGlobalRandom},previous:await load(previous),current:await load(current)},keys=Object.keys(apis),configs:any={},results:any[]=[];
for(const key of keys){
 const api=apis[key];api.arena.bootSimEngine();const restore=api.seedGlobalRandom(251000);let world:any,target:any;try{world=api.arena.makeSimWorld('magician',251000);target=world.createMonster('zombie',1,'enemy');}finally{restore();}
 world.devIgnoreSkillAttributes=true;world.walk=null;target.pos={x:650,y:500};target.untargetable=false;target.brain=undefined;
 const actors=Array.from({length:64},(_,i)=>{
  const actor=new api.Actor('Interactive worker','player',{x:500,y:500});
  for(const[id,value]of Object.entries({life:1000,mana:1000,energyShield:0,lifeRegen:0,manaRegen:0,poise:0}))actor.sheet.setBase(id,value);
  const definition={...api.SKILLS.firebolt,id:'interactive_benchmark_'+(i%2?'timing':'focus'),manaCost:6,lifeCost:2,cooldown:2,useTime:1,
   castMode:i%2?'perfect':'cast',targeting:i%2?undefined:{target:'enemy',castRange:400},concentration:i%2?undefined:{time:2,drainRate:1.25}};
  actor.skills=[api.skills.makeSkillInstance(definition,1,0)];return actor;
 });
 world.actors=[world.player,target,...actors];configs[key]={world,target,actors};
}
const prepare=(key:string)=>{
 const{world,target,actors}=configs[key],restore=apis[key].seedGlobalRandom(251001);
 try{world.time=0;world.projectiles.length=0;world.flashes.length=0;target.untargetable=false;
  for(const actor of actors){actor.casting=null;actor.fillResources();actor.useLock=0;actor.cooldowns.clear();actor.cooldownTotals.clear();actor.gainEvents.length=0;assert(world.useSkill(actor,actor.skills[0],target.pos));}
 }finally{restore();}
};
const run=(key:string,timers:boolean)=>{
 const{world,target,actors}=configs[key],restore=apis[key].seedGlobalRandom(251002);let progress=0;
 try{for(let frame=0;frame<128;frame++){
  world.time+=.025;target.untargetable=frame>=16&&frame<24;
  for(const actor of actors){if(timers)actor.updateTimers(.025);if(actor.casting?.mode==='perfect'&&!actor.casting.pressUsed&&actor.casting.elapsed/actor.casting.total>=.75)world.castPress(actor);world.updateCasting(actor,.025);progress+=actor.casting?.elapsed??0;}
 }
 return{progress,actors:actors.map((a:any)=>({mana:a.mana,life:a.life,recovery:a.useLock,cast:a.casting?{mode:a.casting.mode,elapsed:a.casting.elapsed,focusBroken:a.casting.focusBroken,pressUsed:a.casting.pressUsed}:null,cooldowns:[...a.cooldowns]})),projectiles:world.projectiles.map((p:any)=>({mult:p.mult,speed:p.speed})),flashes:world.flashes.map((f:any)=>({radius:f.radius,color:f.color,life:f.life}))};
 }finally{restore();}
};
for(const[name,timers]of[['interactive-cast-phase',false],['actor-timers-and-interactive-cast',true]]as const){
 const samples:Record<string,number[]>=Object.fromEntries(keys.map(k=>[k,[]]));let expected='';
 for(let trial=-5;trial<25;trial++)for(let offset=0;offset<keys.length;offset++){
  const key=keys[((trial+keys.length*2)%keys.length+offset)%keys.length];prepare(key);const start=performance.now(),result=run(key,timers),elapsed=performance.now()-start,actual=JSON.stringify(result);
  if(!expected)expected=actual;else assert.equal(actual,expected,name+'/'+key);if(trial>=0)samples[key].push(elapsed);
 }
 const timing=Object.fromEntries(keys.map(k=>{const sorted=[...samples[k]].sort((a,b)=>a-b);return[k,{samplesMs:samples[k],medianMs:sorted[12],p95Ms:sorted[23]}];}));results.push({name,derivedSha256:createHash('sha256').update(expected).digest('hex'),...timing});console.log(name+': '+keys.map(k=>k+'='+timing[k].medianMs.toFixed(4)+'ms').join(', '));
}
fs.writeFileSync(output,JSON.stringify({scope:'Installed-package comparison: 64 real Actors, half concentration and half perfect timing. Actual World.useSkill admission outside timing; 128 updates of .025 seconds through World.updateCasting, with optional Actor.updateTimers. Quarry availability breaks/refinds focus; explicit timing presses, native payment, cues, triggers and projectiles run. Five warmups and 25 rotating samples. Full derived output equality outside timing; projection and progress checksum included equally. No allocation/GC, renderer, whole-frame or device claim.',node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,results},null,2)+'\n',{flag:'wx'});
