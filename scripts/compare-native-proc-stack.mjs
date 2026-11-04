import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {buildEmbeddedExecutable} from './embedded-native-tools.mjs';
import {compareDeliveryReplay,projectDeliveryReplay} from './native-delivery-comparison.mjs';

const [driverFlag,driverInput,beforeFlag,beforeInput,afterFlag,afterInput]=process.argv.slice(2);
assert.deepEqual([driverFlag,beforeFlag,afterFlag],['--instrumented','--before','--after']);
const [driverPath,beforePath,afterPath]=[driverInput,beforeInput,afterInput].map(p=>fs.realpathSync(p));
const read=f=>JSON.parse(fs.readFileSync(f)),hash=f=>sha256(fs.readFileSync(f));
const diagnostic=read(path.join(driverPath,'verification.json')), before=read(path.join(beforePath,'verification.json')), after=read(path.join(afterPath,'verification.json'));
assert(diagnostic.passed && diagnostic.productionLimitsChanged===false && after.passed && after.originalAndInstalledNative.exact);
const accepted=read(path.join(root,'baseline/proc-delivery/acceptance.json'));
assert.equal(before.referenceSha256,accepted.observationsSha256);assert.equal(after.referenceSha256,accepted.observationsSha256);
const frozen=gunzipSync(fs.readFileSync(path.join(root,accepted.observations)));
assert.equal(sha256(frozen),accepted.observationsSha256);
const expected=JSON.parse(frozen),directory=fs.mkdtempSync(path.join(root,'.artifacts/native-proc-stack-comparison-'));
const upstream=path.join(driverPath,'upstream'),driver=path.join(driverPath,'driver.c');
const lock=read(path.join(root,'experiments/embedded-js/host-source-lock.json'));
assert.equal(hash(path.join(upstream,'quickjs-amalgam.c')),diagnostic.instrumentedRuntimeSha256);
assert.equal(hash(path.join(upstream,'quickjs.h')),lock.files['quickjs.h']);assert.equal(hash(driver),diagnostic.instrumentedDriverSha256);
for(const f of ['host-support.h','tracked-allocator.h']){
  assert.equal(hash(path.join(driverPath,f)),hash(path.join(root,'experiments/embedded-js',f)));
  fs.copyFileSync(path.join(driverPath,f),path.join(directory,f));
}
// Reset the existing development counter per request. Production limits, the
// simulation bundle, observer and command stream stay intact.
let source=fs.readFileSync(driver,'utf8');
for(const [needle,replacement] of [
  ['argc != 5','argc != 7'],
  ['while (cursor < end) {','while (cursor < end) {\n        hwe_diagnostic_peak_stack = 0;\n        if (completed == (unsigned)strtoul(argv[5], NULL, 10)) JS_SetMaxStackSize(runtime, (size_t)strtoull(argv[6], NULL, 10));'],
  ['completed++;','fprintf(stderr, "{\\"request\\":%u,\\"span\\":%zu}\\n", completed, hwe_diagnostic_peak_stack);\n        completed++;'],
]){
  assert.equal(source.split(needle).length,2,needle);source=source.replace(needle,replacement);
}
const ownDriver=path.join(directory,'driver.c'),buildDir=path.join(directory,'build');
fs.writeFileSync(ownDriver,source);fs.mkdirSync(buildDir);
const built=buildEmbeddedExecutable(buildDir,upstream,ownDriver,'stack-course');
const caseNames=['authored-answering_gale','authored-rimewake_release','authored-lattice_discharge','authored-breach_bell',
  'cast-missing-instance','cast-missing-target','cast-power-0','cast-power--1','cast-power-0.5'];
