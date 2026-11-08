import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {root,sha256} from './reference-utils.mjs';
const directory=path.join(root,'evidence/live-equipment-adapter');
const read=file=>JSON.parse(fs.readFileSync(path.join(directory,file)));
const hash=file=>sha256(fs.readFileSync(file));
const args=process.argv.slice(2),release='03eb2d504a9fe410b97d3959a76d4a494c5d3541';
assert(args.length===0||(args.length===2&&args[0]==='--source-ref'&&args[1]===release));
const sourceRef=args.length?release:null,sourceCache=new Map();
const sourceHash=file=>{
 const name=file.replaceAll('\\','/');
 assert(!name.startsWith('/')&&!name.split('/').includes('..')&&!name.includes(':'));
 // Ignored build outputs are still checked byte-for-byte against their
 // accepted hashes. They are never manufactured from recorded hash values.
 if(!sourceCache.has(name))sourceCache.set(name,sourceRef&&!name.startsWith('dist/')?
   sha256(execFileSync('git',['show',sourceRef+':'+name],{cwd:root,windowsHide:true,maxBuffer:16*1024*1024})):
   hash(path.join(root,name)));
 return sourceCache.get(name);
};
const accepted=read('acceptance.json'),reports=read('reports.json');
assert(accepted.passed);
for(const[file,sha]of Object.entries(accepted.sources))assert.equal(sourceHash(file),sha,file);
for(const[file,sha]of Object.entries(accepted.files))assert.equal(hash(path.join(directory,file)),sha,file);
assert.equal(hash(path.join(root,'baseline/live-equipment/v2/acceptance.json')),accepted.originalBaseline);
for(const[name,report]of Object.entries(reports)){
 assert(report.passed,name);
 for(const[file,sha]of Object.entries(report.sources??{}))assert.equal(sourceHash(file),sha,name+': '+file);
}
const game=reports.unity.packages['com.hollowwake.gameplay'],storage=reports.unity.packages['com.hollowwake.storage'];
for(const pack of [game,storage])
 for(const[file,sha]of Object.entries({...pack.sources,...pack.sdkSources}))assert.equal(sourceHash(file),sha,file);
assert.equal(game.version,'0.3.0-preview.1');assert.equal(storage.version,'0.2.0-preview.1');
assert.equal(game.hashes.CombatRules,reports.native.files['bundle.js']);
assert.equal(game.nativeSha256,reports.native.nativeSha256);
assert.equal(reports.native.requests,37);
assert.equal(reports.native.native.liveBytesAfterDispose,0);assert.equal(reports.native.native.liveBlocksAfterDispose,0);
assert(reports.native.cleaned && reports.protocolFaults.cleaned);
assert.equal(reports.protocolFaults.cases.filter(item=>item.rejected).length,5);
assert(reports.protocolFaults.cases.every(item=>item.rejected?item.exitCode!==0:item.exitCode===0));
assert.equal(reports.unityFaults.cases.filter(item=>item.rejected).length,3);
assert(reports.unityFaults.cases.every(item=>item.rejected?item.exitCode!==0:item.exitCode===0));
assert(reports.unityFaults.cleanupFailureHandled);
assert(reports.unityFaults.originalArchiveUnchanged);
assert(reports.sdk.unchanged);
assert.deepEqual(reports.sdk.results.map(item=>[item.name,item.exitCode,item.signal,item.error]),[
 ['verify',0,null,null],['reference:verify',0,null,null]]);
const sdkLogs=JSON.parse(gunzipSync(fs.readFileSync(path.join(directory,'sdk-logs.json.gz'))));
for(const result of reports.sdk.results)assert.equal(sha256(sdkLogs[result.name]),result.logSha256);
for(const key of ['native','protocolFaults'])assert.equal(hash(path.join(directory,key+'-raw.json.gz')),reports[key].rawSha256);
const observations=JSON.parse(gunzipSync(fs.readFileSync(path.join(directory,'unity-observations.json.gz'))));
for(const stage of ['editor','player']){
 const result=reports.unity.results[stage];assert(result.passed&&result.closed&&result.publicationFailureClosed);
 assert.equal(result.revision,7);assert.equal(result.unity,'2021.3.6f1');
 assert(result.combatPeak<=64*1024*1024&&result.workshopPeak<=32*1024*1024);
 assert.deepEqual(JSON.parse(observations[stage+'-result.json']),result);
 for(const phase of ['equip','remove']){
  const before=JSON.parse(observations[stage+'-'+phase+'-before.json']);
  const after=JSON.parse(observations[stage+'-'+phase+'-after.json']);
  assert.notDeepEqual(before.character,after.character);
  const {character:a,...old}=before,{character:b,...next}=after;assert.deepEqual(next,old);
 }
}
for(const item of reports.unityFaults.cases)assert(observations.faultAssertions[item.name].some(line=>line.includes(item.expectedFailure)));
for(const report of [reports.compatibility,reports.standalone]){
 assert.equal(report.packageSha256,storage.sha256);
 assert(report.processKillRecovery&&report.independentSqliteInspection&&report.relocatedPlayer);
 assert.equal(report.devicePerformanceClaim,false);
}
assert.equal(reports.compatibility.gameplayPackageSha256,'ea56ce53d14a5c0b669ba1dcc05e96e90ea768994ac682e6ec54c5fd38577c76');
assert(reports.compatibility.faultControls.passed);
assert.equal(reports.standalone.gameplayPackageSha256,null);
console.log({passed:true,sourceRef:sourceRef??'working tree',originalCourses:12,nativeRequests:37,protocolFaults:5,unityFaults:3,unity:'2021.3.6f1 Windows x64 Mono'});
