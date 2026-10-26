// Focused native entry points; setup and receipt construction are outside timing.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
import * as arena from '../src/sim/arena';import {Actor} from '../src/engine/actor';import {StatSheet} from '../src/engine/stats';import * as procs from '../src/data/procs';import type {ProcEffect,ProcDef} from '../src/data/procs';import {seedGlobalRandom} from '../src/sim/rng';
const [previous,current,output]=process.argv.slice(2),validationOnly=process.argv.includes('--validate-only');
type Api={arena:typeof arena;Actor:typeof Actor;StatSheet:typeof StatSheet;procs:typeof procs;seedGlobalRandom:typeof seedGlobalRandom};
const load=async(game:string):Promise<Api>=>{const get=(file:string)=>import(pathToFileURL(path.join(game,'src',file+'.ts')).href);return {arena:await get('sim/arena'),Actor:(await get('engine/actor')).Actor,StatSheet:(await get('engine/stats')).StatSheet,procs:await get('data/procs'),seedGlobalRandom:(await get('sim/rng')).seedGlobalRandom};};
const apis:Record<string,Api>={original:{arena,Actor,StatSheet,procs,seedGlobalRandom},previous:await load(previous),current:await load(current)},keys=Object.keys(apis);
for(const api of Object.values(apis)){api.arena.bootSimEngine();assert.equal(api.procs.PROC_LIST.length,147);}
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),gc=(globalThis as typeof globalThis&{gc?:()=>void}).gc;assert(gc,'Run with --expose-gc');
const collect=()=>{gc!();gc!();},median=(values:number[])=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)];
function setup(api:Api,name:string){
 if(name==='authored-fold'){
  const inputs:ProcEffect[]=[...api.procs.PROC_LIST.map(p=>p.effect),{type:'birth',birth:{type:'birth',monsterId:'boundary-only',count:[1,2],cap:3}}],powers=[1,.5,2,0],rounds=128,results:ProcEffect[]=new Array(inputs.length*powers.length),inputHash=digest(inputs);
  return {restore:()=>{},run:()=>{for(let round=0;round<rounds;round++)for(let i=0;i<inputs.length;i++)for(let j=0;j<powers.length;j++)results[i*powers.length+j]=api.procs.scaleProcEffect(inputs[i],powers[j]);},receipt:()=>{
   assert.equal(digest(inputs),inputHash);const observations=results.map((result,i)=>({result,keys:Object.keys(result),sameInput:result===inputs[Math.floor(i/powers.length)]}));
   return {definitions:inputs.length,powers,rounds,calls:rounds*inputs.length*powers.length,inputSha256:inputHash,outputSha256:digest(observations),sameInputResults:observations.filter(r=>r.sameInput).length};
  }};
 }
 const restore=api.seedGlobalRandom(0xbc39),w=api.arena.makeSimWorld('warrior',0xbc39),actors=[w.player],calls=32768;
 for(let i=1;i<64;i++)actors.push(new api.Actor('ward-'+i,'player',{x:700+i*10,y:700}));
 const proc:ProcDef={id:'__m39_benchmark_ward',name:'Ward benchmark',color:'#abcdef',trigger:'hit',effect:{type:'ward',flat:10,pctMaxLife:.1}};
 for(const [i,a]of actors.entries()){a.sheet=new api.StatSheet();a.sheet.setBase('life',1000);a.life=500;a.ward=i;a.dead=name==='resource-gain'&&i%8===0;a.procCuePulses=[];a.sheet.setBase('wardGain',1.25);a.sheet.setBase(api.procs.procPowerStat(proc.id),i%2?2:1);}
 w.actors=actors;let returned=0,draws=0;const random=Math.random;Math.random=()=>{draws++;return random();};
 return {restore,run:()=>{for(let i=0;i<calls;i++){const a=actors[i%64];if(name==='resource-gain')returned+=a.gainWard(i%5-1);else{if(name==='ward-live-rate')a.sheet.setBase('wardGain',Math.floor(i/64)%4/2);w['executeProc'](proc,a,null,null,0);}}},receipt:()=>{
  assert.equal(draws,0);assert(actors.some(a=>a.ward>100));return {calls,returned,draws,actors:actors.map(a=>({ward:a.ward,dead:a.dead,cues:a.procCuePulses}))};
 }};
}
const results:unknown[]=[];
for(const name of ['authored-fold','resource-gain','ward-dispatch','ward-live-rate']){
 const samples:Record<string,number[]>=Object.fromEntries(keys.map(key=>[key,[]]));let expected='';
 for(let trial=validationOnly?0:-4;trial<(validationOnly?1:15);trial++)for(let offset=0;offset<keys.length;offset++){
  const key=keys[((trial+keys.length*2)%keys.length+offset)%keys.length],prepared=setup(apis[key],name);
  try{collect();const start=performance.now();prepared.run();const elapsed=performance.now()-start,actual=JSON.stringify(prepared.receipt());if(!expected)expected=actual;else assert.equal(actual,expected,name+'/'+key);if(trial>=0)samples[key].push(elapsed);}finally{prepared.restore();}
 }
 const timing=Object.fromEntries(keys.map(key=>{const sorted=[...samples[key]].sort((a,b)=>a-b);return[key,{samplesMs:samples[key],medianMs:median(sorted),p95Ms:sorted[Math.floor(sorted.length*.95)]}];}));
 results.push({name,receipt:JSON.parse(expected),receiptSha256:digest(JSON.parse(expected)),...timing});console.log((validationOnly?'Validated ':'Measured ')+name+': '+keys.map(key=>key+'='+timing[key].medianMs.toFixed(4)+'ms').join(', '));
}
fs.writeFileSync(output,JSON.stringify({validationOnly,node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,results,
 scope:validationOnly?'Receipt validation only; timings are not performance evidence.':'Desktop Node comparison of the pinned original, retained v0.33 adapter and v0.34 candidate. Four warmups and 15 rotating samples per graph. Authored folding makes 75,776 calls per sample over 147 authored payloads plus birth and four powers. Other samples make 32,768 native calls across 64 actors. Resource gains mix positive, nonpositive and dead requests. Ward dispatch includes native power queries, maximum life, resource gain, cues and rider dispatch; live-rate samples also include changing stat writes. Actor/world setup, forced GC and complete receipt construction are excluded. Fold result storage, gain accumulation and ward RNG observation are included. No renderer, device, FPS, allocation-volume or peak-memory claim.'},null,2)+'\n',{flag:'wx'});
