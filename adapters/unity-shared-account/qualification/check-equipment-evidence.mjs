import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';
import {root,sha256} from '../../../scripts/reference-utils.mjs';import {sourceHasher} from '../../../scripts/evidence-source.mjs';
const dir=path.join(root,'evidence/shared-account-equipment'),read=name=>JSON.parse(fs.readFileSync(path.join(dir,name)));
const accepted=read('acceptance.json'),args=process.argv.slice(2);
assert(args.length===0||(args.length===2&&args[0]==='--source-ref'&&args[1]===accepted.sourceCommit));
assert.equal(accepted.sourceCommit,'5d138fb0b0f8f3271172f002a6e317abb8df9cf9');
assert.equal(accepted.checkerSha256,sha256(fs.readFileSync(path.join(root,'adapters/unity-shared-account/qualification/check-equipment-evidence.mjs'))));
assert(accepted.passed&&accepted.schemaVersion===1);assert.equal(accepted.packagePublication,false);assert.equal(accepted.physicalDeviceQualification,false);assert.equal(accepted.completeSdkQualification,false);
const historical=sourceHasher(accepted.sourceCommit),current=sourceHasher(args.length?accepted.sourceCommit:null);
for(const[file,want]of Object.entries(accepted.files)){assert.equal(path.basename(file),file);assert.equal(sha256(fs.readFileSync(path.join(dir,file))),want,file);}
for(const[file,want]of Object.entries(accepted.sources)){assert.equal(historical(file),want,file);assert.equal(current(file),want,file);}
const unpack=name=>JSON.parse(gunzipSync(fs.readFileSync(path.join(dir,name))));
const r=unpack('reports.json.gz'),o=unpack('observations.json.gz'),parse=text=>JSON.parse(text.replace(/^\uFEFF/,''));
const sourceMap=map=>{for(const[file,want]of Object.entries(map))assert.equal(accepted.sources[file.replaceAll('\\','/')],want,file);};
for(const name of ['original','equipmentFaults','sharedFaults','compatibility']){
 const report=r[name];assert(report.passed&&report.inputsUnchanged,name);if(name!=='original')assert(report.cleaned,name);sourceMap(report.sources);
}
assert.deepEqual(r.original.routes,[{route:'portable',courses:12,steps:74,publications:17},{route:'embedded-text',courses:12,steps:74,publications:17}]);
assert.equal(r.original.fixtureSha256,sha256(fs.readFileSync(path.join(root,'baseline/live-equipment/v2/observations.json.gz'))));
assert(r.sdk.passed&&r.sdk.unchanged);assert.deepEqual(r.sdk.results.map(row=>row.name),['verify','reference:verify']);
for(const[file,want]of Object.entries(r.sdk.sources))assert.equal(historical(file),want,file);
for(const row of r.sdk.results){
 assert.equal(row.exitCode,0);assert(!row.signal&&!row.error);const log=accepted.sdkLogs[row.name];assert.equal(row.logSha256,log.verifiedSha256);
 const bytes=gunzipSync(fs.readFileSync(path.join(dir,log.file)));assert.equal(sha256(bytes),log.publishedSha256);
 if(row.name==='verify'){const text=bytes.toString();assert(/tests 1666/.test(text)&&/pass 1666/.test(text)&&/fail 0/.test(text));assert(/contracts: 33/.test(text)&&/faults: 26/.test(text));}
}
const equipment=r.equipmentFaults.control,shared=r.sharedFaults.control;
assert(equipment.passed&&equipment.cleaned&&equipment.inputsUnchanged);assert(shared.passed&&shared.cleaned&&shared.inputsUnchanged);
sourceMap(equipment.sources);sourceMap(shared.sources);
const packages=equipment.packages;
assert.equal(packages.gameplay.sha256,accepted.gameplaySha256);assert.equal(packages.storage.sha256,accepted.storageSha256);
assert.equal(packages.gameplay.version,'0.6.0-candidate.0');assert.equal(packages.storage.version,'0.5.0-candidate.0');
assert.equal(packages.gameplay.parentSha256,'a34b721bc3cc4649e28a33fe1821d30b508884f0d3b43f659008a2a1305df44c');
assert.equal(packages.storage.parentSha256,'6d22281f2ba07e7631270e9af19bf11d5e512be54254bbc8bb230b574714428b');
assert.equal(packages.gameplay.nativeSha256,'d2562c18b9bfe114b9e674b563332323a4c58da7935c87be380a1dcd8137ca3b');
for(const pack of Object.values(packages)){assert(pack.candidate&&!pack.engineQualified&&!pack.deviceQualified);sourceMap(pack.sources);sourceMap(pack.sdkSources??{});}
assert.deepEqual(shared.packages,packages);
const old=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'evidence/unity-shared-account/reports.json.gz'))));
for(const[name,parent]of [['gameplay',old.typed.package],['storage',old.sharedStorage.packages.storage]]){
 const pack=packages[name];assert.equal(pack.parentSha256,parent.sha256);assert.equal(pack.nativeSha256,parent.nativeSha256);assert.deepEqual(Object.keys(pack.files).sort(),Object.keys(parent.files).sort());
 const changed=Object.keys(pack.files).filter(file=>pack.files[file]!==parent.files[file]);assert.deepEqual(changed.toSorted(),pack.changed.toSorted());assert.equal(pack.preservedFiles,Object.keys(pack.files).length-changed.length);
 for(const file of changed)assert(!file.endsWith('.meta')&&!file.endsWith('.dll')&&!file.startsWith('package/Samples~')&&!file.includes('NOTICE')&&!file.includes('LICENSE'),file);
}
function savedGroup(report,raw,stage,revision){
 const records=report.databases[stage];assert.deepEqual(records.map(row=>row[0]),[10,20,30]);
 if(revision)assert(records.every(row=>row[1]===revision));
 for(const[i,part]of ['account','inventory0','inventory1'].entries())assert.deepEqual(JSON.parse(records[i][2]),parse(raw[stage+'-final-'+part+'.json']));
 return records;
}
function lifecycle(report,raw){
 assert.deepEqual(Object.keys(report.lifecycle),['play-entry-0','play-exit-0','play-entry-1','play-exit-1','reload']);
 for(const[stage,value]of Object.entries(report.lifecycle)){
  assert.deepEqual(value,{passed:true,closed:true,stage});assert.deepEqual(parse(raw[stage+'-lifecycle.json']),value);
  assert.deepEqual(report.databases[stage].map(row=>row.slice(0,2)),[[10,1],[20,1],[30,1]]);
 }
}
const e=o.equipment.control.observations;
for(const stage of ['editor','player']){
 const result=equipment.results[stage];assert.deepEqual(parse(e[stage+'-result.json']),result);assert.equal(result.unity,'2021.3.6f1');
 for(const flag of ['passed','closed','busy','stale','unsupported','publicationFailureClosed','bindings','accountOnlyNoCombatWork','reopened','equipmentReads'])assert(result[flag],flag);
 assert(result.sharedPeak>0&&result.sharedPeak<=48*1024*1024);assert(result.combatPeak>0&&result.combatPeak<=64*1024*1024);
 for(const phase of ['equip','remove'])for(const index of [0,1]){
  const before=parse(e[stage+'-'+phase+'-before-'+index+'.json']),after=parse(e[stage+'-'+phase+'-after-'+index+'.json']);
  assert.notDeepEqual(before.character,after.character);delete before.character;delete after.character;assert.deepEqual(before,after);
 }
 const rows=savedGroup(equipment,e,stage);for(const[i,uid]of [[1,4294967297],[2,4294967298]])assert.equal(JSON.parse(rows[i][2]).workshop.state.equipped.ring1.uid,uid);
}
lifecycle(equipment,e);
for(const stage of Object.keys(equipment.lifecycle))for(const[i,part]of ['account','inventory0','inventory1'].entries())assert.deepEqual(JSON.parse(equipment.databases[stage][i][2]),parse(e[stage+'-initial-'+part+'.json']));
const s=o.shared.control.observations,prior=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'evidence/prepared-account/observations.json.gz'))));
assert.deepEqual(parse(s['expected.json']),parse(prior.storage['expected.json']));
function sharedCourse(report,raw){
 const expected=parse(raw['expected.json']);assert.deepEqual(expected,parse(s['expected.json']));
 for(const stage of ['editor','player']){
  const result=report.results[stage];assert.deepEqual(parse(raw[stage+'-result.json']),result);assert.equal(result.unity,'2021.3.6f1');
  for(const flag of ['passed','closed','policyRollback','exceptionRollback','invalidRollback','busy','staleDependency','reopened','publicationFailureClosed','incompleteGroupRefused'])assert(result[flag],flag);
  assert(['committed','cancelled'].includes(result.cancellation));
  for(const[name,rows]of Object.entries(expected))for(const[i,part]of ['account','inventory0','inventory1'].entries())assert.deepEqual(parse(raw[stage+'-'+name+'-'+part+'.json']),rows[i]);
  savedGroup(report,raw,stage);
 }
 lifecycle(report,raw);
}
sharedCourse(shared,s);
for(const[name,report,raw,count]of [['equipment',r.equipmentFaults,o.equipment,8],['shared',r.sharedFaults,o.shared,6]]){
 assert.equal(report.faults.length,count);assert.equal(new Set(report.faults.map(row=>row.name)).size,count);
 for(const fault of report.faults){
  assert(fault.detected);const captured=raw[fault.name];assert(captured.status!==0&&!captured.report.passed&&captured.report.cleaned&&captured.report.inputsUnchanged);
  assert(captured.report.failure.includes(fault.assertion));assert.equal(captured.report.packages.storage.sha256,fault.archiveSha256);
  assert.equal(captured.report.packages.storage.files['package/Runtime/GameplayBridge/DurableSharedAccount.cs'],fault.sourceSha256);
 }
}
const partial=r.equipmentFaults.partialPublication,partialRaw=o.equipment['partial-publication'];
assert(partial.passed&&partial.report.passed&&partialRaw.status===0);assert.deepEqual(partialRaw.report,partial.report);
savedGroup(partial.report,partialRaw.observations,'publication-failure',2);
const compatibility=r.compatibility;assert(compatibility.standalone.passed&&compatibility.mixed.passed);assert.equal(compatibility.nativeProvenanceParent,packages.storage.parentSha256);
assert.deepEqual(compatibility.originalStoragePackage,packages.storage);assert.equal(compatibility.standalone.packageSha256,packages.storage.sha256);
assert(compatibility.standalone.processKillRecovery&&compatibility.standalone.independentSqliteInspection);assert.equal(compatibility.standalone.gameplayPackageSha256,null);
assert.equal(compatibility.mixed.gameplaySourceRef,'98edfa74a4b9caecf6e0e6ef3ce49cb4365966f8');assert.deepEqual(compatibility.mixed.packages.gameplay,old.typed.package);assert.deepEqual(compatibility.mixed.packages.storage,packages.storage);
const oldSource=sourceHasher(compatibility.mixed.gameplaySourceRef);for(const field of ['sources','sdkSources'])for(const[file,want]of Object.entries(old.typed.package[field]))assert.equal(oldSource(file),want,file);
sharedCourse(compatibility.mixed,o.compatibility.mixed);
console.log({passed:true,source:accepted.sourceCommit,originalCoursesEach:12,originalStepsEach:74,sdkTests:1666,equipmentFaults:8,sharedSaveFaults:6,partialPublicationRecovery:true,lifecycleEach:5,oldGameplayCompatibility:true,packagePublication:false,physicalDeviceQualification:false});
