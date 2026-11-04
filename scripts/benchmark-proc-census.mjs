import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {countProcSummons, countWorldSummons, originalCount, censusFixture, censusSample} from '../experiments/proc-census/workload.mjs';
import {root, sha256, writeJSON} from './reference-utils.mjs';
import {cases, orders, median, verifyOriginalCensus, verifyWorldCensus} from './proc-census-plan.mjs';

const originalBoundarySha256=verifyOriginalCensus();
const args=process.argv.slice(2);
const world=args[0]==='--world';
if(world)args.shift();
const bindingSha256=world?verifyWorldCensus():undefined;
const label=world?'proc-world-census':'proc-census';
function runMethod(method) {
  const count=method==='original'?originalCount:world?countWorldSummons:countProcSummons;
  return cases.map(({size,density})=>{
    const fixture=censusFixture(size,density), {queries,expected}=fixture;
    const cycles=Math.ceil(4_000_000/(size*queries.length)),reads=cycles*queries.length;
    const perCycle=expected.reduce((a,b)=>a+b,0);
    assert.equal(censusSample(fixture,count,Math.min(cycles,1000)),Math.min(cycles,1000)*perCycle);
    global.gc?.();
    const start=performance.now(),checksum=censusSample(fixture,count,cycles),ms=performance.now()-start;
    assert.equal(checksum,cycles*perCycle);
    return {size,density,reads,rosterVisits:reads*size,checksum,expected,ms,msPerThousandReads:ms*1000/reads};
  });
}

if(args[0]==='--worker') {
  assert(args.length===2&&['original','scan','scan-control'].includes(args[1]));
  console.log(JSON.stringify(runMethod(args[1])));
} else if(args.length===1&&args[0]==='--verify-only') {
  for(const {size,density} of cases)censusFixture(size,density);
  console.log({verified:true,cases:cases.length,queriesPerCase:9,originalExpressionChecked:true});
} else {
  assert.equal(args.length,0);
  fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
  const directory=fs.mkdtempSync(path.join(root,'.artifacts/'+label+'-benchmark-'));
  const runs=[];
  for(const [round,order] of orders.entries())for(const method of order) {
    const bytes=execFileSync(process.execPath,['--expose-gc',fileURLToPath(import.meta.url),...(world?['--world']:[]),'--worker',method],{cwd:root,windowsHide:true,timeout:120000});
    fs.writeFileSync(path.join(directory,'round-'+round+'-'+method+'.json'),bytes,{flag:'wx'});
    runs.push({round,method,cases:JSON.parse(bytes),sha256:sha256(bytes)});
  }
  const summary=cases.map(({size,density},index)=>{
    const timings=method=>runs.filter(r=>r.method===method).map(r=>r.cases[index].msPerThousandReads);
    const all=runs.map(r=>r.cases[index]);
    assert(all.every(row=>row.size===size&&row.density===density&&row.checksum===all[0].checksum&&row.rosterVisits===all[0].rosterVisits));
    const original=timings('original'),scan=timings('scan'),control=timings('scan-control');
    return {size,density,originalMsPerThousand:median(original),scanMsPerThousand:median(scan),
      scanOverOriginal:median(scan)/median(original),pairedScanOverOriginal:scan.map((v,i)=>v/original[i]),
      identicalControlRatios:control.map((v,i)=>v/scan[i])};
  });
  const report={passed:true,directory,node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,
    originalBoundarySha256,implementation:world?'Hollow Wake array visitor':'SDK indexed scan',bindingSha256,benchmarkSha256:sha256(fs.readFileSync(fileURLToPath(import.meta.url))),planSha256:sha256(fs.readFileSync(path.join(root,'scripts/proc-census-plan.mjs'))),
    workloadSha256:sha256(fs.readFileSync(path.join(root,'experiments/proc-census/workload.mjs'))),
    runtimeSha256:sha256(fs.readFileSync(path.join(root,'dist/proc-delivery.js'))),rounds:orders.length,summary,runs,
    scope:'Isolated summon census on fixed synthetic rosters. Timings exclude construction, warmup and explicit GC. Whole frames, memory allocation volume and device targets require separate measurements.'};
  writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/'+label+'-benchmark-verification.json',report);
  console.log({passed:true,directory,summary:summary.map(r=>({size:r.size,density:r.density,scanOverOriginal:r.scanOverOriginal}))});
}
