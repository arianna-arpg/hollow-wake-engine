import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';import {pathToFileURL} from 'node:url';
import {bootSimEngine} from '../src/sim/arena';import * as original from '../src/engine/inventory';import type {ItemInstance} from '../src/engine/items';
bootSimEngine();const [sdk,game,out]=process.argv.slice(2);
(await import(pathToFileURL(path.join(game,'src/sim/arena.ts')).href)).bootSimEngine();
const adapter=await import(pathToFileURL(path.join(game,'src/engine/inventory.ts')).href) as typeof original;
const bytes=fs.readFileSync(path.join(sdk,'baseline/milestone-three/inventory.json')),fixture=JSON.parse(bytes.toString());
const samples=Object.values(fixture.scenarios[0].items) as {w:number;h:number;data:ItemInstance}[];
const small=samples.find(i=>i.w===1&&i.h===1)!.data;
const candidates=[[1,1],[1,2],[2,1],[2,2],[2,3]].map(([w,h])=>samples.find(i=>i.w===w&&i.h===h)!.data);
const profiles:{name:string;board:original.BoardDims;bag:ItemInstance[]}[]=[];
for(const count of [0,72,143,144])profiles.push({name:`plain-12x12-${count}-items`,board:{w:12,h:12},bag:Array.from({length:count},(_,n)=>({...small,uid:n+1,x:n%12,y:Math.floor(n/12)}))});
for(const [n,s] of fixture.scenarios.entries())profiles.push({name:`authored-trace-final-${n}`,board:{w:s.board.w,h:s.board.h,open:s.board.rows?(x,y)=>s.board.rows[y]?.[x]==='#':undefined},bag:s.steps.at(-1).placements.map(([id,x,y]:[string,number,number])=>({...s.items[id].data,x,y}))});
const stats=(samples:number[])=>{const sorted=[...samples].sort((a,b)=>a-b);return {samplesMs:samples,medianMs:sorted[12],p95Ms:sorted[23]};};
const results:any[]=[];
for(const p of profiles){
 const incoming=candidates.map((i,n)=>({...i,uid:100000+n,x:undefined,y:undefined}));
 const run=(api:typeof original,mode:'firstFit'|'hover')=>{
  let checksum=0;const start=performance.now();
  for(let n=0;n<256;n++){
   const item=incoming[n%incoming.length];
   if(mode==='firstFit'){
    const ok=api.autoPlace(p.bag,item,p.board);
    if(ok){checksum+=1+item.x!+item.y!*p.board.w;assert.equal(p.bag.pop(),item);}
   }else{
    const cell=n*37%(p.board.w*p.board.h),x=cell%p.board.w,y=Math.floor(cell/p.board.w);
    checksum+=api.bagItemAt(p.bag,x,y)?.uid??0;checksum+=api.canPlaceAt(p.bag,item,x,y,p.board)?1:0;
   }
  }
  return {elapsed:performance.now()-start,checksum};
 };
 for(const mode of ['firstFit','hover'] as const){
  const before=JSON.stringify(p.bag),expected=run(original,mode).checksum;assert.equal(run(adapter,mode).checksum,expected);assert.equal(JSON.stringify(p.bag),before);
  for(let i=0;i<6;i++){run(original,mode);run(adapter,mode);}
  const a:number[]=[],b:number[]=[];
  for(let i=0;i<25;i++)for(const host of i%2?[true,false]:[false,true]){const r=run(host?adapter:original,mode);assert.equal(r.checksum,expected);(host?b:a).push(r.elapsed);}
  results.push({profile:p.name,mode,items:p.bag.length,operationsPerSample:256,checksum:expected,original:stats(a),adapter:stats(b)});
 }
}
const report={scope:'Actual installed game helpers, including live item footprints and per-operation occupancy refresh. First-fit mutates then removes one original item identity; hover includes cell lookup and landing preview.',node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0].model,
 fixtureSha256:crypto.createHash('sha256').update(bytes).digest('hex'),results,
 limits:['Desktop only; no Steam Deck or older mobile measurements.','Warm samples exclude world boot, payload loading, rendering and whole-game frames.','One reusable occupancy buffer is bounded to 4096 bytes; total heap/allocation rate were not measured.','No timing gate or universal speedup claim.']};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.table(results.map(r=>({profile:r.profile,mode:r.mode,originalMs:r.original.medianMs,adapterMs:r.adapter.medianMs,ratio:r.original.medianMs/r.adapter.medianMs})));
