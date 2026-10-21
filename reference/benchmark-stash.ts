import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {bootSimEngine} from '../src/sim/arena';import * as original from '../src/engine/stash';
import type {StashDef,StashEntry,StashState} from '../src/engine/stash';import type {ItemInstance} from '../src/engine/items';
const [root,previousGame,currentGame,output]=process.argv.slice(2);bootSimEngine();
const load=async(game:string)=>{const arena=await import(pathToFileURL(path.join(game,'src/sim/arena.ts')).href);arena.bootSimEngine();return import(pathToFileURL(path.join(game,'src/engine/stash.ts')).href);};
const previous=await load(previousGame),current=await load(currentGame),implementations={original,inventoryAdapter:previous,storageAdapter:current};
const body=(uid:number):ItemInstance=>({uid,baseId:'relic_charm',name:'Storage benchmark',ilvl:1,tier:1,rarity:'magic',baseRoll:.5,implicitRolls:[.25],affixes:[],sockets:[null],x:17,y:18});
const def:StashDef={id:'benchmark',board:{w:6,h:4},initialPages:1,maxPages:8,pageCostBase:40,accepts:()=>true};
type Profile={name:string;entries:StashEntry[];state:StashState;mode:'restore'|'fit'|'plan';operations:number};
const profiles:Profile[]=[];
for(const [items,pages] of [[0,1],[24,1],[192,8],[200,8]]){
 const entries=Array.from({length:items},(_,i)=>({key:'item:'+i,item:body(920000+i)})),cells:StashState['cells']={};
 for(let i=0;i<Math.min(items,pages*24);i++)cells[entries[i].key]={page:Math.floor(i/24),x:i%6,y:Math.floor(i%24/6)};
 const state={pages,invested:0,cells};
 profiles.push({name:items+'-items-legal',entries,state,mode:'restore',operations:4});
 if(items)profiles.push({name:items+'-items-recovery',entries,state:{...state,cells:{}},mode:'restore',operations:4});
 if(items===24||items===192){profiles.push({name:items+'-items-full-fit',entries,state,mode:'fit',operations:32});profiles.push({name:items+'-items-exchange',entries,state,mode:'plan',operations:32});}
}
const probe=body(999999),keys=Object.keys(implementations) as (keyof typeof implementations)[];
const checksum=(s:StashState|undefined)=>s?Object.entries(s.cells).reduce((n,[key,c])=>n+key.length+c.page*101+c.x*11+c.y*17,0)+s.pages+s.invested:0;
function batch(implementation:typeof original,p:Profile){let sum=0;
 for(let i=0;i<p.operations;i++){
  if(p.mode==='restore')sum+=checksum(implementation.restoreStash(def,p.entries,p.state));
  else if(p.mode==='fit'){const c=implementation.firstStashFit(def,p.entries,p.state,probe);sum+=c?1+c.page*101+c.x*11+c.y*17:0;}
  else{const entry=p.entries[i%p.entries.length],target=p.state.cells[p.entries[(i*13+7)%p.entries.length].key];sum+=checksum(implementation.planStashMove(def,p.entries,p.state,entry,target));}
 }return sum;
}
const results:any[]=[];
for(const profile of profiles){
 const before=JSON.stringify(profile),expected=batch(original,profile),samples=Object.fromEntries(keys.map(k=>[k,[] as number[]])) as Record<keyof typeof implementations,number[]>;
 for(let warm=0;warm<3;warm++)for(const key of keys)assert.equal(batch(implementations[key],profile),expected);
 for(let trial=0;trial<15;trial++)for(let offset=0;offset<keys.length;offset++){
  const key=keys[(trial+offset)%keys.length],start=performance.now(),value=batch(implementations[key],profile),elapsed=performance.now()-start;
  assert.equal(value,expected);samples[key].push(elapsed);
 }
 assert.equal(JSON.stringify(profile),before,'Benchmark mutated input');
 const timing=Object.fromEntries(keys.map(key=>{const sorted=[...samples[key]].sort((a,b)=>a-b);return[key,{samplesMs:samples[key],medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.ceil(sorted.length*.95)-1]}];}));
 results.push({profile:profile.name,mode:profile.mode,items:profile.entries.length,pages:profile.state.pages,operationsPerSample:profile.operations,checksum:expected,...timing});
 console.log(profile.name+': '+keys.map(key=>key+'='+timing[key].medianMs.toFixed(4)+'ms').join(', '));
}
fs.writeFileSync(output,JSON.stringify({scope:'Warm actual original, M11 inventory-only adapter and M12 storage adapter helper batches, including definition validation and placement projection. Checksums agree and input bodies/layouts remain unchanged; no total allocation, device or whole-frame claim.',node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,fixtureSha256:createHash('sha256').update(fs.readFileSync(path.join(root,'baseline/milestone-twelve/stash.json.gz'))).digest('hex'),results},null,2)+'\n');
