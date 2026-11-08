import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {root,sha256} from './reference-utils.mjs';

const directory=path.join(root,'evidence/unity-account-storage');
const read=file=>JSON.parse(fs.readFileSync(path.join(directory,file)));
const hash=file=>sha256(fs.readFileSync(file));
const sourceHash=file=>{
  const relative=file.replaceAll('\\','/');
  assert(!relative.startsWith('/')&&!relative.includes(':')&&!relative.split('/').includes('..'));
  return hash(path.join(root,relative));
};
const acceptance=read('acceptance.json'),reports=read('reports.json');
assert(acceptance.passed && acceptance.physicalDeviceQualification===false);
for(const[file,sha]of Object.entries(acceptance.files))assert.equal(hash(path.join(directory,file)),sha,file);
for(const[file,sha]of Object.entries(acceptance.sources))assert.equal(sourceHash(file),sha,file);
for(const name of ['engine','compatibility','standalone','sdk']){
  const report=reports[name];assert(report.passed,name);
  for(const[file,sha]of Object.entries(report.sources??{}))assert.equal(sourceHash(file),sha,name+': '+file);
}
const baseline=JSON.parse(fs.readFileSync(path.join(root,'baseline/unity-account-storage/manifest.json')));
const capsule=fs.readFileSync(path.join(root,'baseline/unity-account-storage/source.json.gz'));
assert.equal(baseline.commit,'b599864c30dde72f794a972d19951b593d0e3416');
assert.equal(sha256(capsule),baseline.sourceSha256);
const originals=JSON.parse(gunzipSync(capsule));
assert.deepEqual(Object.keys(originals).sort(),Object.keys(baseline.files).sort());
for(const[file,record]of Object.entries(baseline.files)){
  assert.equal(sha256(originals[file]),record.sha256,file);
  assert.equal(Buffer.byteLength(originals[file]),record.bytes,file);
}
const engine=reports.engine,storage=engine.packages['com.hollowwake.storage'],gameplay=engine.packages['com.hollowwake.gameplay'];
assert(engine.cleaned);
assert.equal(storage.version,'0.3.0-preview.1');assert.equal(gameplay.version,'0.4.0-preview.1');
assert.equal(gameplay.sha256,'e75f83bad493ddb159ab0217513e5216e203bdb0c7e5834a1c5dc0a8a2721317');
assert.equal(storage.sha256,acceptance.storageSha256);
for(const pack of [gameplay,storage])
  for(const[file,sha]of Object.entries({...pack.sources,...pack.sdkSources,...pack.nativeSources}))
    assert.equal(sourceHash(file),sha,file);
