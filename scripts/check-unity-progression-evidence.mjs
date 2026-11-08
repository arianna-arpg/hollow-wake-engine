import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {root,sha256} from './reference-utils.mjs';
const directory=path.join(root,'evidence/unity-progression');
const read=file=>JSON.parse(fs.readFileSync(path.join(directory,file)));
const hash=file=>sha256(fs.readFileSync(file));
const sourceHash=file=>hash(path.join(root,file.replaceAll('\\','/')));
const accepted=read('acceptance.json'),reports=read('reports.json');
assert(accepted.passed && accepted.physicalDeviceQualification===false);
for(const [file,sha]of Object.entries(accepted.files))assert.equal(hash(path.join(directory,file)),sha,file);
for(const [file,sha]of Object.entries(accepted.sources))assert.equal(sourceHash(file),sha,file);
for(const name of ['progression','equipment','faults','sdk']){
  const report=reports[name];assert(report.passed,name);
  for(const [file,sha]of Object.entries(report.sources??{}))assert.equal(sourceHash(file),sha,name+': '+file);
}
const pack=reports.progression.package;
assert(reports.progression.cleaned&&reports.faults.cleaned,'Both complete runs must finish owned-project cleanup');
assert.equal(pack.version,'0.4.0-preview.1');
for(const [file,sha]of Object.entries({...pack.sources,...pack.sdkSources}))assert.equal(sourceHash(file),sha,file);
assert.equal(reports.equipment.packages[pack.name].sha256,pack.sha256);
assert.equal(reports.retained.package.sha256,pack.sha256);
assert.equal(reports.faults.packageSha256,pack.sha256);
assert(pack.progressionRulesBytes<=96*1024);
const observations=JSON.parse(gunzipSync(fs.readFileSync(path.join(directory,'observations.json.gz'))));
const expected=JSON.parse(observations.progression['inputs.json']).expected;
assert.equal(expected.length,104);
for(const stage of ['editor','player']){
  const result=reports.progression.results[stage];
  assert(result.passed&&result.closed&&result.retiredHandle&&result.ownerDisposal&&result.sample);
  assert.equal(result.unity,'2021.3.6f1');assert.equal(result.stage,stage);
  assert(result.peak>0 && result.peak<=32*1024*1024);
  assert.equal(result.steps,104);
  assert.deepEqual(JSON.parse(observations.progression[stage+'-result.json']),result);
  const replies=observations.progression[stage+'-replies.jsonl'].trim().split(/\r?\n/).map(JSON.parse);
  assert.deepEqual(replies,expected,stage+' complete replies');
  const equipment=reports.equipment.results[stage];
  assert(equipment.passed&&equipment.closed&&equipment.publicationFailureClosed);
  assert.equal(equipment.revision,7);
  assert.deepEqual(JSON.parse(observations.equipment[stage+'-result.json']),equipment);
  for(const phase of ['equip','remove']){
    const before=JSON.parse(observations.equipment[stage+'-'+phase+'-before.json']);
    const after=JSON.parse(observations.equipment[stage+'-'+phase+'-after.json']);
    assert.notDeepEqual(before.character,after.character);
    const {character:a,...old}=before,{character:b,...next}=after;assert.deepEqual(next,old);
  }
  const retained=reports.retained[stage];
  assert.equal(retained.combatRequests,60);assert.equal(retained.pouchRequests,2334);assert.equal(retained.workshopRequests,56);
  assert.equal(retained.liveBytes,0);assert.equal(retained.liveBlocks,0);
  assert(retained.saveContinuation&&retained.isolatedActors&&retained.refusedInvalidRestore&&retained.closedHost&&retained.typedPouch);
  assert(retained.typedWorkshop&&retained.workshopContinuation&&retained.workshopIsolation&&retained.workshopClosed);
}
assert(reports.retained.installedFromTarball&&reports.retained.sampleImported&&reports.retained.relocatedPlayer);
assert.equal(reports.retained.playModeExitsWithoutDomainReload,2);
assert(reports.retained.changedPouchAssetRejected&&reports.retained.changedWorkshopAssetRejected);
assert(reports.faults.originalArchiveUnchanged);
assert.deepEqual(reports.faults.cases.map(row=>row.name),
  ['baseline','retired-handle','cross-profile','restore-reset','rules-integrity','content-integrity']);
for(const row of reports.faults.cases){
  assert.equal(row.rejected,row.name!=='baseline');
  assert(row.rejected?row.exitCode!==0:row.exitCode===0);
  assert(observations.faultAssertions[row.name].some(line=>line.includes(row.expectedFailure??'HWE_PROGRESSION_CONTROLS_PASSED')));
}
assert(reports.sdk.unchanged);assert.equal(reports.sdk.results.length,1);
const verification=reports.sdk.results[0];
assert.equal(verification.name,'verify');assert.equal(verification.exitCode,0);assert(!verification.error&&!verification.signal);
assert.equal(sha256(gunzipSync(fs.readFileSync(path.join(directory,'sdk-verify.txt.gz')))),verification.logSha256);
const focused=read('focused-checks.json'),cleanup=read('cleanup.json');
assert(focused.passed&&focused.adapterCases===6&&focused.cleanupControls===5);
for(const[file,sha]of Object.entries(focused.sources))assert.equal(sourceHash(file),sha,file);
assert(focused.adapterLog.includes('pass 6')&&focused.cleanupLog.includes('PASS: five owned-fixture cleanup controls'));
assert(cleanup.passed&&cleanup.foldersRemoved===68&&cleanup.filesRemoved===9635&&cleanup.bytesRemoved===334121759);
console.log({passed:true,version:pack.version,stepsEach:104,catalogue:258,deliberateFaults:3,integrityControls:2,
  retainedEach:{combat:60,pouches:2334,workshop:56},scope:'Unity 2021.3.6f1 Windows x64 Mono; physical devices unmeasured'});
