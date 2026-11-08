import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,sha256} from './reference-utils.mjs';
import {sourceHasher} from './evidence-source.mjs';
const args=process.argv.slice(2),release='c46c3ddfd35c4700e5e432555399f6027f77ba4d';
assert(args.length===0||(args.length===2&&args[0]==='--source-ref'&&args[1]===release));
const sourceHash=sourceHasher(args.length?release:null);
const directory=path.join(root,'evidence/shared-account');
const read=file=>JSON.parse(fs.readFileSync(path.join(directory,file)));
const acceptance=read('acceptance.json'),reports=read('reports.json');
assert.equal(acceptance.schemaVersion,1);
assert.equal(acceptance.portablePassed,true);
assert.equal(acceptance.nativeAccepted,false);
assert.equal(acceptance.physicalDeviceQualification,false);
assert.deepEqual(Object.keys(acceptance.files).sort(),['reports.json','sdk-logs.json.gz']);
for(const[file,hash]of Object.entries(acceptance.files))assert.equal(sha256(fs.readFileSync(path.join(directory,file))),hash,file);
const requireSources=map=>{
  assert(Object.keys(map).length>0);
  for(const[file,hash]of Object.entries(map)){
    assert(!path.isAbsolute(file)&&!file.includes('..'));
    assert.equal(sourceHash(file),hash,file);
  }
};
requireSources(acceptance.sources);
for(const name of ['sdk','package','native','source1','source2'])requireSources(reports[name].sources);
assert.equal(reports.sdk.passed,true);assert.equal(reports.sdk.unchanged,true);
assert.deepEqual(reports.sdk.results.map(row=>row.name),['verify','reference:verify']);
for(const result of reports.sdk.results)assert.equal(result.exitCode===0&&!result.signal&&!result.error,true);
const pkg=reports.package;
assert.equal(pkg.passed,true);assert.equal(pkg.cleaned,true);assert.equal(pkg.contracts,22);
assert.equal(pkg.sourceScenarios,10);assert.equal(pkg.sourceSteps,30);
for(const field of ['installed','browser','types','restored'])assert.equal(pkg[field].status,0);
assert(pkg.browserBytes>0&&pkg.browserBytes<180*1024);
assert.deepEqual(pkg.faults.map(row=>row.name),['detached-lore','detached-ledger','stale-feature','ignore-sealed',
  'drop-key-check','drop-duplicate-key','allow-close-bound','lose-opaque-extra','drop-account-publication',
  'drop-inventory-publication','skip-bound-inventory-admission','default-null-context','erase-null-host-data','default-null-item-id']);
for(const fault of pkg.faults)assert.equal(fault.status===1&&fault.assertion,true);
for(const [index,relative]of [[1,'baseline/shared-account'],[2,'baseline/shared-account/admitted-socket']]){
  const report=reports['source'+index],manifest=JSON.parse(fs.readFileSync(path.join(root,relative,'acceptance.json')));
  assert(report.passed&&report.cleaned&&!report.captured);assert.equal(report.scenarios,10);assert.equal(report.steps,30);
  assert.equal(manifest.capturedBeforeImplementation,index===1);
  assert.equal(manifest.helperSha256,report.helperSha256);assert.equal(manifest.sourceLockSha256,report.sourceLockSha256);
  assert.deepEqual(manifest.methods,report.methods);
  assert.equal(sha256(fs.readFileSync(path.join(root,manifest.fixture))),manifest.compressedSha256);
  assert.equal(report.faults.length,9);
  assert.deepEqual(report.faults.map(row=>row.name),manifest.faults.map(row=>row.name));
  for(const fault of report.faults)assert(fault.detected&&(fault.assertion||fault.traceChanged));
  for(const run of [...report.runs,report.bundledControl,report.restoredControl]){
    assert.equal(run.status,0);assert.equal(run.sha256,manifest.sha256);
  }
}
const native=reports.native;
assert(native.exploratory&&native.completed&&native.cleaned);
assert.equal(native.passed,false,'The failed native configuration must stay failed');
assert.equal(native.process.status,0);assert.equal(native.process.error,null);assert.equal(native.process.signal,null);
assert.equal(native.nativeSha256,'5819b60989b3c9d79ca1b5850e4a8461fc2411db400ae4c453a6ed4f6c8ff82f');
assert.equal(native.archiveSha256,'e75f83bad493ddb159ab0217513e5216e203bdb0c7e5834a1c5dc0a8a2721317');
const [low,roomy]=native.observed.rows;assert.equal(native.observed.rows.length,2);
assert.equal(low.heapMiB,32);assert.equal(low.createStatus,0);assert.equal(low.coursePassed,undefined);
assert.equal(low.failedMetrics.poisoned,1);assert.equal(low.failedMetrics.peak_bytes,33493285);
assert.equal(low.destroyStatus,11);assert.equal(low.remainingBytes,86410);assert.equal(low.disposed,false);
assert.equal(roomy.heapMiB,48);assert.equal(roomy.coursePassed,true);assert.equal(roomy.commands,579);
assert.equal(roomy.tracked.peak_bytes,36140101);assert.equal(roomy.destroyStatus,0);assert.equal(roomy.remainingBytes,0);
console.log({portablePassed:true,sourceSteps:30,contracts:22,sourceFaultsPerRevision:9,packageFaults:14,nativeAccepted:false});
