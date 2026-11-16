import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {spawnSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';import {compareCombatPerformanceChecks} from './combat-performance-checks.mjs';
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});const owned=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(owned,'m5-acceptance-owned-'));
const report={passed:false,node:process.version,controls:[]};
const run=args=>{const r=spawnSync(process.execPath,args,{cwd:root,windowsHide:true,encoding:'utf8',timeout:600000,maxBuffer:4*1024*1024,
 env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NPM_CONFIG_CACHE:path.join(work,'cache'),NODE_COMPILE_CACHE:path.join(work,'compile-cache')}});assert(!r.error&&r.status===0,(r.stdout??'')+(r.stderr??String(r.error)));return r.stdout;};
try{
 const provenance=JSON.parse(fs.readFileSync(path.join(root,'baseline/combat-performance/provenance.json'))),archive=fs.readFileSync(path.join(root,'baseline/combat-performance/previous-workload.mjs.gz'));
 assert.equal(sha256(archive),provenance.archiveSha256);const previous=gunzipSync(archive);assert.equal(sha256(previous),provenance.uncompressedSha256);
 assert.equal(sha256(fs.readFileSync(path.join(root,'tools/combat-performance/workload.mjs'))),provenance.workloadSourceSha256,'New workloads need a separately reviewed baseline');
 const baseline=path.join(work,'baseline'),candidate=path.join(work,'candidate');
 run(['scripts/build-combat-benchmark.mjs','--baseline','baseline/combat-performance','--out',baseline]);
 assert.equal(sha256(fs.readFileSync(path.join(baseline,'workload.mjs'))),provenance.uncompressedSha256);
 run(['scripts/build-combat-benchmark.mjs','--out',candidate]);
 for(const [name,dir]of [['baseline',baseline],['candidate',candidate]])run([path.join(dir,'run.mjs'),'--mode','check','--out',path.join(work,name+'.json'),'--label','installed correctness, not performance']);
 const read=name=>JSON.parse(fs.readFileSync(path.join(work,name+'.json'))),a=read('baseline'),b=read('candidate');
 report.comparison=compareCombatPerformanceChecks(a,b);report.manifests={baseline:a.manifest,candidate:b.manifest};
 for(const [name,alter]of [
  ['missing-course',x=>x.courses.pop()],['shortened-clock',x=>x.courses[0].runs[0].counters.frame--],
  ['missing-casts',x=>x.courses[0].runs[0].counters.accepted=0],['missing-procs',x=>x.courses[2].runs[0].counters.procEvents=0],
  ['changed-frame',x=>x.courses[0].runs[0].traceSha256='0'.repeat(64)],['changed-continuation',x=>x.courses[0].runs[0].receiptSha256='0'.repeat(64)],
 ]){const bad=structuredClone(b);alter(bad);assert.throws(()=>compareCombatPerformanceChecks(a,bad),undefined,name);report.controls.push(name);}
 report.passed=true;console.log({passed:true,...report.comparison,controls:report.controls.length});
}finally{assert.equal(path.dirname(fs.realpathSync(work)),owned);fs.rmSync(work,{recursive:true,maxRetries:3});writeJSON(path.join(owned,'m5-combat-performance-check.json'),{...report,cleaned:true});}
