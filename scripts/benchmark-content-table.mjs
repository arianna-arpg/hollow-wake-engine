import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const args=process.argv.slice(2);assert.equal(args.length,4,'--proof verification.json --tools tools-pointer.json');assert.equal(args[0],'--proof');assert.equal(args[2],'--tools');
const read=f=>JSON.parse(fs.readFileSync(f)),hash=f=>sha256(fs.readFileSync(f));const proof=read(args[1]);assert(proof.passed);
for(const [f,h]of Object.entries(proof.sources))assert.equal(hash(path.join(root,f)),h,'Changed benchmark source: '+f);
for(const [f,h]of Object.entries(proof.inputs))assert.equal(hash(path.join(proof.directory,f)),h,'Changed native input: '+f);
assert.equal(hash(path.join(proof.directory,'course.json')),proof.courseSha256);
const input=read(path.join(proof.directory,'input.json'));assert.equal(hash(input.dll),proof.librarySha256);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/content-table-benchmark-'));
for(const f of [...Object.keys(proof.inputs),'course.json'])fs.copyFileSync(path.join(proof.directory,f),path.join(directory,f));
const variants=[];
// Five paired runs, alternating order; identical caps for the timing comparison.
// The correctness replay separately checks the smaller 32 MiB candidate cap.
for(let sample=0;sample<5;sample++)for(const kind of sample%2?['compiled','baseline']:['baseline','compiled'])variants.push({name:kind+'-'+sample,bundle:kind==='baseline'?'baseline.js':'candidate.js',content:kind==='baseline'?'content.json':'table.json',heaps:[128]});
writeJSON(path.join(directory,'input.json'),{dll:input.dll,directory,variants});const toolchain=read(read(args[3]).tools);
const result=spawnSync(toolchain.python,['-I',path.join(root,'scripts/content-table-native.py'),path.join(directory,'input.json')],{encoding:'utf8',windowsHide:true,timeout:240000});
fs.writeFileSync(path.join(directory,'process.txt'),result.stdout+'\n'+result.stderr);assert(!result.error&&result.signal===null&&result.status===0,'Benchmark driver failed');
const observed=read(path.join(directory,'native-result.json'));assert.equal(observed.rows.length,10);assert(observed.rows.every(r=>r.passed&&r.commands===proof.commands&&r.destroyStatus===0&&r.remainingBytes===0));
const range=values=>{const sorted=values.toSorted((a,b)=>a-b);return{min:sorted[0],median:sorted[2],max:sorted.at(-1)};};
const measurements=Object.fromEntries(['baseline','compiled'].map(kind=>{const rows=observed.rows.filter(r=>r.variant.startsWith(kind+'-'));return[kind,{initializeMs:range(rows.map(r=>r.initializeMs)),courseMs:range(rows.map(r=>r.commandMs.reduce((a,b)=>a+b,0))),retainedAfterCreate:range(rows.map(r=>r.afterCreate.live_bytes)),peakBytes:range(rows.map(r=>r.tracked.peak_bytes)),allocationsAfterCreate:range(rows.map(r=>r.afterCreate.allocations)),allocations:range(rows.map(r=>r.tracked.allocations))}];}));
const report={passed:true,directory,observedAt:new Date().toISOString(),proofSha256:hash(args[1]),benchmarkSourceSha256:hash(path.join(root,'scripts/benchmark-content-table.mjs')),librarySha256:proof.librarySha256,archiveSha256:proof.archiveSha256,baselineArchiveSha256:proof.baselineArchiveSha256,courseSha256:proof.courseSha256,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,os:os.release(),samples:5,heapMiB:128,commands:proof.commands,coverage:proof.coverage,measurements,limitations:['Windows x64 desktop; not Steam Deck/mobile acceptance.','Allocator counts are native host tracking, not process RSS or per-JavaScript-object allocation counts.','All responses matched the accepted predecessor; timing includes the public native bridge and JSON response transfer.']};
writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/content-table-benchmark-latest.json'),report);console.log(report);
