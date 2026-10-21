import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import * as C from '../src/engine/containers';import * as P from '../src/engine/relicPower';
import {RELIQUARY} from '../src/data/containers';import {forgeItem} from '../src/engine/itemgen';import {autoPlace} from '../src/engine/inventory';import {mulberry32} from '../src/sim/rng';
import type {ItemInstance} from '../src/engine/items';import type {Modifier} from '../src/engine/stats';
const [root,previousGame,currentGame,output]=process.argv.slice(2);bootSimEngine();
async function load(game:string){const arena=await import(pathToFileURL(path.join(game,'src/sim/arena.ts')).href);arena.bootSimEngine();return {C:await import(pathToFileURL(path.join(game,'src/engine/containers.ts')).href),P:await import(pathToFileURL(path.join(game,'src/engine/relicPower.ts')).href),RELIQUARY:(await import(pathToFileURL(path.join(game,'src/data/containers.ts')).href)).RELIQUARY,forgeItem:(await import(pathToFileURL(path.join(game,'src/engine/itemgen.ts')).href)).forgeItem,autoPlace:(await import(pathToFileURL(path.join(game,'src/engine/inventory.ts')).href)).autoPlace,makeSimWorld:arena.makeSimWorld};}
const implementations={original:{C,P,RELIQUARY,forgeItem,autoPlace,makeSimWorld},previousAdapter:await load(previousGame),containerAdapter:await load(currentGame)},keys=Object.keys(implementations) as (keyof typeof implementations)[];
const body=(uid:number,x:number,y:number):ItemInstance=>({uid,baseId:'relic_charm',name:'Container benchmark',ilvl:1,tier:1,rarity:'magic',baseRoll:.5,implicitRolls:[],affixes:[],sockets:[],x,y});
const board=(w:number,h:number):C.ContainerBoard=>({w,h,open:Array(w*h).fill(true),cells:w*h});
const profiles:{name:string;operations:number;mode:'board'|'misfits'|'hood'|'amplification'|'empower'|'world';board?:C.ContainerBoard;items?:ItemInstance[];mods?:Modifier[];features?:Set<string>}[]=[
 {name:'ladder-one-cell',operations:128,mode:'board',features:new Set([RELIQUARY.ladder[0].feature])},
 {name:'ladder-full-case',operations:128,mode:'board',features:new Set(RELIQUARY.ladder.map(r=>r.feature))},
 {name:'empty-misfits',operations:64,mode:'misfits',board:board(5,5),items:[]},
];
for(const [w,h] of [[5,5],[12,12]]){
 const items=Array.from({length:w*h},(_,i)=>body(i+1,i%w,Math.floor(i/w))),b=board(w,h);
 for(const mode of ['misfits','hood','amplification'] as const)profiles.push({name:`${items.length}-pieces-${mode}`,operations:mode==='misfits'?64:32,mode,board:b,items});
}
for(const count of [1,8,32])profiles.push({name:`${count}-lines-empower`,operations:256,mode:'empower',mods:Array.from({length:count},(_,i)=>({stat:['life','castSpeed','damage','seatPower_outward'][i%4],kind:i%2?'increased':'flat',value:(i+1)/100}))});
profiles.push({name:'three-relic-character-rebuild',operations:4,mode:'world'});
const raw:Modifier[]=[{stat:'seatPower_outward',kind:'flat',value:.1},{stat:'seatPower_solitude',kind:'flat',value:.05},{stat:'seatPower_communion',kind:'flat',value:.03},{stat:'damage',kind:'increased',value:.4}];
const worlds=new Map<keyof typeof implementations,ReturnType<typeof makeSimWorld>>(),worldBodies=new Map<string,string>();
for(const key of keys){const api=implementations[key],w=api.makeSimWorld('warrior',93231),rng=mulberry32(93231);for(const r of api.RELIQUARY.ladder)w.account.features.add(r.feature);w.account.features.add('oracle_stone');w.account.ledger.oracle_rescued=1;w.loadZone('lastlight');w.player.pos={...w.stationAnchor('oracle').pos};w.lastCombatAt=-999;
 for(const [uniqueId,x,y] of [['reliquary_crown',1,1],['hermits_bead',3,1],['tally_idol',0,1]] as const){const item=api.forgeItem({uniqueId,ilvl:20,quality:1,rng})!;api.autoPlace(w.meta.items,item);w.containerPlace(w.localSeat,'reliquary',item.uid,x,y);}
 assert.equal(w.meta.containers.reliquary.length,3);w.account.reliquary.rank=25;w.recalcPlayer();worlds.set(key,w);worldBodies.set(key,JSON.stringify(w.account.reliquary.items));
}
function batch(key:keyof typeof implementations,p:typeof profiles[number]){const api=implementations[key];let sum=0;
 for(let i=0;i<p.operations;i++){
  if(p.mode==='board'){const b=api.C.containerBoardFor(api.RELIQUARY,p.features)!;sum+=b.cells+b.w+b.h;}
  else if(p.mode==='misfits')sum+=api.C.containerMisfits(p.board,p.items).reduce((n:number,it:ItemInstance)=>n+it.uid,0);
  else if(p.mode==='hood')for(const [it,n] of api.C.seatNeighbourhood(p.board,p.items))sum+=it.uid+n.empty+n.pieces.reduce((v:number,o:ItemInstance)=>v+o.uid,0);
  else if(p.mode==='amplification')for(const [it,n] of api.C.seatAmplification(p.board,p.items,()=>raw))sum+=it.uid*n;
  else if(p.mode==='empower')for(const m of api.P.empowerRelicMods(p.mods,2,1.5))sum+=m.value;
  else{const w=worlds.get(key)!;w.recalcPlayer();sum+=w.player.maxLife()+w.player.sheet.get('armor')+w.player.sheet.get('damage');}
 }return sum;
}
const close=(actual:number,expected:number)=>assert(Math.abs(actual-expected)<=1e-12*Math.max(1,Math.abs(expected)),`Benchmark checksum differs: ${actual} / ${expected}`),results:any[]=[];
for(const profile of profiles){
 const before=JSON.stringify(profile),expected=batch('original',profile),samples=Object.fromEntries(keys.map(k=>[k,[] as number[]])) as Record<keyof typeof implementations,number[]>;
 for(let warm=0;warm<3;warm++)for(const key of keys)close(batch(key,profile),expected);
 for(let trial=0;trial<15;trial++)for(let offset=0;offset<keys.length;offset++){const key=keys[(trial+offset)%keys.length],start=performance.now(),value=batch(key,profile),elapsed=performance.now()-start;close(value,expected);samples[key].push(elapsed);}
 assert.equal(JSON.stringify(profile),before);for(const key of keys)assert.equal(JSON.stringify(worlds.get(key)!.account.reliquary.items),worldBodies.get(key),'Character rebuild changed item bodies');
 const timing=Object.fromEntries(keys.map(key=>{const sorted=[...samples[key]].sort((a,b)=>a-b);return [key,{samplesMs:samples[key],medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.ceil(sorted.length*.95)-1]}];}));
 results.push({profile:profile.name,operationsPerSample:profile.operations,checksum:expected,...timing});console.log(profile.name+': '+keys.map(key=>key+'='+timing[key].medianMs.toFixed(4)+'ms').join(', '));
}
fs.writeFileSync(output,JSON.stringify({scope:'Warm original, M12 adapter with original container/seat helpers, and M13 container adapter. Includes live content freshness checks and per-operation validation. Character row measures actual headless recalcPlayer, not a frame or rendered game. Checksums agree within 1e-12 and input item bodies stay unchanged. No device, GC or total-allocation claim.',node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,fixtureSha256:createHash('sha256').update(fs.readFileSync(path.join(root,'baseline/milestone-thirteen/containers.json.gz'))).digest('hex'),results},null,2)+'\n');
