import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';import {sha256,writeJSON} from './reference-utils.mjs';

const args=process.argv.slice(2);
assert([4,6].includes(args.length)&&args[0]==='--measurements'&&args[2]==='--out'&&(args.length===4||args[4]==='--source-lock'),'Use --measurements DIRECTORY --out NEW_DIRECTORY [--source-lock FILE]');
const source=path.resolve(args[1]),out=path.resolve(args[3]);assert(!fs.existsSync(out));
const read=name=>JSON.parse(fs.readFileSync(path.join(source,name+'.json')));
const names=['execution','extraction-benchmark','check-a','check-b',...Array.from({length:7},(_,i)=>'timing-'+(i+1)),'memory','profile','lifetime'];
const raw=Object.fromEntries(names.map(name=>[name,read(name)])),control=raw['check-a'];
assert(raw.execution.passed&&raw.execution.cleaned);
const workload=control.manifest.files['workload.mjs'].sha256;
const receipt=row=>({receipt:row.receiptSha256,counters:row.counters});
for(const name of names.filter(n=>!['execution','extraction-benchmark'].includes(n))){
 const result=raw[name];assert(result.passed,name);assert.equal(result.manifest.files['workload.mjs'].sha256,workload,name);
 if(name==='lifetime')continue;
 assert.deepEqual(result.courses.map(c=>c.name),control.courses.map(c=>c.name));
 if(name.startsWith('check')||name.startsWith('timing'))for(const [i,course]of result.courses.entries()){
  assert.equal(course.runs.length,1);
  assert.deepEqual(receipt(course.runs[0]),receipt(control.courses[i].runs[0]),name+': '+course.name);
  if(name.startsWith('check'))assert.equal(course.runs[0].traceSha256,control.courses[i].runs[0].traceSha256);
 }
}
assert.equal(raw.lifetime.cycles,1000);assert(raw.lifetime.retainedHeapGrowthBytes<4*1024*1024);
const timing=names.filter(n=>n.startsWith('timing')).map(n=>raw[n]),median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
for(const result of timing){assert.equal(result.mode,'timing');assert(result.environment.compileCacheDisabled);}
const courses=control.courses.map((course,i)=>{
 const runs=timing.map(r=>r.courses[i].runs[0]),memory=raw.memory.courses[i],profile=raw.profile.courses[i];
 return {name:course.name,samplesPerProcess:runs[0].samples,operationMs:Object.fromEntries(['median','p95','p99'].map(k=>[k,median(runs.map(r=>r.operationMs[k]))])),
  processMedianRangeMs:[Math.min(...runs.map(r=>r.operationMs.median)),Math.max(...runs.map(r=>r.operationMs.median))],
  receiptSha256:course.runs[0].receiptSha256,counters:course.runs[0].counters,
  retainedHeapGrowthBytes:memory.retainedHeapGrowthBytes,processPeakRssKiB:memory.processPeakRssKiB,
  estimatedAllocatedBytes:profile.estimatedAllocatedBytes};
});
const bytes=gzipSync(JSON.stringify(raw)+'\n',{level:9});
const report={schemaVersion:1,passed:true,kind:'desktop-parity-baseline',prototypeSourceCommit:JSON.parse(fs.readFileSync(args[5]??'baseline/prototype-parity/source-lock.json')).commit,
 measuredWorkloadSha256:workload,physicalDeviceQualified:false,optimizationComparison:false,freshTimingProcesses:timing.length,
 environment:timing[0].environment,conditions:raw.execution.conditions,
 aggregation:'Median of seven fresh-process medians/p95s/p99s; not pooled percentiles. Each process executes the same eight courses in order.',
 contentImportMs:{median:median(timing.map(r=>r.contentImportMs)),range:[Math.min(...timing.map(r=>r.contentImportMs)),Math.max(...timing.map(r=>r.contentImportMs))]},
 courses,lifetime:{cycles:raw.lifetime.cycles,retainedHeapGrowthBytes:raw.lifetime.retainedHeapGrowthBytes,processPeakRssKiB:raw.lifetime.processPeakRssKiB},
 limits:[...control.limits,'Desktop baseline only; no Steam Deck, mobile, thermal, battery or whole-game frame-budget qualification.',
 'November behavior differs from October; these measurements do not establish an optimization or regression ratio.',
 'The raw extraction-benchmark record is the preserved arithmetic-kernel comparison, not a whole-SDK speedup measurement.',
 'Process peak RSS is cumulative and includes shared content. Retained heap growth and sampled allocations are different measurements.',
 'The legacy raw field cpuIncludingSetupUs measures the sampled operation loop; setup and warmup are excluded despite its name.'],
 raw:{file:'measurements.json.gz',sha256:sha256(bytes),bytes:bytes.length}};
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'measurements.json.gz'),bytes);writeJSON(path.join(out,'measurements.json'),report);
console.log(JSON.stringify(report,null,2));
