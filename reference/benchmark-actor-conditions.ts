// Real native calls in separately loaded original/installed game graphs.
// No copied condition implementation. Harness setup is explicitly synthetic.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import * as arena from '../src/sim/arena';import {Actor} from '../src/engine/actor';import {CONDITION_IDS} from '../src/engine/stats';
import * as skills from '../src/engine/skills';import {SKILLS} from '../src/data/skills';import {seedGlobalRandom} from '../src/sim/rng';

const [previous,current,output]=process.argv.slice(2),validationOnly=process.argv.includes('--validate-only');
const load=async(game:string)=>{const get=(file:string)=>import(pathToFileURL(path.join(game,file)).href);return {arena:await get('src/sim/arena.ts'),Actor:(await get('src/engine/actor.ts')).Actor,skills:await get('src/engine/skills.ts'),...(await get('src/data/skills.ts')),...(await get('src/sim/rng.ts'))};};
const apis:any={original:{arena,Actor,skills,SKILLS,seedGlobalRandom},previous:await load(previous),current:await load(current)};
const comparisonAt=process.argv.indexOf('--comparison-adapter');if(comparisonAt>=0)apis.comparison=await load(process.argv[comparisonAt+1]);
const keys=Object.keys(apis);for(const key of keys)apis[key].arena.bootSimEngine();
const gc=(globalThis as typeof globalThis&{gc?:()=>void}).gc;assert(gc,'Run with --expose-gc');
const collect=()=>{gc!();gc!();return process.memoryUsage().heapUsed;};
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const median=(values:number[])=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)];

