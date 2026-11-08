import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {root,sha256} from '../../../scripts/reference-utils.mjs';
import {sourceHasher} from '../../../scripts/evidence-source.mjs';

// Check the inherited runtime/failure evidence too; a preview version alone
// cannot promote a partial or incompatible development result.
for(const[script,ref]of [
 ['check-equipment-evidence.mjs','5d138fb0b0f8f3271172f002a6e317abb8df9cf9'],
 ['check-equipment-retained.mjs','4fb5c72b3bbccff87d748a6624e4594658c30975'],
])execFileSync(process.execPath,[path.join(root,'adapters/unity-shared-account/qualification',script),'--source-ref',ref],{cwd:root,stdio:'pipe'});
const read=file=>JSON.parse(fs.readFileSync(file));
const unpack=file=>JSON.parse(gunzipSync(fs.readFileSync(file)));
const dir=path.join(root,'evidence/unity-shared-equipment'),accepted=read(path.join(dir,'acceptance.json'));
const args=process.argv.slice(2);assert(args.length===0||(args.length===2&&args[0]==='--source-ref'&&args[1]===accepted.sourceCommit));
assert(accepted.passed&&accepted.schemaVersion===1&&accepted.installedPackageQualification);
assert.equal(accepted.physicalDeviceQualification,false);assert.equal(accepted.completeSdkQualification,false);
const current=sourceHasher(args.length?accepted.sourceCommit:null),historical=sourceHasher(accepted.sourceCommit);
for(const[file,want]of Object.entries(accepted.sources)){assert.equal(current(file),want,file);assert.equal(historical(file),want,file);}
for(const[ref,files]of Object.entries(accepted.historicalSources)){
 assert.equal(ref,'98edfa74a4b9caecf6e0e6ef3ce49cb4365966f8');const hash=sourceHasher(ref);
 for(const[file,want]of Object.entries(files))assert.equal(hash(file),want,file);
}
for(const[file,want]of Object.entries(accepted.tools))assert.equal(sha256(fs.readFileSync(path.join(root,file))),want,file);
for(const[file,want]of Object.entries(accepted.files)){assert.equal(path.basename(file),file);assert.equal(sha256(fs.readFileSync(path.join(dir,file))),want,file);}
for(const[folder,field]of [['shared-account-equipment','developmentEvidenceSha256'],['shared-account-equipment/retained','retainedEvidenceSha256']])assert.equal(sha256(fs.readFileSync(path.join(root,'evidence',folder,'acceptance.json'))),accepted[field]);
const r=unpack(path.join(dir,'reports.json.gz')),o=unpack(path.join(dir,'observations.json.gz'));
assert.deepEqual(Object.keys(r).sort(),['archives','compatibility','equipment','gameplay']);
function sources(value,location=[]){
 if(Array.isArray(value)){for(const child of value)sources(child,location);return;}
 if(!value||typeof value!=='object')return;
 for(const[field,child]of Object.entries(value)){
  if(['sources','sdkSources','nativeSources'].includes(field)){
   const mapping=location.join('.')==='compatibility.mixed.packages.gameplay'?accepted.historicalSources['98edfa74a4b9caecf6e0e6ef3ce49cb4365966f8']:accepted.sources;
   for(const[file,want]of Object.entries(child))assert.equal(mapping[file.replaceAll('\\','/')],want,file);
  }else sources(child,[...location,field]);
 }
}
for(const[name,report]of Object.entries(r)){assert(report.passed&&report.cleaned&&report.inputsUnchanged,name);sources(report,[name]);}
const prior=unpack(path.join(root,'evidence/shared-account-equipment/reports.json.gz'));
const old=unpack(path.join(root,'evidence/shared-account-equipment/observations.json.gz'));
const retained=unpack(path.join(root,'evidence/shared-account-equipment/retained/reports.json.gz'));
const retainedRaw=unpack(path.join(root,'evidence/shared-account-equipment/retained/observations.json.gz'));
const packages=r.equipment.packages;
for(const[name,version]of [['gameplay','0.6.0-preview.1'],['storage','0.5.0-preview.1']]){
 const pack=packages[name],parent=prior.equipmentFaults.control.packages[name];
 assert.equal(pack.version,version);assert.equal(accepted[name+'Version'],version);assert.equal(pack.sha256,accepted[name+'Sha256']);
 assert.equal(pack.parentSha256,parent.sha256);assert.equal(pack.nativeSha256,parent.nativeSha256);
 assert.equal(pack.parentReceiptSha256,sha256(JSON.stringify(parent,null,2)+'\n'));
 assert(pack.runtimeIdenticalToCandidate&&pack.candidate&&!pack.engineQualified&&!pack.deviceQualified);
 assert.deepEqual(pack.changed,['package/README.md','package/package.json']);assert.deepEqual(pack.added,['package/Documentation~/SharedEquipment.md']);
 assert.deepEqual(Object.keys(pack.files).sort(),[...Object.keys(parent.files),...pack.added].sort());
 const runtime=Object.keys(parent.files).filter(file=>file.startsWith('package/Runtime/'));assert.equal(runtime.length,pack.preservedRuntimeFiles);
 for(const[file,sha]of Object.entries(parent.files))if(!pack.changed.includes(file))assert.equal(pack.files[file],sha,file);
 assert.equal(pack.preservedFiles,Object.keys(parent.files).length-pack.changed.length);
 assert.deepEqual(r.archives.packages[name],pack);
}
assert.deepEqual(r.archives.controls,['gameplay-exact-rebuild','gameplay-identical-runtime','gameplay-preserved-samples-and-guids','storage-exact-rebuild','storage-identical-runtime','storage-preserved-samples-and-guids','existing-output','altered-candidate-archive','altered-candidate-receipt']);
const{qualificationMetadata,...gameplayView}=r.gameplay.result.package;
assert.deepEqual(gameplayView,packages.gameplay);
const meta=r.gameplay.metadata.gameplay;
assert.equal(meta.archiveSha256,packages.gameplay.sha256);assert.equal(meta.receiptSha256,sha256(JSON.stringify(packages.gameplay,null,2)+'\n'));
assert.deepEqual(qualificationMetadata,{originalReceiptSha256:meta.receiptSha256,resourceHashesDerivedFromVerifiedMembers:true,archiveUnchanged:true});
assert.equal(meta.supplementalReceiptSha256,sha256((JSON.stringify(r.gameplay.result.package,null,2)+'\n').replaceAll('\n','\r\n')));
assert.deepEqual(meta.resourceHashes,packages.gameplay.hashes);
assert.deepEqual(r.compatibility.originalStoragePackage,packages.storage);
assert.equal(r.compatibility.runtimeCandidateParent,packages.storage.parentSha256);
assert.equal(r.compatibility.runtimeCandidateEvidenceSha256,accepted.developmentEvidenceSha256);
assert.equal(r.compatibility.nativeProvenanceParent,'6d22281f2ba07e7631270e9af19bf11d5e512be54254bbc8bb230b574714428b');
assert.deepEqual(r.compatibility.mixed.packages.storage,packages.storage);
assert.deepEqual(r.compatibility.mixed.packages.gameplay,prior.compatibility.mixed.packages.gameplay);
assert.equal(r.compatibility.mixed.gameplaySourceRef,'98edfa74a4b9caecf6e0e6ef3ce49cb4365966f8');
const{nativeSources,...storageView}=r.compatibility.standalone.package;assert.deepEqual(storageView,packages.storage);assert(nativeSources);
assert.equal(r.compatibility.standalone.packageSha256,packages.storage.sha256);
for(const flag of ['passed','processKillRecovery','independentSqliteInspection','relocatedPlayer'])assert(r.compatibility.standalone[flag],flag);
assert.equal(r.compatibility.standalone.gameplayPackageSha256,null);
function parseObservation(file,text){
 const value=text.replace(/^\uFEFF/,'');
 return file.endsWith('.json')?JSON.parse(value):value.trim().split(/\r?\n/).map(JSON.parse);
}
function metrics(value){
 const{run,singleStepMicroseconds,catchUpMicroseconds,...stable}=value;
 assert.match(run,/^[0-9a-f]{32}$/);
 for(const times of [singleStepMicroseconds,catchUpMicroseconds]){assert.equal(times.length,4);assert(times.every(n=>Number.isFinite(n)&&n>0));}
 return stable;
}
function standalone(value,run){
 assert.match(run,/^[0-9a-f]{32}$/);assert.equal(value.run,run);
 const{run:ignored,...state}=value;return state;
}
function compare(raw,expected,mode=null){
 assert.deepEqual(Object.keys(raw).sort(),Object.keys(expected).sort());
 for(const[file,text]of Object.entries(raw)){
  assert(!file.endsWith('.log'));let actual=parseObservation(file,text),wanted=parseObservation(file,expected[file]);
  if(mode==='gameplay'&&['editor.json','player.json'].includes(file)){actual=metrics(actual);wanted=metrics(wanted);}
  if(mode==='standalone'){
   actual=standalone(actual,r.compatibility.standalone.run);
   wanted=standalone(wanted,prior.compatibility.standalone.run);
  }
  assert.deepEqual(actual,wanted,file);
 }
}
compare(o.equipment,old.equipment.control.observations);
for(const field of ['results','lifecycle','databases'])assert.deepEqual(r.equipment[field],prior.equipmentFaults.control[field]);
assert.equal(r.equipment.mode,'complete');
compare(o.compatibility.mixed,old.compatibility.mixed);
for(const field of ['results','lifecycle','databases'])assert.deepEqual(r.compatibility.mixed[field],prior.compatibility.mixed[field]);
compare(o.compatibility.standalone,old.compatibility.standalone,'standalone');
assert.deepEqual(Object.keys(r.compatibility.standalone.results),Object.keys(prior.compatibility.standalone.results));
for(const[stage,result]of Object.entries(r.compatibility.standalone.results)){
 assert.deepEqual(parseObservation(stage+'.json',o.compatibility.standalone['standalone/'+stage+'.json']),result);
 assert.deepEqual(standalone(result,r.compatibility.standalone.run),standalone(prior.compatibility.standalone.results[stage],prior.compatibility.standalone.run));
}
compare(o.gameplay,retainedRaw.gameplay,'gameplay');
const g=r.gameplay.result;
assert.equal(g.editor.run,g.player.run);
for(const stage of ['editor','player']){
 assert.deepEqual(parseObservation(stage+'.json',o.gameplay[stage+'.json']),g[stage]);
 assert.deepEqual(metrics(g[stage]),metrics(retained.gameplay.result[stage]));
}
for(const field of ['contentComparison','installedFromTarball','sampleImported','relocatedPlayer','playModeExitsWithoutDomainReload','changedPouchAssetRejected','changedWorkshopAssetRejected','nativePluginSha256','originalPouchCuts','originalPouchActions','combatControlRequests'])assert.deepEqual(g[field],retained.gameplay.result[field]);
assert.equal(g.nativePluginSha256,packages.gameplay.nativeSha256);
console.log({passed:true,source:accepted.sourceCommit,versions:{gameplay:packages.gameplay.version,storage:packages.storage.version},freshEquipment:true,freshImportedSample:true,standaloneAndPreviousGameplay:true,archiveControls:9,inheritedRuntimeFaults:18,physicalDeviceQualification:false});
