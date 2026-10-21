import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import * as arena from '../src/sim/arena';import * as skills from '../src/engine/skills';import {SKILLS} from '../src/data/skills';import {SUPPORTS} from '../src/data/supports';import {Actor} from '../src/engine/actor';import {seedGlobalRandom} from '../src/sim/rng';
const [previous,current,output]=process.argv.slice(2);
const load=async(game:string)=>{const get=(file:string)=>import(pathToFileURL(path.join(game,file)).href);return{arena:await get('src/sim/arena.ts'),skills:await get('src/engine/skills.ts'),...await get('src/data/skills.ts'),...await get('src/data/supports.ts'),...await get('src/engine/actor.ts'),...await get('src/sim/rng.ts')};};
const apis:any={original:{arena,skills,SKILLS,SUPPORTS,Actor,seedGlobalRandom},previous:await load(previous),current:await load(current)},keys=Object.keys(apis),configs:any={},results:any[]=[];
for(const key of keys){
 const api=apis[key];api.arena.bootSimEngine();const restore=api.seedGlobalRandom(261000);let world:any;try{world=api.arena.makeSimWorld('magician',261000);}finally{restore();}
 world.devIgnoreSkillAttributes=true;world.walk=null;
 const actors=Array.from({length:64},(_,i)=>{
  const actor=new api.Actor('Ammo worker','player',{x:500,y:500});
  for(const[id,value]of Object.entries({life:10000,mana:10000,energyShield:0,lifeRegen:0,manaRegen:0,poise:0}))actor.sheet.setBase(id,value);
  const kind=i%6;const spec=kind===0?{max:4}:kind===1?{max:4,recharge:.5}:kind===2?{max:4,magazine:{refill:1,drip:true}}:kind===3?{max:4,recharge:.5,still:{bleed:.5}}:undefined;
  const definition={...api.SKILLS.firebolt,id:'ammo_benchmark_'+i,manaCost:1,lifeCost:0,cooldown:kind===2||kind===4?.5:0,useTime:0,castMode:'cast',useCharges:spec};
  const inst=api.skills.makeSkillInstance(definition,1,3);if(kind>=4)inst.sockets[0]={def:api.SUPPORTS[kind===4?'deep_reserves':'pressure_seal'],level:1};actor.skills=[inst];return actor;
 });
 const rack=api.skills.makeSkillInstance({...api.SKILLS.re_energize,id:'ammo_benchmark_rack',effects:[{type:'restoreSkillCharges',scope:'all',amount:1}]},1,0);
 world.actors=[world.player,...actors];configs[key]={world,actors,rack};
}
const prepare=(key:string)=>{
 const{world,actors}=configs[key];world.time=0;world.projectiles.length=0;world.flashes.length=0;
 for(const actor of actors){actor.casting=null;actor.fillResources();actor.useLock=0;actor.cooldowns.clear();actor.cooldownTotals.clear();actor.gainEvents.length=0;actor.idleFor=100;actor.plantFor=100;actor.skillChargeState.clear();const bank=actor.skillChargeBank(actor.skills[0]);bank.count=2;bank.timer=.25;}
};
const run=(key:string,actions:boolean)=>{
 const{world,actors,rack}=configs[key],restore=apis[key].seedGlobalRandom(261002);let presses=0,progress=0;
 try{for(let frame=0;frame<128;frame++){
  world.time+=.025;
  for(const actor of actors){actor.idleFor=frame>=32&&frame<48?0:100;actor.updateTimers(.025);if(actions){if(frame%8===0&&world.useSkill(actor,actor.skills[0],{x:600,y:500}))presses++;if(frame%32===31)world.executeSkill(actor,rack,actor.pos,{noCooldown:true});world.updateCasting(actor,.025);}progress+=actor.skillChargeState.get(actor.skills[0].def.id).timer;}
 }
 return{progress,presses,actors:actors.map((a:any)=>({mana:a.mana,life:a.life,recovery:a.useLock,banks:[...a.skillChargeState],cooldowns:[...a.cooldowns],totals:[...a.cooldownTotals]})),projectiles:world.projectiles.map((p:any)=>({mult:p.mult,speed:p.speed})),flashes:world.flashes.map((f:any)=>({radius:f.radius,color:f.color,life:f.life}))};
 }finally{restore();}
};
for(const[name,actions]of[['actor-timers-with-ammunition',false],['ammunition-press-reload-and-timers',true]]as const){
 const samples:Record<string,number[]>=Object.fromEntries(keys.map(k=>[k,[]]));let expected='';
 for(let trial=-5;trial<25;trial++)for(let offset=0;offset<keys.length;offset++){
  const key=keys[((trial+keys.length*2)%keys.length+offset)%keys.length];prepare(key);const start=performance.now(),result=run(key,actions),elapsed=performance.now()-start,actual=JSON.stringify(result);
  if(!expected)expected=actual;else assert.equal(actual,expected,name+'/'+key);if(trial>=0)samples[key].push(elapsed);
 }
 const timing=Object.fromEntries(keys.map(k=>{const sorted=[...samples[k]].sort((a,b)=>a-b);return[k,{samplesMs:samples[k],medianMs:sorted[12],p95Ms:sorted[23]}];}));results.push({name,derivedSha256:createHash('sha256').update(expected).digest('hex'),...timing});console.log(name+': '+keys.map(k=>k+'='+timing[k].medianMs.toFixed(4)+'ms').join(', '));
}
fs.writeFileSync(output,JSON.stringify({scope:'Installed package. 64 actual Actors with native manual/trickle/drip/patient banks and Deep Reserves/Pressure Seal support grafts; 128 updates at .025 seconds; moving window. Second workload includes native World.useSkill, real payments/projectiles and active reload effects. Five warmups, 25 rotating samples. Setup/equality excluded, derived projection included equally. No allocation, renderer, whole-frame or device claim.',node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,results},null,2)+'\n',{flag:'wx'});
