import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';
import {root,sha256} from './reference-utils.mjs';import {sourceHasher} from './evidence-source.mjs';
const read=file=>JSON.parse(fs.readFileSync(file)),unpack=file=>JSON.parse(gunzipSync(fs.readFileSync(file)));
const dir=path.join(root,'evidence/unity-shared-account'),accepted=read(path.join(dir,'acceptance.json'));
const args=process.argv.slice(2);assert(args.length===0||(args.length===2&&args[0]==='--source-ref'&&args[1]===accepted.sourceCommit));
const hash=sourceHasher(args.length?accepted.sourceCommit:null),historical=sourceHasher(accepted.sourceCommit);
assert(accepted.passed&&accepted.schemaVersion===1);assert.equal(accepted.physicalDeviceQualification,false);assert.equal(accepted.completeSdkQualification,false);
for(const[file,want]of Object.entries(accepted.files)){assert.equal(path.basename(file),file);assert.equal(sha256(fs.readFileSync(path.join(dir,file))),want,file);}
for(const[file,want]of Object.entries(accepted.sources)){assert.equal(hash(file),want,file);assert.equal(historical(file),want,file);}
for(const[name,field]of [['prepared-account','preparedEvidenceSha256'],['unity-runtime-cleanup','parentEvidenceSha256']])assert.equal(sha256(fs.readFileSync(path.join(root,'evidence',name,'acceptance.json'))),accepted[field]);
const r=unpack(path.join(dir,'reports.json.gz')),o=unpack(path.join(dir,'observations.json.gz'));
const parse=text=>JSON.parse(text.replace(/^\uFEFF/,'')),rows=text=>text.replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(JSON.parse);
const sources=map=>{for(const[file,want]of Object.entries(map))assert.equal(accepted.sources[file],want,file);};
for(const[name,report]of Object.entries(r)){assert(report.passed,name);assert(report.cleaned||name==='equipment',name);assert.notEqual(report.inputsUnchanged,false);sources(report.sources);}
const gameplay=r.typed.package,storage=r.sharedStorage.packages.storage;
assert.equal(gameplay.version,'0.5.0-preview.1');assert.equal(storage.version,'0.4.0-preview.1');
assert.equal(gameplay.sha256,accepted.gameplaySha256);assert.equal(storage.sha256,accepted.storageSha256);
assert.equal(gameplay.nativeSha256,'d2562c18b9bfe114b9e674b563332323a4c58da7935c87be380a1dcd8137ca3b');
for(const p of [gameplay,storage])sources(p.sources);sources(gameplay.sdkSources);
assert.deepEqual(r.sharedStorage.packages.gameplay,gameplay);
for(const name of ['equipment','accountStorage']){assert.deepEqual(r[name].packages[gameplay.name],gameplay);assert.deepEqual(r[name].packages[storage.name],storage);}
assert.deepEqual(r.progression.package,gameplay);assert.deepEqual(r.retained.result.package,gameplay);assert.deepEqual(r.standalone.originalPackage,storage);
const {nativeSources,...standalonePackage}=r.standalone.result.package;assert.deepEqual(standalonePackage,storage);sources(nativeSources);
assert.equal(r.standalone.nativeProvenanceParent,storage.parentSha256);
const prior=unpack(path.join(root,'evidence/unity-runtime-cleanup/reports.json.gz'));
for(const[p,parentFiles,parentSha]of [[gameplay,prior.progression.package.archiveChanges.files,prior.progression.package.sha256],[storage,prior.accountStorage.packages[storage.name].files,prior.accountStorage.packages[storage.name].sha256]]){
 assert.equal(p.parentSha256,parentSha);
 assert.deepEqual(p.changed,['package/README.md',p===gameplay?'package/Runtime/GameplayHost.cs':'package/Runtime/GameplayBridge/HollowWake.Storage.Gameplay.asmdef','package/package.json']);
 // The older storage receipt lists payloads without the package/ prefix and
 // omits generated .meta files. The actual-archive controls compare those too.
 assert.equal(p.preservedFiles,Object.keys(p.files).length-p.added.length-p.changed.length);
 for(const[name,want]of Object.entries(parentFiles)){
  const file=name.startsWith('package/')?name:'package/'+name;
  if(!p.changed.includes(file))assert.equal(p.files[file],want,file);
 }
}
assert.deepEqual(r.archives.packages,{gameplay:gameplay.sha256,storage:storage.sha256});assert.equal(r.archives.controls.length,10);assert.equal(new Set(r.archives.controls).size,10);
const previous=unpack(path.join(root,'evidence/prepared-account/observations.json.gz'));
const expectedTyped=parse(previous.typed['expected.json']);assert.equal(expectedTyped.length,84);assert.deepEqual(parse(o.typed['expected.json']),expectedTyped);
const previousFull=unpack(path.join(root,'evidence/unity-runtime-cleanup/observations.json.gz'));
const expectedProgression=parse(previousFull.progression['inputs.json']).expected;
const oldAccount=parse(previousFull.accountStorage['inputs.json']),accountInput=parse(o.accountStorage['inputs.json']);
assert.deepEqual(accountInput.expected,oldAccount.expected);assert.deepEqual(accountInput.sampleExpected,oldAccount.sampleExpected);
function shared(report,raw){
 const expected=parse(raw['expected.json']);assert.deepEqual(expected,parse(previous.storage['expected.json']));
 for(const stage of ['editor','player']){
  const result=report.results[stage];assert.deepEqual(parse(raw[stage+'-result.json']),result);
  for(const key of ['passed','closed','policyRollback','exceptionRollback','invalidRollback','busy','staleDependency','reopened','publicationFailureClosed','incompleteGroupRefused'])assert(result[key],key);
  assert.equal(result.unity,'2021.3.6f1');assert(result.peak>0&&result.peak<=48*1024*1024);assert(['committed','cancelled'].includes(result.cancellation));
  for(const[name,want]of Object.entries(expected))for(const[i,part]of ['account','inventory0','inventory1'].entries())assert.deepEqual(parse(raw[stage+'-'+name+'-'+part+'.json']),want[i]);
  const final=report.databases[stage];assert.deepEqual(final.map(row=>row[0]),[10,20,30]);
  for(const[i,part]of ['account','inventory0','inventory1'].entries())assert.deepEqual(JSON.parse(final[i][2]),parse(raw[stage+'-final-'+part+'.json']));
 }
 assert.deepEqual(Object.keys(report.lifecycle),['play-entry-0','play-exit-0','play-entry-1','play-exit-1','reload']);
 for(const[stage,result]of Object.entries(report.lifecycle)){
  assert.deepEqual(result,{passed:true,closed:true,stage});assert.deepEqual(parse(raw[stage+'-lifecycle.json']),result);
  const saved=report.databases[stage];assert.deepEqual(saved.map(row=>row.slice(0,2)),[[10,1],[20,1],[30,1]]);assert.deepEqual(saved.map(row=>JSON.parse(row[2])),expected.initial);
 }
}
shared(r.sharedStorage,o.sharedStorage);shared(r.faults.control,o.faultControl);
for(const stage of ['editor','player']){
 const typed=r.typed.results[stage];assert.deepEqual(parse(o.typed[stage+'-result.json']),typed);assert.equal(typed.steps,84);assert(typed.peak>0&&typed.peak<=32*1024*1024);
 for(const key of ['passed','closed','retiredAccount','retiredInventory','retiredCommand','ownerDisposal','foreignOwner','documentationExample'])assert(typed[key],key);
 const replies=rows(o.typed[stage+'-replies.jsonl']);for(const row of replies)if(Object.hasOwn(row,'text'))row.text=JSON.parse(row.text);assert.deepEqual(replies,expectedTyped);
 assert.equal(parse(o.typed[stage+'-documentation-account.json']).progression.account.credits,970);
 assert(!Object.hasOwn(parse(o.typed[stage+'-documentation-inventory.json']).workshop.state,'account'));
 const progression=r.progression.results[stage];assert.deepEqual(parse(o.progression[stage+'-result.json']),progression);
 for(const key of ['passed','closed','retiredHandle','ownerDisposal','sample'])assert(progression[key]);assert.equal(progression.steps,104);assert(progression.peak<=32*1024*1024);
 assert.deepEqual(rows(o.progression[stage+'-replies.jsonl']),expectedProgression);
 const equipment=r.equipment.results[stage];assert.deepEqual(parse(o.equipment[stage+'-result.json']),equipment);assert(equipment.passed&&equipment.closed&&equipment.publicationFailureClosed&&equipment.revision===7);
 for(const phase of ['equip','remove']){const{character:a,...before}=parse(o.equipment[stage+'-'+phase+'-before.json']),{character:b,...after}=parse(o.equipment[stage+'-'+phase+'-after.json']);assert.notDeepEqual(a,b);assert.deepEqual(before,after);}
 const retained=r.retained.result[stage];assert.deepEqual(parse(o.retained[stage+'.json']),retained);assert.equal(retained.liveBytes,0);assert.equal(retained.liveBlocks,0);
 for(const[field,count]of [['combat',60],['pouches',2334],['workshop',56]]){
  const replies=rows(o.retained[stage+'-'+field+'.replies']),expected=rows(o.retained[field+'.expected']);assert.equal(replies.length,count);assert.equal(expected.length,count);assert.deepEqual(expected,rows(previousFull.retained[field+'.expected']));
  if(field!=='pouches'){assert.deepEqual(replies,expected);continue;}
  for(const[i,want]of expected.entries()){
   const got=replies[i];assert.equal(got.ok,want.ok);
   if(Object.hasOwn(want,'gem')){assert.equal(got.nextUid,want.nextUid);assert.equal(got.items.length,1);assert.deepEqual(got.items[0].gem,want.gem);}
   else if(Object.hasOwn(want,'result')){assert.deepEqual(got.result,want.result);assert.deepEqual(got.items.at(-1),want.item);assert.deepEqual(got.items.map(item=>item.uid),want.order);assert.deepEqual(got.items.find(item=>item.uid===want.pouch)?.mem??null,want.remaining);assert.deepEqual(got.ledger,want.ledger);assert.deepEqual(got.memory.secondary,want.secondary);assert.deepEqual(got.memory.seatLedger,want.seatLedger);}
   else for(const[key,value]of Object.entries(want))assert.deepEqual(got[key],value);
  }
 }
 const account=r.accountStorage.results[stage];assert.deepEqual(parse(o.accountStorage[stage+'-result.json']),account);
 for(const key of ['passed','closed','accountRefusal','workshopRollback','busy','stale','invalidReload','publicationFailureClosed'])assert(account[key]);
 for(const label of ['initial','pair','equipped','continued','cancellation','publication-failure']){
  const expected=label==='cancellation'?(account.cancellation==='committed'?'cancel-committed':'continued'):label;
  for(const owner of ['account','workshop'])assert.deepEqual(parse(o.accountStorage[stage+'-'+label+'-'+owner+'.json']),accountInput.expected[expected][owner]);
 }
}
const retained=r.retained.result;assert(retained.installedFromTarball&&retained.sampleImported&&retained.relocatedPlayer&&retained.changedPouchAssetRejected&&retained.changedWorkshopAssetRejected);assert.equal(retained.playModeExitsWithoutDomainReload,2);
for(const[stage,result]of Object.entries(r.accountStorage.lifecycle)){assert.deepEqual(result,{passed:true,closed:true,stage});assert.deepEqual(parse(o.accountStorage[stage+'-lifecycle.json']),result);}
for(const stage of ['sample-editor','sample-player']){
 assert.deepEqual(r.accountStorage.sample[stage],{passed:true,closed:true});
 for(const label of ['initial','memory','forge','continued'])for(const owner of ['account','workshop'])assert.deepEqual(parse(o.accountStorage[stage+'-'+label+'-'+owner+'.json']),accountInput.sampleExpected[label][owner]);
}
assert.equal(r.accountStorage.faults.length,4);for(const fault of r.accountStorage.faults)assert(fault.detected&&o.accountStorage.faultAssertions[fault.name].some(line=>line.startsWith('Exception: '+fault.assertion)));
assert.equal(r.faults.basePackageSha256,storage.sha256);assert.equal(r.faults.faults.length,6);
for(const fault of r.faults.faults){const row=o.faults[fault.name];assert(fault.detected&&row.status!==0&&!row.report.passed&&row.report.cleaned);assert.equal(row.report.packages.storage.faultControl.baseSha256,storage.sha256);assert(row.assertions.some(line=>line.startsWith('Exception: '+fault.assertion)));}
const standalone=r.standalone.result;assert(standalone.passed&&standalone.processKillRecovery&&standalone.independentSqliteInspection&&standalone.relocatedPlayer);assert.equal(standalone.gameplayPackageSha256,null);assert.equal(standalone.gameplayPackageRequired,false);
for(const[stage,result]of Object.entries(standalone.results))assert.deepEqual(parse(o.standalone[stage+'.json']),result);
for(const stage of ['editor','player'])for(const key of ['paired','stale','rollback','asyncOwnership','exactText','bounds','disposal'])assert(standalone.results[stage][key]);
for(const stage of ['quit-cleanup','play-exit','before-reload'])assert(standalone.results[stage].closed);
for(const stage of ['recover','confirm'])assert(standalone.results[stage].exactText&&standalone.results[stage].revision===2);
for(const[name,raw]of Object.entries(o))if(name!=='faults')assert(Object.keys(raw).every(file=>!file.endsWith('.log')));
console.log({passed:true,gameplay:gameplay.version,storage:storage.version,sharedStepsEach:84,progressionStepsEach:104,retainedEach:{combat:60,pouches:2334,workshop:56},sharedLifecycle:5,durableFaults:10,archiveControls:10,physicalDeviceQualification:false});
