import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const accepted=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/crafting-package-latest.json')));assert(accepted.passed);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/crafting-benchmark-'));
const worker=path.join(directory,'worker.mjs');
const installed=path.join(accepted.consumer,'node_modules/@hollow-wake');
fs.mkdirSync(path.join(directory,'node_modules'));fs.symlinkSync(installed,path.join(directory,'node_modules/@hollow-wake'),process.platform==='win32'?'junction':'dir');
fs.writeFileSync(worker,`import fs from 'node:fs';import assert from 'node:assert/strict';import {performance} from 'node:perf_hooks';
import {ItemContent} from '@hollow-wake/engine/items';import {CraftingContent} from '@hollow-wake/engine/crafting/content';
const read=(pack,file)=>JSON.parse(fs.readFileSync(new URL(import.meta.resolve('@hollow-wake/'+pack+'/'+file))));
global.gc();const initialHeap=process.memoryUsage().heapUsed,loadStart=performance.now();
const items=new ItemContent(read('items','items.json'));const itemLoadMs=performance.now()-loadStart;
const craftStart=performance.now(),content=new CraftingContent(read('crafting','crafting.json'),items),craftLoadMs=performance.now()-craftStart,r=content.rules;
assert.equal(content.items,items);global.gc();const loadedHeap=process.memoryUsage().heapUsed;
const definitions=Object.values(items.pack.affixes),bases=Object.values(items.pack.bases),lore=Object.fromEntries(definitions.map(d=>[d.family,{rank:1,progress:0}]));
const gear=bases.map((base,i)=>({uid:i+1,baseId:base.id,rarity:'rare',tier:3,ilvl:40,baseRoll:.5,affixes:[{id:definitions[i].id,tier:0,rolls:definitions[i].lines.map(()=>.5)}]}));
const work={
 prices:()=>{let sum=0;for(let i=0;i<8192;i++){const item=gear[i%gear.length];sum+=r.salvageItemYield(item).count+r.sellItemYield(item).count+r.vendorItemPrice(item)[0].count;}return sum;},
 rolls:()=>{let sum=0,draws=0;const random=()=>{draws++;return .375;};for(let i=0;i<8192;i++){const def=definitions[i%definitions.length],roll=r.rollCraftedAffix(def,1,random,.6);if(roll)sum+=roll.tier+roll.rolls.reduce((a,b)=>a+b,0);}return sum+draws;},
 menus:()=>{let sum=0;for(let i=0;i<256;i++)for(const row of r.craftableAffixesFor(gear[i%gear.length],lore))sum+=row.rank+row.def.id.length;return sum;},
};
const results={};for(const [name,run]of Object.entries(work)){const expected=run();for(let i=0;i<3;i++)assert.equal(run(),expected);const samples=[];
 for(let i=0;i<11;i++){const start=performance.now(),sum=run();samples.push(performance.now()-start);assert.equal(sum,expected);}results[name]={samplesMs:samples,checksum:expected};}
global.gc();console.log(JSON.stringify({itemLoadMs,craftLoadMs,initialHeap,loadedHeap,retainedLoadedBytes:loadedHeap-initialHeap,warmHeap:process.memoryUsage().heapUsed,results}));
`);
const runs=[];for(let i=0;i<5;i++){const bytes=execFileSync(process.execPath,['--expose-gc',worker],{cwd:directory,encoding:'utf8',windowsHide:true,timeout:120000});runs.push(JSON.parse(bytes));}
const median=rows=>{const sorted=[...rows].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)];};
const summary={itemLoadMedianMs:median(runs.map(r=>r.itemLoadMs)),craftLoadMedianMs:median(runs.map(r=>r.craftLoadMs)),retainedLoadedMedianBytes:median(runs.map(r=>r.retainedLoadedBytes)),workloads:{}};
for(const [name,operations]of [['prices',8192],['rolls',8192],['menus',256]]){
 assert(runs.every(r=>r.results[name].checksum===runs[0].results[name].checksum));const values=runs.flatMap(r=>r.results[name].samplesMs);
 summary.workloads[name]={operations,medianBatchMs:median(values),maximumBatchMs:Math.max(...values),checksum:runs[0].results[name].checksum};
}
const report={passed:true,directory,node:process.version,platform:process.platform,architecture:process.arch,cpu:os.cpus()[0].model,archiveSha256:accepted.archives[0].sha256,
 contentArchives:accepted.archives.slice(1),workers:5,samplesPerWorker:11,warmups:4,summary,runs,
 limitations:['Desktop CPU only; not Steam Deck or mobile acceptance.','Prices performs salvage, sale and vendor queries per operation; rolls and menus are synthetic authored-data batches.','Load timing includes warm-cache file read, JSON decode, copying and validation after module import.','Retained heap after explicit GC is not peak memory or allocation volume.','No predecessor speedup or durable host action latency is claimed.']};
writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/crafting-benchmark-latest.json'),report);console.log({directory,...summary});
