import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';
import {root,sha256} from './reference-utils.mjs';
import {qualifiedRuntimeSources,verifyQualifiedRuntime} from '../experiments/embedded-js/patches/verify-qualified-runtime.mjs';
const directory=path.join(root,'evidence/unity-runtime-cleanup');
const read=file=>JSON.parse(fs.readFileSync(file)),unpack=file=>JSON.parse(gunzipSync(fs.readFileSync(file)));
const accepted=read(path.join(directory,'acceptance.json')),reports=unpack(path.join(directory,'reports.json.gz'));
const observations=unpack(path.join(directory,'observations.json.gz'));
assert(accepted.passed&&accepted.physicalDeviceQualification===false&&accepted.automaticCollection===false);
for(const[file,hash]of Object.entries(accepted.files))assert.equal(sha256(fs.readFileSync(path.join(directory,file))),hash,file);
for(const[file,hash]of Object.entries(accepted.sources)){
 assert(!path.isAbsolute(file)&&!file.includes('..'));assert.equal(sha256(fs.readFileSync(path.join(root,file))),hash,file);
}
const pack=reports.progression.package,parent=read(path.join(root,'evidence/unity-progression/reports.json')).progression.package;
assert.equal(pack.version,'0.4.1-preview.1');assert.equal(pack.sha256,accepted.gameplaySha256);
assert.equal(pack.parentPackageSha256,parent.sha256);assert.equal(pack.parentReceiptSha256,sha256(JSON.stringify(parent)));
assert.equal(pack.historicalSdkPackageMetadataSha256,parent.sdkSources['package.json']);
assert.equal(pack.engineQualified,false);assert.equal(pack.deviceQualified,false);
const changes=pack.archiveChanges,nativeName='package/Runtime/Native/Windows/hwe_embedded.dll';
assert.deepEqual(changes.changed.sort(),[nativeName,'package/package.json'].sort());
assert.deepEqual(changes.added,['package/Documentation~/NativeRuntime.json']);assert.equal(changes.preservedFiles,62);
for(const[file,hash]of Object.entries(changes.parentFiles))if(!changes.changed.includes(file))assert.equal(changes.files[file],hash,file);
assert.equal(changes.files[nativeName],accepted.nativeSha256);
for(const name of ['equipment','accountStorage']){
 assert(reports[name].passed);assert.deepEqual(reports[name].packages[pack.name],pack);
 assert.equal(reports[name].packages['com.hollowwake.storage'].sha256,'b42636e1e0b6f2b1ca7903a4a3b8774ba31c7d31207097f1f01dd961b183706c');
}
assert.deepEqual(reports.retained.package,pack);assert.equal(reports.retained.nativePluginSha256,accepted.nativeSha256);
assert(reports.runner.passed&&reports.runner.results.length===3&&reports.runner.results.every(row=>row.status===0&&!row.signal&&!row.error));
for(const[name,count]of [['runtime',14],['archive',13]]){
 const r=reports.controls[name];assert(r.passed&&r.cleaned);assert.equal(r.controls,count);assert.equal(new Set(r.names).size,count);
}
const native=read(path.join(directory,'native.json'));assert.deepEqual(native,reports.native);
assert(native.passed&&native.cleaned&&native.inputsUnchanged&&native.upstreamUnchanged&&native.preparedUnchanged);
assert.equal(native.files['hwe_embedded.dll'],accepted.nativeSha256);assert.equal(pack.nativeBuildReceiptSha256,sha256(fs.readFileSync(path.join(directory,'native.json'))));
assert.deepEqual(Object.keys(native.sources),qualifiedRuntimeSources);
const rawBytes=fs.readFileSync(path.join(directory,'native-raw.json.gz'));assert.equal(sha256(rawBytes),native.rawSha256);
const raw=JSON.parse(gunzipSync(rawBytes));assert.equal(sha256(raw.runner),native.sources['experiments/embedded-js/patches/build-qualified-runtime.mjs']);
const capsule=fs.readFileSync(path.join(root,'evidence/native-cstring-cleanup/native-followthrough/inputs.json.gz'));
assert.equal(sha256(capsule),native.capsuleSha256);
const expectedNative=JSON.parse(JSON.parse(gunzipSync(capsule))['courses.json']).flatMap(course=>course.rows).map(row=>row.reply);
const rows=text=>text.replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(JSON.parse);
assert.equal(expectedNative.length,579);assert.deepEqual(native.rows.map(row=>row.variant),['original','patched']);
for(const row of native.rows){
 assert.deepEqual(row.consumers.map(c=>c.name),['cpp','dotnet']);
 for(const consumer of row.consumers){
  const capture=raw[row.variant][consumer.name];assert.deepEqual(capture.process,{status:0,signal:null,error:null});assert.equal(capture.stderr,'');
  assert.deepEqual(JSON.parse(capture.stdout),consumer.stats);assert.deepEqual(rows(capture.replies),expectedNative);
  assert(consumer.stats.passed&&consumer.stats.requests===579&&consumer.stats.liveBytesAfterDispose===0&&consumer.stats.liveBlocksAfterDispose===0);
 }
 assert.deepEqual(JSON.parse(raw[row.variant].lowMemory.stdout),row.memory.rows);
 const[low,roomy]=row.memory.rows;assert.equal(low.heapMiB,32);assert.equal(low.error,"AssertionError(('submit', 4))");
 assert.equal(low.failedMetrics.poisoned,1);assert.equal(low.retryStatus,5);assert.equal(low.copyStatus,8);assert.equal(low.retryLength,0);assert.equal(low.copyWritten,0);
 assert.deepEqual(low.afterRejectedRetry,low.failedMetrics);assert.equal(low.destroyStatus,row.variant==='original'?11:0);assert.equal(low.remainingBytes,row.variant==='original'?86410:0);
 assert(roomy.heapMiB===48&&roomy.coursePassed&&roomy.commands===579&&roomy.destroyStatus===0&&roomy.remainingBytes===0);
}
const collection=reports.collection,collectionBytes=fs.readFileSync(path.join(directory,'collection-raw.json.gz'));
assert(collection.passed&&collection.cleaned&&collection.inputsUnchanged);assert.equal(sha256(collectionBytes),collection.rawSha256);
assert.equal(collection.nativeSha256,accepted.nativeSha256);assert.equal(collection.runtimeReceiptSha256,pack.nativeBuildReceiptSha256);
const collectionRaw=JSON.parse(gunzipSync(collectionBytes)),answers=rows(collectionRaw.replies);
const workshop=rows(unpack(path.join(root,'evidence/unity-workshop/replay.json.gz'))['workshop.expected']);
assert.equal(answers.length,450);assert(answers[0].ok&&answers[1].ok);
for(let i=2;i<450;i++)assert.deepEqual(answers[i],workshop[(i-2)%56]);
assert.deepEqual(collection.rows.map(row=>row.mode),['none','configured','every-release']);
for(const r of collection.rows){
 const capture=collectionRaw[r.mode];assert.equal(capture.status,0);assert(!capture.error&&!capture.signal);
 assert.deepEqual(capture.stderr.trim().split(/\r?\n/),['ABI contracts','collection contracts','create replay host',...[2,58,114,170,226,282,338,394,450].map(n=>'replay '+n)].map(text=>'collection-progress: '+text));
 const{mode,replySha256,...stats}=r;assert.deepEqual(JSON.parse(capture.stdout),stats);assert.equal(replySha256,sha256(collectionRaw.replies));
 assert(r.passed&&r.contracts&&r.requests===450&&r.closedBytes===0&&r.closedBlocks===0&&r.peakBytes<=32*1024*1024);
 assert.equal(r.collections,mode==='none'?0:mode==='configured'?1:450);
}
const originalProgression=unpack(path.join(root,'evidence/unity-progression/observations.json.gz')).progression;
const expectedProgression=JSON.parse(originalProgression['inputs.json']).expected;
assert.deepEqual(JSON.parse(observations.progression['inputs.json']).expected,expectedProgression);
const account=reports.accountStorage,accountRaw=observations.accountStorage,inputs=JSON.parse(accountRaw['inputs.json']);
const originalAccount=JSON.parse(unpack(path.join(root,'evidence/unity-account-storage/observations.json.gz'))['inputs.json']);
assert.deepEqual(inputs.expected,originalAccount.expected);assert.deepEqual(inputs.sampleExpected,originalAccount.sampleExpected);
for(const stage of ['editor','player']){
 const progression=reports.progression.results[stage];assert(progression.passed&&progression.closed&&progression.retiredHandle&&progression.ownerDisposal&&progression.sample);
 assert.equal(progression.steps,104);assert.equal(progression.unity,'2021.3.6f1');assert(progression.peak<=32*1024*1024);
 assert.deepEqual(JSON.parse(observations.progression[stage+'-result.json']),progression);
 assert.deepEqual(rows(observations.progression[stage+'-replies.jsonl']),expectedProgression);
 const equipment=reports.equipment.results[stage];assert(equipment.passed&&equipment.closed&&equipment.publicationFailureClosed&&equipment.revision===7);
 assert.deepEqual(JSON.parse(observations.equipment[stage+'-result.json']),equipment);
 for(const phase of ['equip','remove']){
  const{character:before,...a}=JSON.parse(observations.equipment[stage+'-'+phase+'-before.json']);
  const{character:after,...b}=JSON.parse(observations.equipment[stage+'-'+phase+'-after.json']);assert.notDeepEqual(before,after);assert.deepEqual(a,b);
 }
 const retained=reports.retained[stage];assert.deepEqual(JSON.parse(observations.retained[stage+'.json']),retained);
 assert.equal(retained.liveBytes,0);assert.equal(retained.liveBlocks,0);
 for(const[field,count]of [['combat',60],['pouches',2334],['workshop',56]]){
  const replies=rows(observations.retained[stage+'-'+field+'.replies']),expected=rows(observations.retained[field+'.expected']);
  assert.equal(replies.length,count);assert.equal(expected.length,count);
  if(field!=='pouches'){assert.deepEqual(replies,expected);continue;}
  for(let index=0;index<count;index++){
   const got=replies[index],want=expected[index];assert.equal(got.ok,want.ok);
   if(Object.hasOwn(want,'gem')){assert.equal(got.nextUid,want.nextUid);assert.equal(got.items.length,1);assert.deepEqual(got.items[0].gem,want.gem);}
   else if(Object.hasOwn(want,'result')){
    assert.deepEqual(got.result,want.result);assert.deepEqual(got.items.at(-1),want.item);assert.deepEqual(got.items.map(item=>item.uid),want.order);
    assert.deepEqual(got.items.find(item=>item.uid===want.pouch)?.mem??null,want.remaining);assert.deepEqual(got.ledger,want.ledger);
    assert.deepEqual(got.memory.secondary,want.secondary);assert.deepEqual(got.memory.seatLedger,want.seatLedger);
   }else for(const[key,value]of Object.entries(want))assert.deepEqual(got[key],value);
  }
 }
 const result=account.results[stage];assert.deepEqual(JSON.parse(accountRaw[stage+'-result.json']),result);
 for(const key of ['passed','closed','accountRefusal','workshopRollback','busy','stale','invalidReload','publicationFailureClosed'])assert(result[key]);
 assert(result.accountPeak<=32*1024*1024&&result.workshopPeak<=32*1024*1024);assert(['committed','cancelled'].includes(result.cancellation));
 for(const label of ['initial','pair','equipped','continued','cancellation','publication-failure']){
  const expected=label==='cancellation'?(result.cancellation==='committed'?'cancel-committed':'continued'):label;
  for(const owner of ['account','workshop'])assert.deepEqual(JSON.parse(accountRaw[stage+'-'+label+'-'+owner+'.json']),inputs.expected[expected][owner]);
 }
 const{character:before,...a}=JSON.parse(accountRaw[stage+'-combat-before.json']),{character:after,...b}=JSON.parse(accountRaw[stage+'-combat-after.json']);
 assert.notDeepEqual(before,after);assert.deepEqual(a,b);
}
assert(reports.progression.cleaned&&account.cleaned&&reports.retained.relocatedPlayer&&reports.retained.installedFromTarball&&reports.retained.sampleImported);
assert(reports.retained.changedPouchAssetRejected&&reports.retained.changedWorkshopAssetRejected);assert.equal(reports.retained.playModeExitsWithoutDomainReload,2);
assert.deepEqual(Object.keys(account.lifecycle),['play-entry-0','play-exit-0','play-entry-1','play-exit-1','reload']);
for(const[stage,result]of Object.entries(account.lifecycle)){assert.deepEqual(result,{passed:true,closed:true,stage});assert.deepEqual(JSON.parse(accountRaw[stage+'-lifecycle.json']),result);}
for(const stage of ['sample-editor','sample-player']){
 assert.deepEqual(account.sample[stage],{passed:true,closed:true});assert.deepEqual(JSON.parse(accountRaw[stage+'-result.json']),account.sample[stage]);
 for(const label of ['initial','memory','forge','continued'])for(const owner of ['account','workshop'])
  assert.deepEqual(JSON.parse(accountRaw[stage+'-'+label+'-'+owner+'.json']),inputs.sampleExpected[label][owner]);
}
assert.deepEqual(account.faults.map(row=>row.name),['early-current','accept-false','failed-current','retain-postcommit']);
for(const row of account.faults)assert(row.detected&&accountRaw.faultAssertions[row.name].some(line=>line.includes('Exception: '+row.assertion)));
for(const records of Object.values(observations))assert(Object.keys(records).every(file=>!file.endsWith('.log')));
const hosted=unpack(path.join(directory,'hosted.json.gz'));
assert(hosted.passed&&hosted.engineQualified===false&&hosted.physicalDeviceQualification===false);
assert.equal(hosted.workflow.status,'completed');assert.equal(hosted.workflow.conclusion,'success');assert.equal(hosted.workflow.url,accepted.hostedWorkflow);
assert.equal(hosted.workflow.headSha,accepted.sourceProducerCommit);assert.equal(hosted.workflow.jobs.length,1);
assert(hosted.workflow.jobs[0].steps.every(step=>step.conclusion==='success'));
assert.equal(hosted.artifact.workflow_run.head_sha,accepted.sourceProducerCommit);assert.equal(hosted.artifact.digest,'sha256:'+accepted.hostedArchiveSha256);
assert.deepEqual(hosted.runtime.sources,native.sources);assert.equal(hosted.runtime.files['hwe_embedded.dll'],hosted.package.nativeSha256);
assert.notEqual(hosted.package.nativeSha256,accepted.nativeSha256);assert(hosted.runtime.passed&&hosted.runtime.cleaned&&hosted.collection.passed&&hosted.collection.cleaned);
assert.equal(hosted.package.archiveChanges.preservedFiles,62);assert.deepEqual(hosted.controls,reports.controls);
assert.equal(sha256(gunzipSync(fs.readFileSync(path.join(directory,'hosted-log.txt.gz')))),hosted.logSha256);
for(const row of hosted.collection.rows)assert(row.replySha256===collection.rows[0].replySha256&&row.closedBytes===0&&row.closedBlocks===0&&row.requests===450);
const args=process.argv.slice(2);assert(args.length===0||(args.length===4&&args[0]==='--runtime'&&args[2]==='--archive'));
if(args.length){assert.deepEqual(verifyQualifiedRuntime(args[1]),native);assert.equal(sha256(fs.readFileSync(args[3])),accepted.gameplaySha256);}
console.log({passed:true,version:pack.version,nativeCallers:579,collectionReplays:3,progressionStepsEach:104,retainedEach:{combat:60,pouches:2334,workshop:56},durableFaults:4,physicalDeviceQualification:false});
