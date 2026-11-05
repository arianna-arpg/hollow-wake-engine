import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const accepted=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/unlock-package-latest.json')));assert(accepted.passed);
for(const archive of accepted.archives)assert.equal(sha256(fs.readFileSync(path.join(accepted.directory,archive.filename))),archive.sha256);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/unlock-content-load-'));
const module=name=>JSON.stringify(pathToFileURL(path.join(accepted.consumer,'node_modules/@hollow-wake/engine/dist',name+'.js')).href);
const inputs=Object.fromEntries(['unlocks','gates','memories'].map(name=>[name,path.join(accepted.directory,name,name+'.json')]));
for(const [name,file]of Object.entries(inputs))assert.equal(sha256(fs.readFileSync(file)),accepted.content[name].sha256);
const entry=path.join(directory,'measure.mjs');
fs.writeFileSync(entry,`
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {UnlockContent} from ${module('unlock-content')};
import {ProgressionGateContent} from ${module('progression-gate-content')};
import {MemoryRewardContent} from ${module('memory-reward-content')};
const texts=Object.fromEntries(Object.entries(${JSON.stringify(inputs)}).map(([name,file])=>[name,fs.readFileSync(file,'utf8')]));
const shared={gates:new ProgressionGateContent(JSON.parse(texts.gates)),memories:new MemoryRewardContent(JSON.parse(texts.memories))};
const dependency=()=>({gates:new ProgressionGateContent(JSON.parse(texts.gates)),memories:new MemoryRewardContent(JSON.parse(texts.memories))});
const variants={sharedDependencies:()=>({unlocks:new UnlockContent(JSON.parse(texts.unlocks),shared),...shared}),
 completeContent:()=>{const deps=dependency();return {unlocks:new UnlockContent(JSON.parse(texts.unlocks),deps),...deps};}};
const size=value=>value.unlocks.pack.catalog.length+value.unlocks.pack.packages.length+value.memories.catalogue().length;
const expected=190+39+1061;assert.equal(typeof global.gc,'function');const results=[];
const order=[process.argv[3]];assert(Object.hasOwn(variants,order[0]));
for(const name of order){
 const construct=variants[name];for(let i=0;i<32;i++)assert.equal(size(construct()),expected);
 const calls=256;global.gc();let checksum=0;const start=process.hrtime.bigint();
 for(let i=0;i<calls;i++)checksum+=size(construct());
 const nanoseconds=Number(process.hrtime.bigint()-start);assert.equal(checksum,calls*expected);
 global.gc();const before=process.memoryUsage(),retained=[];
 for(let i=0;i<32;i++)retained.push(construct());global.gc();const after=process.memoryUsage();
 assert.equal(retained.reduce((sum,value)=>sum+size(value),0),32*expected);
 results.push({name,calls,nanoseconds,checksum,retainedInstances:32,heapDelta:after.heapUsed-before.heapUsed,externalDelta:after.external-before.external,rssBefore:before.rss,rssAfter:after.rss});
}
fs.writeFileSync(process.argv[2],JSON.stringify(results)+String.fromCharCode(10),{flag:'wx'});
`,{flag:'wx'});
const rows=[];
for(let index=0;index<8;index++){
 const variants=['sharedDependencies','completeContent'];if(index%2)variants.reverse();const round=[];
 for(const name of variants){
  const output=path.join(directory,index+'-'+name+'.json'),fd=fs.openSync(path.join(directory,index+'-'+name+'.txt'),'wx');
  try{execFileSync(process.execPath,['--expose-gc',entry,output,name],{cwd:directory,stdio:['ignore',fd,fd],windowsHide:true,timeout:180000});}finally{fs.closeSync(fd);}
  const [observed]=JSON.parse(fs.readFileSync(output));assert.equal(observed.name,name);assert(observed.heapDelta>0,'Retained heap observation invalid');round.push(observed);
 }
 rows.push(round);writeJSON(path.join(directory,'progress.json'),{rounds:rows.length});
}
const median=values=>{const sorted=values.slice().sort((a,b)=>a-b);return (sorted[3]+sorted[4])/2;};
const summary=['sharedDependencies','completeContent'].map(name=>{
 const values=rows.map(round=>round.find(row=>row.name===name));
 return {name,medianMilliseconds:median(values.map(row=>row.nanoseconds/row.calls))/1e6,
  retainedHeapBytesPerInstanceMedian:median(values.map(row=>row.heapDelta/row.retainedInstances)),
  retainedHeapBytesPerInstanceRange:[Math.min(...values.map(row=>row.heapDelta/row.retainedInstances)),Math.max(...values.map(row=>row.heapDelta/row.retainedInstances))]};
});
const report={passed:true,directory,observedAt:new Date().toISOString(),archiveSha256:accepted.archives[0].sha256,cpu:os.cpus()[0].model,node:process.version,
 inputs:Object.fromEntries(Object.entries(inputs).map(([name,file])=>[name,{sha256:sha256(fs.readFileSync(file)),bytes:fs.statSync(file).size}])),rows,summary,
 scope:'Warm desktop Node JSON parsing, validation, detachment, freezing and index construction. Eight fresh processes per variant, 32 warmups and 256 timed loads in each. sharedDependencies constructs unlock content against previously loaded gate and memory content; completeContent constructs all three each call. Variants alternate process order. Retained V8 heap estimated with explicit GC over 32 copies in a separate process for each variant; not allocation traffic or total RSS. Module/file/process startup, context construction, gameplay queries, rendering, native/editor and physical-device costs are excluded. These absolute measurements are not an optimization speedup claim.'};
writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/unlock-content-load-latest.json',report);console.log({passed:true,directory,summary});