function configure(a:any,populated:boolean){
  a.sheet.setBase('life',100);a.sheet.setBase('mana',100);a.sheet.setBase('energyShield',100);
  a.life=50;a.mana=50;a.es=0;a.poise=0;a.poiseBroken=false;a.esRecharging=false;
  a.plantFor=0;a.idleFor=1;a.strideDist=0;a.strideSpent=false;a.comboWatch=false;a.comboCondLeft=0;a.comboCondBits=0;a.since.fill(999);
  a.statuses=[];a.charges.clear();a.brims=undefined;a.reserves=undefined;a.derivedGauges=null;
  if(populated){
    a.sheet.setSource('condition-benchmark',[
      {stat:'strideReach',kind:'flat',value:100},
      {stat:'damage',kind:'increased',value:.4,when:'lowLife'},
      {stat:'damage',kind:'increased',value:.2,when:'lowMana'},
      {stat:'damage',kind:'increased',value:.3,when:'strided'},
      {stat:'damage',kind:'more',value:.1,when:'recentlyHit'},
      {stat:'damage',kind:'increased',value:.15,when:'comboVaried'},
      {stat:'attackSpeed',kind:'increased',value:.1,when:'moving'},
    ]);change(a,0);
  }
}
function change(a:any,phase:number){
  const low=phase===0;a.life=low?20:100;a.mana=low?10:100;a.es=low?20:100;
  a.poise=1;a.poiseBroken=!low;a.esRecharging=low;a.plantFor=low?2:0;a.idleFor=low?2:0;
  a.strideDist=low?120:0;a.comboWatch=true;a.comboCondLeft=low?1:0;a.comboCondBits=3;
  for(let i=0;i<a.since.length;i++)a.since[i]=low?1:999;
}
function observe(actors:any[],publications:number,events:number){
  return {actors:actors.length,publications,events,bodies:actors.map(a=>({
    mask:a.condMask,conditions:CONDITION_IDS.filter(id=>a.sheet.hasCondition(id)),confirmed:a.condSheet===a.sheet,
    life:a.life,mana:a.mana,es:a.es,ward:a.ward,damage:a.sheet.get('damage'),speed:a.sheet.get('attackSpeed'),
    stride:a.strideDist,comboLeft:a.comboCondLeft,since:[...a.since],queued:[...a.condRose],
  }))};
}
function setup(key:string,name:string){
  const api=apis[key],restore=api.seedGlobalRandom(371501);let publications=0,events=0;
  const instrument=(a:any)=>{const set=a.sheet.setConditions.bind(a.sheet);a.sheet.setConditions=(active:any)=>{publications++;set(active);};};
  if(name==='native-combat-and-proc'){
    const w=api.arena.makeSimWorld('warrior',0xc001),a=w.player;w.walk=null;
    a.pos=w.clampPos({x:w.arena.w/2,y:w.arena.h/2},a.radius);
    a.skills[0]=api.skills.makeSkillInstance(api.SKILLS.cleave,1,3);
    a.sheet.setSource('condition-benchmark',[{stat:'evasion',kind:'flat',value:-1e6},{stat:'critChance',kind:'flat',value:-1}]);
    const target=w.createMonster('zombie',3,'enemy');target.pos={x:a.pos.x+40,y:a.pos.y};target.brain=undefined;target.sheet.setBase('life',5);target.life=5;
    target.sheet.setSource('target',[{stat:'evasion',kind:'flat',value:-1e6},{stat:'armor',kind:'flat',value:-1e6}]);w.actors.push(target);
    instrument(a);const proc=w.rollOwnProcs.bind(w);w.rollOwnProcs=(owner:any,trigger:any,options:any)=>{if(owner===a&&trigger==='condition')events++;proc(owner,trigger,options);};
    let killed=false,recentAfterKill=false,expired=false,wardGained=0,frames=0;
    const step=(dt:number,count:number)=>{for(let i=0;i<count;i++){w.update(dt);frames++;}};
    return {restore,run:()=>{
      step(.05,2);a.mana=a.maxMana();assert(w.useSkill(a,a.skills[0],{...target.pos}));step(.05,24);
      killed=target.dead||target.life<=0;recentAfterKill=a.conditionHolds('recentlyKilled')&&a.conditionHolds('recentlyHit');
      step(.1,45);expired=!a.conditionHolds('recentlyKilled')&&!a.conditionHolds('recentlyHit');
      a.sheet.setSource('authored-ward',[{stat:'proc_desperate_ward',kind:'flat',value:1}]);a.ward=0;a.life=a.maxLife()*.1;step(.05,2);wardGained=a.ward;
    },receipt:()=>{assert(killed&&recentAfterKill&&expired&&wardGained>0);return {frames,time:w.time,killed,recentAfterKill,expired,wardGained,targetLife:target.life,...observe([a],publications,events)};}};
  }
  if(name==='quiet-world-condition-frames'){
    const world=api.arena.makeSimWorld('magician',371501),actors=[world.player];world.walk=null;world.actors=actors;world.player.pos={x:500,y:500};
    for(let i=1;i<16;i++){const a=world.createMonster('zombie',1,'enemy');a.brain=undefined;a.pos={x:700+i*40,y:500};actors.push(a);}
    for(const a of actors){configure(a,true);a.sheet.setSource('frame-resources',[{stat:'lifeRegen',kind:'override',value:0},{stat:'manaRegen',kind:'override',value:0}]);a.casting=null;instrument(a);a.refreshConditions();}
    return {restore,run:()=>{for(let i=0;i<128;i++)world.update(1/60);},receipt:()=>{assert.equal(world.actors.length,16);return {frames:128,time:world.time,...observe(actors,publications,events)};}};
  }
  const actors=Array.from({length:64},(_,i)=>new api.Actor('condition-'+i,'player',{x:0,y:0})),populated=name!=='unmodified-stable-samples',changing=name==='changing-condition-samples',samples=changing?16384:32768;
  for(const a of actors){configure(a,populated);instrument(a);a.refreshConditions();}
  return {restore,run:()=>{
    for(let i=0;i<samples;i++){
      const a=actors[i%64];if(changing)change(a,Math.floor(i/64)%2);
      a.refreshConditions();events+=a.condRose.length;a.condRose.length=0;
    }
  },receipt:()=>({samples,...observe(actors,publications,events)})};
}

