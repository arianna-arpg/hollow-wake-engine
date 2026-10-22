import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import * as arena from '../src/sim/arena';import * as skills from '../src/engine/skills';import {SKILLS} from '../src/data/skills';import {SUPPORTS} from '../src/data/supports';import {Actor} from '../src/engine/actor';import {seedGlobalRandom} from '../src/sim/rng';
const [previous,current,output]=process.argv.slice(2);
const load=async(game:string)=>{const get=(file:string)=>import(pathToFileURL(path.join(game,file)).href);return {arena:await get('src/sim/arena.ts'),skills:await get('src/engine/skills.ts'),...await get('src/data/skills.ts'),...await get('src/data/supports.ts'),...await get('src/engine/actor.ts'),...await get('src/sim/rng.ts')};};
const apis:any={original:{arena,skills,SKILLS,SUPPORTS,Actor,seedGlobalRandom},previous:await load(previous),current:await load(current)},keys=Object.keys(apis),configs:any={},results:any[]=[];
for(const key of keys){
 const api=apis[key];api.arena.bootSimEngine();const restore=api.seedGlobalRandom(291000);let world:any;try{world=api.arena.makeSimWorld('warrior',291000);}finally{restore();}
 const actors=Array.from({length:32},(_,i)=>{
  const actor=new api.Actor('Payment worker','player',{x:500,y:500});
  for(const[id,value]of Object.entries({life:1000,mana:500,energyShield:100,lifeRegen:8,manaRegen:4,lifeRegenPct:0,manaRegenPct:0,esRechargeRate:0,esToMana:i%4===1?.5:0,poise:0,healTaken:1,attackSpeed:1,costWard_mana:.2,costWard_life:.2,costWardCap:.1,costWardDuration:2}))actor.sheet.setBase(id,value);
  const inst=api.skills.makeSkillInstance(api.SKILLS[i%4===3?'sanguine_burst':'convocation'],1,0);
  const mana=api.skills.makeSkillInstance(api.SKILLS.overclock,1,1),life=api.skills.makeSkillInstance(api.SKILLS.blood_mortgage,1,1);
  if(i%4===3){mana.sockets[0]={def:api.SUPPORTS.controlled_burn,level:1};life.sockets[0]={def:api.SUPPORTS.controlled_burn,level:1};}
  actor.skills=[inst];return {actor,inst,mana,life};
 });configs[key]={world,actors};
}
function prepare(key:string,timers:boolean){
 const {world,actors}=configs[key];world.flashes.length=0;
 for(const row of actors){const a=row.actor;a.overdrive={};a.reservedMana=0;a.reservedLife=0;a.fillResources();a.dead=false;a.downed=false;a.gainEvents.length=0;a.absorb=0;a.absorbTimer=0;
  if(timers){a.overdrive.mana={inst:row.mana,debt:0,idle:0};a.overdrive.life={inst:row.life,debt:0,idle:0};a.mana=10;a.life=30;}
  row.spent=0;a.onLifeSpent=(n:number)=>{row.spent+=n;};row.admitted=0;row.refused=0;
 }
}
function run(key:string,timers:boolean){
 const {world,actors}=configs[key];
 for(let frame=0;frame<96;frame++)for(const[rowIndex,row]of actors.entries()){
  const a=row.actor;
  if(!timers){a.mana=rowIndex%4===1?0:500;a.es=100;a.life=1000;}
  const cost=a.skillCost(row.inst);
  if(a.canAfford(cost)){world.paySkillCost(a,row.inst,cost);row.admitted++;}else row.refused++;
  if(timers)a.updateTimers(.05);
 }
 return {actors:actors.map((r:any)=>({mana:r.actor.mana,life:r.actor.life,es:r.actor.es,reservedMana:r.actor.reservedMana,reservedLife:r.actor.reservedLife,
  manaLoan:r.actor.overdrive.mana?{debt:r.actor.overdrive.mana.debt,idle:r.actor.overdrive.mana.idle}:null,
  lifeLoan:r.actor.overdrive.life?{debt:r.actor.overdrive.life.debt,idle:r.actor.overdrive.life.idle}:null,
  ward:r.actor.absorb,wardTimer:r.actor.absorbTimer,spent:r.spent,admitted:r.admitted,refused:r.refused})),flashes:world.flashes.length};
}
for(const[name,timers]of [['priced-pool-and-shield-payments',false],['priced-payments-wards-and-actor-timers',true]] as const){
 const samples:Record<string,number[]>=Object.fromEntries(keys.map(k=>[k,[]]));let expected='';
 for(let trial=-5;trial<25;trial++)for(let offset=0;offset<keys.length;offset++){
  const key=keys[((trial+keys.length*2)%keys.length+offset)%keys.length];prepare(key,timers);
  const start=performance.now(),result=run(key,timers),elapsed=performance.now()-start,actual=JSON.stringify(result);
  if(!expected)expected=actual;else assert.equal(actual,expected,name+'/'+key);if(trial>=0)samples[key].push(elapsed);
 }
 const timing=Object.fromEntries(keys.map(k=>{const sorted=[...samples[k]].sort((a,b)=>a-b);return[k,{samplesMs:samples[k],medianMs:sorted[12],p95Ms:sorted[23]}];}));
 const receipt=JSON.parse(expected);assert(receipt.actors.every((r:any)=>r.admitted>0));assert(receipt.flashes>0);
 assert(receipt.actors.some((r:any)=>r.es<100),'Shield substitution must execute');
 assert(receipt.actors.some((r:any)=>r.spent>0),'Actual blood spending must execute');
 if(timers){assert(receipt.actors.some((r:any)=>r.refused>0));assert(receipt.actors.some((r:any)=>r.manaLoan.debt>0));assert(receipt.actors.some((r:any)=>r.lifeLoan.debt>0));}
 results.push({name,derivedSha256:createHash('sha256').update(expected).digest('hex'),receipt,...timing});console.log(name+': '+keys.map(k=>k+'='+timing[k].medianMs.toFixed(4)+'ms').join(', '));
}
fs.writeFileSync(output,JSON.stringify({scope:'32 real Actors, 96 operations each. Every operation prices a real Convocation or Sanguine Burst, checks Actor affordability and invokes World.paySkillCost including cost wards and actual blood-spent callbacks. Pool/shield course resets live pools inside timing. Timer course injects explicit native loan records, including Controlled Burn, and advances complete Actor timers by .05 seconds per operation; aura admission is outside this workload and covered separately. Five warmups and 25 rotating samples; derived results must match across original, v0.24 and candidate. Setup/equality excluded, result projection included equally. Desktop Node path timings, not renderer, allocation/GC, whole frames, engine packages or device acceptance.',node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,results},null,2)+'\n',{flag:'wx'});
