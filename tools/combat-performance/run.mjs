import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {Session} from 'node:inspector/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';

const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){assert(['--out','--mode','--label','--conditions','--rounds','--course'].includes(args[i])&&args[i+1]&&!options[args[i]],'Invalid or duplicate option');options[args[i]]=args[i+1];}
const mode=options['--mode']??'timing',rounds=Number(options['--rounds']??7);
assert(['timing','check','profile','memory'].includes(mode));assert(Number.isInteger(rounds)&&rounds>=1&&rounds<=30);
assert(options['--out']&&!fs.existsSync(options['--out']),'Choose a new report filename');
const here=path.dirname(fileURLToPath(import.meta.url)),hash=value=>createHash('sha256').update(value).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(here,'manifest.json')));
for(const [file,row] of Object.entries(manifest.files))assert.equal(hash(fs.readFileSync(path.join(here,file))),row.sha256,'Runner integrity: '+file);
const start=performance.now(),{createCourse,specification}=await import(pathToFileURL(path.join(here,'workload.mjs')).href),contentImportMs=performance.now()-start;
const courses=options['--course']?[options['--course']]:specification.courses;
assert(courses.every(name=>specification.courses.includes(name)));
const report={schemaVersion:1,mode,passed:false,manifest,specification,environment:{node:process.version,v8:process.versions.v8,platform:process.platform,arch:process.arch,
 cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,totalMemoryBytes:os.totalmem(),os:os.release(),label:options['--label']??'unlabelled desktop',conditions:options['--conditions']??'unspecified',execArgv:process.execArgv,
 compileCacheDisabled:process.env.NODE_DISABLE_COMPILE_CACHE==='1',compileCacheDirectoryConfigured:!!process.env.NODE_COMPILE_CACHE},
 startedAt:new Date().toISOString(),contentImportMs,courses:[],limits:['Synchronous SDK and host frame construction only; wire encoding, socket transport and renderer excluded. No battery or thermal qualification.',
 'Timing includes public operation and workload counters. Setup, digesting and observation are outside operation timing.',
 'Heap allocation is a statistical V8 sampling estimate, not total native allocation. Memory and CPU profiling run separately from timing.']};
const quantiles=values=>{const a=[...values].sort((a,b)=>a-b);return {samples:a.length,median:a[Math.floor(a.length*.5)],p95:a[Math.min(a.length-1,Math.floor(a.length*.95))],p99:a[Math.min(a.length-1,Math.floor(a.length*.99))],max:a.at(-1)};};
const counts=name=>name.includes('-32')||name.includes('-128')?{warmup:specification.warmup,samples:specification.frames}:{warmup:5,samples:30};
function execute(name,{timed=false,digest=false}={}){
 const setupStart=performance.now(),course=createCourse(name),setupMs=performance.now()-setupStart,{warmup,samples}=counts(name),times=[],trace=digest?createHash('sha256'):null;
 try{
  for(let i=0;i<warmup;i++){course.prepare?.();course.step();}
  const cpu=process.cpuUsage();
  for(let i=0;i<samples;i++){
   course.prepare?.();const before=timed?performance.now():0,value=course.step();
   if(timed)times.push(performance.now()-before);
   if(trace)trace.update(JSON.stringify(value));
  }
  const used=process.cpuUsage(cpu),receipt=course.observe();
  return {samples,warmup,setupMs,...(timed?{operationMs:quantiles(times),rawMs:times,cpuIncludingSetupUs:used}:{}),
   receiptSha256:hash(JSON.stringify(receipt)),...(trace?{traceSha256:trace.digest('hex')}:{}),
   counters:Object.fromEntries(Object.entries(receipt).filter(([key,value])=>typeof value==='number'))};
 }finally{course.close();}
}
try{
 for(const name of courses){
  const row={name,runs:[]};
  if(mode==='timing'||mode==='check')for(let i=0;i<(mode==='check'?1:rounds);i++)row.runs.push(execute(name,{timed:mode==='timing',digest:mode==='check'}));
  if(mode==='profile'){
   execute(name);const inspector=new Session();inspector.connect();
   try{
    await inspector.post('Profiler.enable');await inspector.post('Profiler.start');execute(name);
    const {profile}=await inspector.post('Profiler.stop');
    row.cpuSamples=profile.samples?.length??0;const nodes=new Map(profile.nodes.map(n=>[n.id,n])),self=new Map();
    for(const id of profile.samples??[]){const n=nodes.get(id),key=n.callFrame.functionName+'@'+n.callFrame.lineNumber;self.set(key,(self.get(key)??0)+1);}
    row.hotFunctions=[...self].sort((a,b)=>b[1]-a[1]).slice(0,25);
    await inspector.post('HeapProfiler.startSampling',{samplingInterval:16384,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
    const before=performance.now();execute(name);const elapsedMs=performance.now()-before;
    const {profile:heap}=await inspector.post('HeapProfiler.stopSampling');let bytes=0;const allocation=[];
    const visit=n=>{bytes+=n.selfSize;if(n.selfSize)allocation.push([n.callFrame.functionName+'@'+n.callFrame.lineNumber,n.selfSize]);for(const child of n.children)visit(child);};visit(heap.head);
    row.estimatedAllocatedBytes=bytes;row.instrumentedElapsedMs=elapsedMs;row.estimatedBytesPerSecond=bytes/(elapsedMs/1000);row.allocationHotFunctions=allocation.sort((a,b)=>b[1]-a[1]).slice(0,20);
   }finally{inspector.disconnect();}
  }
  if(mode==='memory'){
   assert(globalThis.gc,'Memory mode requires node --expose-gc');execute(name);globalThis.gc();
   const initial=process.memoryUsage(),resources=process.getActiveResourcesInfo().sort(),retained=[];
   for(let i=0;i<5;i++){execute(name);globalThis.gc();retained.push(process.memoryUsage());}
   row.initial=initial;row.afterRelease=retained;row.retainedHeapGrowthBytes=retained.at(-1).heapUsed-initial.heapUsed;
   row.processPeakRssKiB=process.resourceUsage().maxRSS;row.resourcesBefore=resources;row.resourcesAfter=process.getActiveResourcesInfo().sort();
   assert.deepEqual(row.resourcesAfter,resources,'Active resource growth');
  }
  if(row.runs.length)assert(row.runs.every(r=>r.receiptSha256===row.runs[0].receiptSha256),'Nondeterministic receipt: '+name);
  report.courses.push(row);console.log(name,mode,row.runs.map(r=>r.operationMs?.median??r.traceSha256).join(' '));
 }
 report.passed=true;
}catch(error){report.failure=error.stack;process.exitCode=1;}
finally{fs.writeFileSync(options['--out'],JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
if(!report.passed)console.error(report.failure);
