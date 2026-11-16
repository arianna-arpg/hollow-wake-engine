import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {fileURLToPath,pathToFileURL} from 'node:url';
const args=process.argv.slice(2);assert(args.length===2&&args[0]==='--out','Use node --expose-gc lifetime.mjs --out new-report.json');assert(globalThis.gc,'Requires --expose-gc');assert(!fs.existsSync(args[1]));
const here=path.dirname(fileURLToPath(import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex'),manifest=JSON.parse(fs.readFileSync(path.join(here,'manifest.json')));
assert.equal(hash(fs.readFileSync(path.join(here,'workload.mjs'))),manifest.files['workload.mjs'].sha256);
const {createCourse}=await import(pathToFileURL(path.join(here,'workload.mjs')).href),report={schemaVersion:1,passed:false,node:process.version,cpu:os.cpus()[0]?.model,manifest,cycles:1000,checkpoints:[],
 limits:['Retained-memory probe, not a timing result; explicit collection belongs to this probe only.','Each operation creates a character/session, advances it once, closes the host and releases its references.']};
let course;
try{
 course=createCourse('create-release');for(let i=0;i<35;i++)course.step();course.close();course=null;globalThis.gc();
 const before=process.memoryUsage();report.before=before;
 const resources=process.getActiveResourcesInfo().sort(),trace=createHash('sha256');
 for(let block=0;block<10;block++){
  course=createCourse('create-release');for(let i=0;i<100;i++)trace.update(JSON.stringify(course.step()));
  assert.equal(course.observe().count,100);course.close();course=null;globalThis.gc();report.checkpoints.push(process.memoryUsage());
 }
 report.traceSha256=trace.digest('hex');report.retainedHeapGrowthBytes=report.checkpoints.at(-1).heapUsed-before.heapUsed;
 report.processPeakRssKiB=process.resourceUsage().maxRSS;report.resourcesBefore=resources;report.resourcesAfter=process.getActiveResourcesInfo().sort();assert.deepEqual(report.resourcesAfter,resources);
 assert(report.retainedHeapGrowthBytes<4*1024*1024,'More than 4 MiB retained after 1000 cycles');report.passed=true;
}catch(error){report.failure=error.stack;process.exitCode=1;}
finally{course?.close();fs.writeFileSync(args[1],JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
console.log({passed:report.passed,cycles:report.cycles,retainedHeapGrowthBytes:report.retainedHeapGrowthBytes,failure:report.failure});