const cases=caseNames.map(name=>{const i=expected.rows.findIndex(row=>row.name===name);assert(i>=0,name);return i;});
const fullCount=accepted.courses+2;
function run(label,course,folder,variant,limit,count){
  const bundle=path.join(folder,variant,'bundle.js');
  assert.equal(hash(bundle),course.runs.find(r=>r.label===variant).bundleSha256);
  const requests=path.join(directory,label+'-requests.jsonl'),log=path.join(directory,label+'.txt'),output=path.join(directory,label+'.jsonl');
  const requestLines=fs.readFileSync(path.join(folder,'requests.jsonl'),'utf8').trim().split(/\r?\n/);
  assert.equal(requestLines.length,fullCount);fs.writeFileSync(requests,requestLines.slice(0,count).join('\n')+'\n');
  const out=fs.openSync(output,'wx'),err=fs.openSync(log,'wx');let result;
  // Construction and all preceding requests use the same diagnostic ceiling.
  // Apply the smaller guard only at the course whose checked span we measured.
  const changeAt=count===fullCount?fullCount:count-1;
  try{result=spawnSync(built.binary,[bundle,path.join(folder,'input.json'),requests,'524288',String(changeAt),String(limit)],{cwd:directory,env:built.env,stdio:['ignore',out,err],timeout:600000,windowsHide:true});}
  finally{fs.closeSync(out);fs.closeSync(err);}
  assert(!result.error&&!result.signal);assert.equal(result.status,0,log);
  const lines=file=>fs.readFileSync(file,'utf8').trim().split(/\r?\n/).map(JSON.parse);
  const diagnosticLines=lines(log),metrics=diagnosticLines.at(-2),spans=diagnosticLines.filter(r=>Object.hasOwn(r,'request'));
  assert.equal(metrics.code,0);assert.equal(metrics.completedRequests,count);assert.equal(metrics.liveBlocksAfterDispose,0);assert.equal(metrics.liveRequestedBytesAfterDispose,0);
  assert.equal(spans.length,count);assert(spans.every((r,i)=>r.request===i&&Number.isSafeInteger(r.span)&&r.span>0));
  const values=lines(output);assert.equal(values.length,count);
  if(count===fullCount){
    compareDeliveryReplay(projectDeliveryReplay(values.slice(0,-1),accepted.courses),expected);
    assert.deepEqual(values.at(-1),read(path.join(folder,variant,'node-services.json')));
  }
  return {label,limit,count,metrics,spans:spans.map(r=>r.span),outputSha256:hash(output),logSha256:hash(log),bundleSha256:hash(bundle),
    lastRow:count===fullCount?undefined:values.at(-1).value};
}
const runs=[];
for(const [name,course,folder] of [['before',before,beforePath],['after',after,afterPath]]){
  for(const variant of ['original','installed'])runs.push(run(name+'-'+variant,course,folder,variant,524288,fullCount));
}
const old=runs[1],repaired=runs[3],first=cases[0];
const limit=Math.floor((old.spans[first]+repaired.spans[first])/2);
assert(repaired.spans[first]<limit&&limit<old.spans[first],'Expected the repair to reduce the checked span');
const control=run('constrained-before',before,beforePath,'installed',limit,first+1);
const positive=run('constrained-after',after,afterPath,'installed',limit,first+1);
assert.equal(control.lastRow.name,caseNames[0]);assert.match(control.lastRow.steps[0].error,/maximum call stack size exceeded/i);
compareDeliveryReplay(positive.lastRow,expected.rows[first]);delete control.lastRow;delete positive.lastRow;
runs.push(control,positive);
const report={passed:true,directory,platform:process.platform,arch:process.arch,compiler:built.compilerBanner,sourceSha256:hash(ownDriver),
  beforeProofSha256:hash(path.join(beforePath,'verification.json')),afterProofSha256:hash(path.join(afterPath,'verification.json')),
  previouslyFailing:cases.map((i,n)=>({name:caseNames[n],beforeBytes:old.spans[i],afterBytes:repaired.spans[i]})),runs,
  scope:'Instrumented checked stack spans depend on toolchain and probe layout. The smaller-limit control demonstrates a behavioral regression and recovery. Production still uses its original 256 KiB guard.'};
writeJSON(path.join(directory,'verification.json'),report);
writeJSON(path.join(root,'.artifacts/native-proc-stack-comparison-latest.json'),{directory});
console.log({passed:true,directory,limit,previouslyFailing:report.previouslyFailing});
