import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {censusFixture} from '../experiments/proc-census/workload.mjs';
import {cases as workloads,orders,median,verifyOriginalCensus,verifyWorldCensus} from './proc-census-plan.mjs';

const args=process.argv.slice(2);
const world=args[0]==='--world';
if(world)args.shift();
const bindingSha256=world?verifyWorldCensus():undefined;
const label=world?'proc-world-census':'proc-census';
assert(args.length===2&&args[0]==='--proof','Supply the verification.json of a passing full native attack or delivery replay');
const proofFile=path.resolve(root,args[1]),proof=JSON.parse(fs.readFileSync(proofFile));
assert(proof.passed&&proof.originalAndInstalledNative,'Requires a successful native comparison');
const binary=path.join(proof.directory,'native',process.platform==='win32'?'course-host.exe':'course-host');
assert.equal(sha256(fs.readFileSync(binary)),proof.driver?.binarySha256??proof.binarySha256);
for(const file of ['experiments/embedded-js/session-host.c','experiments/embedded-js/host-support.h','experiments/embedded-js/tracked-allocator.h'])
  assert.equal(sha256(fs.readFileSync(path.join(root,file))),proof.sourceHashes[file],file);
const originalBoundarySha256=verifyOriginalCensus();

const directory=fs.mkdtempSync(path.join(root,'.artifacts/'+label+'-native-')),bundle=path.join(directory,'bundle.js');
const built=await build({entryPoints:[path.join(root,'experiments/proc-census/native-entry.mjs')],bundle:true,platform:'neutral',
  format:'iife',globalName:'HollowWakeSession',target:'es2022',metafile:true,outfile:bundle});
assert(Object.values(built.metafile.outputs).every(out=>out.imports.length===0));writeJSON(path.join(directory,'metafile.json'),built.metafile);
const runs=[],cases=[];
function run(size,density,method,round,cycles,warmup) {
  const prefix=path.join(directory,[size,density,round,method].join('-'));
  const request=prefix+'-request.jsonl',content=path.join(directory,size+'-'+density+'-content.json');
  fs.writeFileSync(request,JSON.stringify({mode:method==='original'?0:world?2:1,cycles,warmup})+'\n',{flag:'wx'});
  const result=spawnSync(binary,[bundle,content,request],{cwd:directory,encoding:'utf8',windowsHide:true,timeout:120000});
  fs.writeFileSync(prefix+'-output.jsonl',result.stdout??'');fs.writeFileSync(prefix+'-metrics.txt',result.stderr??'');
  assert(!result.error&&!result.signal);assert.equal(result.status,0,prefix);
  const output=JSON.parse(result.stdout),metrics=JSON.parse(result.stderr.trim().split(/\r?\n/).at(-1));
  const expected=censusFixture(size,density).expected;
  assert.deepEqual(output.expected,expected);assert.equal(output.sum,cycles*expected.reduce((a,b)=>a+b,0));
  assert.equal(metrics.code,0);assert.equal(metrics.completedRequests,1);
  assert.equal(metrics.liveRequestedBytesAfterDispose,0);assert.equal(metrics.liveBlocksAfterDispose,0);
  if(cycles)assert(output.elapsedMs>=5,'Insufficient clock resolution for '+prefix);
  return {size,density,method,round,cycles,warmup,reads:cycles*expected.length,elapsedMs:output.elapsedMs,
    msPerThousandReads:cycles?output.elapsedMs*1000/(cycles*expected.length):null,checksum:output.sum,metrics};
}
for(const {size,density} of workloads){
  writeJSON(path.join(directory,size+'-'+density+'-content.json'),{size,density});
  const expected=censusFixture(size,density).expected,cycles=Math.ceil(1_500_000/(size*expected.length)),warmup=Math.min(cycles,80);
  const idle=run(size,density,'scan','idle',0,0);cases.push({size,density,expected,cycles,warmup,idle});
  for(const [round,order] of orders.entries())for(const method of order)runs.push(run(size,density,method,round,cycles,warmup));
}
const summary=cases.map(({size,density})=>{
  const group=method=>runs.filter(r=>r.size===size&&r.density===density&&r.method===method);
  const original=group('original'),scan=group('scan'),control=group('scan-control');
  const ms=rows=>median(rows.map(r=>r.msPerThousandReads));
  const allocations=rows=>median(rows.map(r=>r.metrics.allocationRequests));
  const peak=rows=>median(rows.map(r=>r.metrics.peakRequestedBytes));
  return {size,density,originalMsPerThousand:ms(original),scanMsPerThousand:ms(scan),scanOverOriginal:ms(scan)/ms(original),
    pairedScanOverOriginal:scan.map((r,i)=>r.elapsedMs/original[i].elapsedMs),identicalControlRatios:control.map((r,i)=>r.elapsedMs/scan[i].elapsedMs),
    originalAllocationRequests:allocations(original),scanAllocationRequests:allocations(scan),originalPeakRequestedBytes:peak(original),scanPeakRequestedBytes:peak(scan)};
});
const sources=['scripts/benchmark-native-proc-census.mjs','scripts/proc-census-plan.mjs','experiments/proc-census/workload.mjs','experiments/proc-census/native-entry.mjs','dist/proc-delivery.js'];
const report={passed:true,directory,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,runtime:proof.runtimeVersion,
  originalBoundarySha256,implementation:world?'Hollow Wake array visitor':'SDK indexed scan',bindingSha256,driverSha256:sha256(fs.readFileSync(binary)),proofSha256:sha256(fs.readFileSync(proofFile)),bundleSha256:sha256(fs.readFileSync(bundle)),
  sources:Object.fromEntries(sources.map(file=>[file,sha256(fs.readFileSync(path.join(root,file)))])),orders,cases,summary,runs,
  scope:'Synthetic summon census in the verified embedded runtime. Guest wall-clock timing surrounds only the fixed query loop. Tracked allocator requests and peak requested bytes cover the whole process lifecycle, including startup, fixture creation, warmup and serialization.'};
writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/'+label+'-native-verification.json',report);
console.log({passed:true,directory,summary:summary.map(r=>({size:r.size,density:r.density,scanOverOriginal:r.scanOverOriginal,allocations:[r.originalAllocationRequests,r.scanAllocationRequests]}))});