const results:any[]=[];
for(const name of ['unmodified-stable-samples','configured-stable-samples','changing-condition-samples','quiet-world-condition-frames','native-combat-and-proc']){
  const samples:Record<string,number[]>=Object.fromEntries(keys.map(key=>[key,[]]));let expected='';
  for(let trial=validationOnly?0:-5;trial<(validationOnly?1:25);trial++)for(let offset=0;offset<keys.length;offset++){
    const key=keys[((trial+keys.length*2)%keys.length+offset)%keys.length],prepared=setup(key,name);
    try{
      collect();const start=performance.now();prepared.run();const elapsed=performance.now()-start;
      // Full receipt construction and comparison are outside the timed loop.
      const actual=JSON.stringify(prepared.receipt());if(!expected)expected=actual;else assert.equal(actual,expected,name+'/'+key);
      if(trial>=0)samples[key].push(elapsed);
    }finally{prepared.restore();}
  }
  const timing=Object.fromEntries(keys.map(key=>{const sorted=[...samples[key]].sort((a,b)=>a-b);return [key,{samplesMs:samples[key],medianMs:median(sorted),p95Ms:sorted[Math.floor(sorted.length*.95)]}];}));
  results.push({name,receipt:JSON.parse(expected),receiptSha256:digest(JSON.parse(expected)),...timing});
  console.log((validationOnly?'Validated ':'Measured ')+name+': '+keys.map(key=>key+'='+timing[key].medianMs.toFixed(4)+'ms').join(', '));
}

function memorySample(key:string,populated:boolean,count:number){
  const api=apis[key];let actors:any[]|null=null;const before=collect();
  actors=Array.from({length:count},(_,i)=>new api.Actor('retained-'+i,'player',{x:0,y:0}));const constructed=collect();
  for(const a of actors)configure(a,populated);const configured=collect();for(const a of actors)a.refreshConditions();const sampled=collect();
  const receiptSha256=digest(observe(actors,0,0));actors=null;
  return {before,constructed,configured,sampled,constructorBytes:constructed-before,configurationBytes:configured-constructed,samplingBytes:sampled-configured,totalRetainedBytes:sampled-before,receiptSha256};
}
const memory:any[]=[];
if(!validationOnly)for(const populated of [false,true]){
  const count=1024,samples:Record<string,any[]>=Object.fromEntries(keys.map(key=>[key,[]]));let expected='';
  for(let trial=0;trial<3;trial++)for(let offset=0;offset<keys.length;offset++){
    const key=keys[(trial+offset)%keys.length],sample=memorySample(key,populated,count);if(!expected)expected=sample.receiptSha256;else assert.equal(sample.receiptSha256,expected);samples[key].push(sample);
  }
  const summary=Object.fromEntries(keys.map(key=>[key,{samples:samples[key],medianRetainedBytesPerActor:median(samples[key].map(s=>s.totalRetainedBytes))/count,medianSamplingBytesPerActor:median(samples[key].map(s=>s.samplingBytes))/count}]));
  memory.push({name:populated?'configured-actors':'unmodified-actors',count,...summary});console.log('Retained heap '+(populated?'configured':'unmodified')+': '+keys.map(key=>key+'='+summary[key].medianRetainedBytesPerActor.toFixed(1)+' bytes/actor').join(', '));
}
fs.writeFileSync(output,JSON.stringify({validationOnly,comparisonIncluded:comparisonAt>=0,node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,
  scope:validationOnly?'Receipt validation only; timing is not performance evidence.':
  'Desktop Node comparison of real Actor.refreshConditions and World.update. Rotating controls, five warmups and 25 timed samples. Setup/forced GC/receipt construction excluded from timing; loops, condition publication instrumentation, synthetic state changes, event queue draining and native work included. Stable/changing cases have 64 actors with explicitly supplied pools/modifiers; quiet world has 16 actors and 128 native updates. Combat runs a real Cleave kill, recency expiry and the native authored ward proc sweep with explicit target vitals and direct proc grant. This does not measure rendering, physical input, full encounters or FPS. Retained heap uses 1024 actors and three rotating forced-GC samples; allocation volume, peak RSS, total GC cost and device performance are not measured.',results,memory},null,2)+'\n',{flag:'wx'});
