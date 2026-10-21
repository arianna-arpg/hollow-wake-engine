import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {bootSimEngine} from '../src/sim/arena';import * as R from '../src/engine/accountReliquary';import * as M from '../src/meta/reliquary';
import type {ItemInstance} from '../src/engine/items';import type {Account} from '../src/meta/account';import {setBagBoardSource} from '../src/engine/inventory';
const [root,previousGame,currentGame,output]=process.argv.slice(2);bootSimEngine();
async function load(game:string){const arena=await import(pathToFileURL(path.join(game,'src/sim/arena.ts')).href);arena.bootSimEngine();return {R:await import(pathToFileURL(path.join(game,'src/engine/accountReliquary.ts')).href),M:await import(pathToFileURL(path.join(game,'src/meta/reliquary.ts')).href),setBagBoardSource:(await import(pathToFileURL(path.join(game,'src/engine/inventory.ts')).href)).setBagBoardSource};}
const implementations={original:{R,M,setBagBoardSource},previousAdapter:await load(previousGame),custodyAdapter:await load(currentGame)},keys=Object.keys(implementations) as (keyof typeof implementations)[];
for(const key of keys)implementations[key].setBagBoardSource(()=>({w:4,h:3}));
const item=(i:number):ItemInstance=>({uid:i+1,baseId:'relic_charm',relicKey:'item:'+i,name:'Custody benchmark',ilvl:1,tier:1,rarity:'magic',baseRoll:.5,implicitRolls:[.1,.2],affixes:[],sockets:[],x:i%4,y:Math.floor(i/4)%3});
type Profile={name:string;count:number;operations:number;mode:'reserve'|'restore'|'migrate'|'bank'|'experience';state:M.AccountReliquary};
const profiles:Profile[]=[];
for(const count of [0,8,96,384]){
 const state=M.emptyReliquary();state.items=Array.from({length:count},(_,i)=>item(i));state.seated=state.items.slice(0,Math.min(8,count/4)).map(i=>i.relicKey!);state.carried=state.items.slice(8,16).map(i=>i.relicKey!);state.released=Array.from({length:count*2},(_,i)=>'released:'+i);state.stash.pages=8;
 for(const mode of ['reserve','restore','migrate','bank','experience'] as const)profiles.push({name:`${count}-items-${mode}`,count,operations:mode==='reserve'||mode==='experience'?128:mode==='bank'?4:2,mode,state});
}
function batch(key:keyof typeof implementations,p:Profile):number{
 const api=implementations[key];let sum=0;
 for(let repeat=0;repeat<p.operations;repeat++){
  if(p.mode==='reserve'){const entries=api.R.relicReserve({reliquary:p.state} as Account);sum+=entries.length+entries.reduce((n:number,e:{item:ItemInstance})=>n+e.item.uid,0);}
  else if(p.mode==='experience')sum+=api.R.reliquaryExperience(p.state.items,true);
  else if(p.mode==='restore'){const r=api.M.restoreReliquary(p.state);sum+=r.items.length+r.seated.length+r.carried.length+Object.keys(r.stash.cells).length;}
  else if(p.mode==='bank'){const a={reliquary:api.M.emptyReliquary()} as Account;for(const body of structuredClone(p.state.items))api.R.bankRelic(a,body,'benchmark');sum+=a.reliquary.items.length;}
  else{const a={reliquary:structuredClone(p.state)} as Account,carry={items:[] as ItemInstance[],equipped:{},containers:{reliquary:[] as ItemInstance[]}};api.R.migrateRelicCarry(a,carry,'benchmark',false);sum+=carry.items.length+carry.containers.reliquary.length+Object.keys(a.reliquary.stash.cells).length+a.reliquary.items.length;}
 }return sum;
}
const close=(a:number,b:number)=>assert(Math.abs(a-b)<=1e-12*Math.max(1,Math.abs(b)),`Custody checksum differs ${a} / ${b}`),results:any[]=[];
for(const profile of profiles){
 const before=JSON.stringify(profile),expected=batch('original',profile),samples=Object.fromEntries(keys.map(k=>[k,[] as number[]])) as Record<keyof typeof implementations,number[]>;
 for(let warm=0;warm<3;warm++)for(const key of keys)close(batch(key,profile),expected);
 for(let trial=0;trial<15;trial++)for(let offset=0;offset<keys.length;offset++){const key=keys[(trial+offset)%keys.length],start=performance.now(),sum=batch(key,profile);samples[key].push(performance.now()-start);close(sum,expected);}
 assert.equal(JSON.stringify(profile),before,'Custody benchmark mutated reusable input');
 const timing=Object.fromEntries(keys.map(key=>{const sorted=[...samples[key]].sort((a,b)=>a-b);return [key,{samplesMs:samples[key],medianMs:sorted[7],p95Ms:sorted[14]}];}));
 results.push({profile:profile.name,operationsPerSample:profile.operations,checksum:expected,...timing});console.log(profile.name+': '+keys.map(key=>key+'='+timing[key].medianMs.toFixed(4)+'ms').join(', '));
}
fs.writeFileSync(output,JSON.stringify({scope:'Original helpers, M13 game with original custody and SDK storage, and M14 SDK custody. Rotating orders, three warmup batches, 15 samples. Restore includes body cloning; migration includes cloning its mutable input. A 384-item reserve exceeds the authored 192-cell storage capacity and exercises recovery. Input bodies unchanged and checksums agree within 1e-12. No device, frame, GC or allocation claim.',node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,fixtureSha256:createHash('sha256').update(fs.readFileSync(path.join(root,'baseline/milestone-fourteen/relic-custody.json.gz'))).digest('hex'),results},null,2)+'\n');