const observations=JSON.parse(gunzipSync(fs.readFileSync(path.join(directory,'observations.json.gz'))));
const inputs=JSON.parse(observations['inputs.json']);
assert.equal(Object.keys(inputs.expected).length,6);
for(const stage of ['editor','player']){
  const result=engine.results[stage];
  for(const field of ['passed','closed','accountRefusal','workshopRollback','busy','stale','invalidReload','publicationFailureClosed'])
    assert(result[field],stage+': '+field);
  assert.equal(result.unity,'2021.3.6f1');assert.equal(result.stage,stage);
  assert(result.accountPeak>0 && result.accountPeak<=32*1024*1024);
  assert(result.workshopPeak>0 && result.workshopPeak<=32*1024*1024);
  assert(['committed','cancelled'].includes(result.cancellation));
  assert.deepEqual(JSON.parse(observations[stage+'-result.json']),result);
  for(const label of ['initial','pair','equipped','continued','cancellation','publication-failure']){
    const expected=label==='cancellation'?(result.cancellation==='committed'?'cancel-committed':'continued'):label;
    for(const owner of ['account','workshop'])
      assert.deepEqual(JSON.parse(observations[stage+'-'+label+'-'+owner+'.json']),inputs.expected[expected][owner],stage+': '+label+' '+owner);
  }
  const before=JSON.parse(observations[stage+'-combat-before.json']),after=JSON.parse(observations[stage+'-combat-after.json']);
  assert.notDeepEqual(before.character,after.character);
  const {character:oldCharacter,...oldRest}=before,{character:newCharacter,...newRest}=after;
  assert.deepEqual(oldRest,newRest);
}
assert.deepEqual(Object.keys(engine.lifecycle),['play-entry-0','play-exit-0','play-entry-1','play-exit-1','reload']);
for(const[stage,result]of Object.entries(engine.lifecycle)){
  assert.deepEqual(result,{passed:true,closed:true,stage});
  assert.deepEqual(JSON.parse(observations[stage+'-lifecycle.json']),result);
}
for(const stage of ['sample-editor','sample-player']){
  assert.deepEqual(engine.sample[stage],{passed:true,closed:true});
  assert.deepEqual(JSON.parse(observations[stage+'-result.json']),engine.sample[stage]);
  for(const label of ['initial','memory','forge','continued'])
    for(const owner of ['account','workshop'])
      assert.deepEqual(JSON.parse(observations[stage+'-'+label+'-'+owner+'.json']),inputs.sampleExpected[label][owner],stage+': '+label+' '+owner);
}
assert.deepEqual(engine.faults.map(row=>row.name),['early-current','accept-false','failed-current','retain-postcommit']);
for(const row of engine.faults){
  assert(row.detected && row.archiveSha256!==storage.sha256);
  assert(observations.faultAssertions[row.name].some(line=>line.includes('Exception: '+row.assertion)),row.name);
}
for(const report of [reports.compatibility,reports.standalone]){
  assert.equal(report.packageSha256,storage.sha256);
  assert(report.processKillRecovery && report.independentSqliteInspection && report.relocatedPlayer);
  assert(report.results['play-exit'].passed && report.results['play-exit'].closed);
  assert.equal(report.results['play-exit'].revision,2);
  for(const stage of ['editor','player']){
    const result=report.results[stage];
    for(const field of ['passed','paired','stale','rollback','asyncOwnership','exactText','bounds','disposal'])assert(result[field]);
  }
  assert(report.results['before-reload'].closed && report.results['after-reload'].passed);
  assert(report.results['quit-cleanup'].closed);
  assert(report.results.recover.exactText && report.results.confirm.exactText);
  assert.equal(report.devicePerformanceClaim,false);
}
assert.equal(reports.compatibility.gameplayPackageSha256,'ea56ce53d14a5c0b669ba1dcc05e96e90ea768994ac682e6ec54c5fd38577c76');
assert.equal(reports.standalone.gameplayPackageSha256,null);
for(const stage of ['editor','player']){
  const result=reports.compatibility.workshop[stage];
  for(const field of ['passed','initialPublication','commitPublication','busyRecovery','staleRecovery',
    'payloadRecovery','noOpNoWrite','refusedCommand','invalidReload','exactContinuation','closed'])assert(result[field]);
  assert.equal(result.firstUid,4294967297);
  assert.equal(result.finalLiveBytes,0);assert.equal(result.finalLiveBlocks,0);
}
assert.equal(Object.keys(reports.compatibility.workshopLifecycle).length,6);
for(const result of Object.values(reports.compatibility.workshopLifecycle))assert(result.passed && result.closed);
assert(reports.compatibility.sample['sample-create'].importedSample && reports.compatibility.sample['sample-create'].committedView);
assert(reports.compatibility.sample['sample-reopen'].passed && reports.compatibility.sample['sample-reopen'].restartContinuation);
assert(reports.sdk.unchanged);
assert.deepEqual(reports.sdk.results.map(row=>[row.name,row.exitCode,row.signal,row.error]),[['verify',0,null,null]]);
assert.equal(sha256(gunzipSync(fs.readFileSync(path.join(directory,'sdk-verify.txt.gz')))),reports.sdk.results[0].logSha256);
const cleanup=read('cleanup.json');
assert(cleanup.passed && cleanup.bytesRemoved>0 && cleanup.foldersRemoved>0);
console.log({passed:true,storage:storage.version,gameplay:gameplay.version,completeStatePairs:20,
  lifecycleCourses:5,deliberateFaults:4,scope:'Unity 2021.3.6f1 Windows x64 Mono; physical devices unmeasured'});
