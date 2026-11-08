import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';
import {root,sha256} from './reference-utils.mjs';import {sourceHasher} from './evidence-source.mjs';
const dir=path.join(root,'evidence/prepared-account');
const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name))),unpack=name=>JSON.parse(gunzipSync(fs.readFileSync(path.join(dir,name))));
const accepted=read('acceptance.json');assert.equal(accepted.schemaVersion,1);assert(accepted.passed);
assert.equal(accepted.sourceCommit,'ee663a3449fbaa29e67ba65b5293f300a97ff837');
for(const name of ['publishedPackage','fullUnityPackageQualified','physicalDeviceQualification'])assert.equal(accepted[name],false,name);
for(const[file,hash]of Object.entries(accepted.files)){assert.equal(path.basename(file),file);assert.equal(sha256(fs.readFileSync(path.join(dir,file))),hash,file);}
const current=sourceHasher(),historical=sourceHasher(accepted.sourceCommit);
const sources=(map,hash=current)=>{assert(Object.keys(map).length);for(const[file,want]of Object.entries(map))assert.equal(hash(file),want,file);};
sources(accepted.sources);sources(accepted.sources,historical);
const reports=unpack('reports.json.gz'),observed=unpack('observations.json.gz');
const sdk=reports.sdk,logs=unpack('sdk-logs.json.gz');assert(sdk.passed&&sdk.unchanged);sources(sdk.sources,historical);
assert.deepEqual(sdk.results.map(row=>row.name),['verify','reference:verify']);
for(const row of sdk.results){assert.equal(row.exitCode,0);assert(!row.error&&!row.signal);assert.equal(sha256(logs[row.name]),row.logSha256);}
assert(/(?:#|ℹ) tests 1660\b/.test(logs.verify));assert(/(?:#|ℹ) pass 1660\b/.test(logs.verify));
const pkg=reports.package;assert(pkg.passed&&pkg.cleaned);sources(pkg.sources);
assert.equal(pkg.contracts,30);assert.equal(pkg.sourceScenarios,10);assert.equal(pkg.sourceSteps,30);
for(const field of ['installed','browser','types','restored'])assert.equal(pkg[field].status,0);
assert(pkg.browserBytes>0&&pkg.browserBytes<=180*1024);assert.equal(pkg.faults.length,23);
assert.deepEqual(pkg.faults.slice(-9).map(row=>row.name),['premature-publication','lost-publication','abort-publishes','stale-token','pending-edit','excess-records','failed-batch-publishes','committed-candidate','borrowed-prepared-response']);
assert(pkg.faults.every(row=>row.status===1&&row.assertion));
assert.equal(sha256(fs.readFileSync(path.join(dir,'package-logs.json.gz'))),pkg.logsSha256);
const native=reports.native;assert(native.passed&&native.cleaned&&native.inputsUnchanged);sources(native.sources);
assert.equal(native.engineQualified,false);assert.equal(native.deviceQualified,false);
assert.equal(native.nativeSha256,'d2562c18b9bfe114b9e674b563332323a4c58da7935c87be380a1dcd8137ca3b');
for(const[name,hash]of [['native-inputs.json.gz',native.inputsSha256],['native-raw.json.gz',native.rawSha256]])assert.equal(sha256(fs.readFileSync(path.join(dir,name))),hash);
const inputs=unpack('native-inputs.json.gz'),raw=unpack('native-raw.json.gz');assert.deepEqual(raw.process,{status:0,signal:null,error:null});assert.equal(raw.stderr,'');
for(const[file,record]of Object.entries(native.inputs)){assert.equal(sha256(inputs[file]),record.sha256);assert.equal(Buffer.byteLength(inputs[file]),record.bytes);}
const frozenBytes=fs.readFileSync(path.join(root,'evidence/native-cstring-cleanup/native-followthrough/inputs.json.gz'));
assert.equal(sha256(frozenBytes),native.frozenCapsuleSha256);const frozen=JSON.parse(gunzipSync(frozenBytes));
assert.equal(inputs['content.json'],frozen['content.json']);assert.equal(inputs['courses.json'],frozen['courses.json']);
const original=JSON.parse(inputs['courses.json']).flatMap(course=>course.rows),prepared=JSON.parse(inputs['prepared.json']);
const preparedRows=prepared.flatMap(course=>course.rows);assert.equal(original.length,579);assert.equal(preparedRows.length,84);
const command=bundle=>{
 const context=vm.createContext({input:inputs['content.json']});vm.runInContext(bundle,context,{timeout:30000});
 vm.runInContext('var owner=HollowWakeSession.create(JSON.parse(input));',context,{timeout:30000});
 const script=new vm.Script('JSON.stringify(HollowWakeSession.dispatch(owner,JSON.parse(input)))');
 return request=>{context.input=JSON.stringify(request);return JSON.parse(script.runInContext(context,{timeout:30000}));};
};
const old=command(frozen['bundle.js']),candidate=command(inputs['bundle.js']);
for(const course of prepared){for(const row of course.control)assert.deepEqual(old(row.request),row.reply);for(const row of course.rows)assert.deepEqual(candidate(row.request),row.reply);}
const stream=rows=>rows.map(row=>JSON.stringify(row.reply)+'\n').join('');
assert(native.observed.completed);assert.equal(native.observed.steps,579);assert.equal(native.observed.preparedSteps,84);
assert.deepEqual(native.observed.rows.map(row=>[row.heapMiB,row.policy,row.loops]),[[32,'none',1],[48,'none',1],[32,'startup',1],[32,'startup',10]]);
for(const row of native.observed.rows){
 assert(row.created&&row.coursePassed&&row.preparedPassed&&row.disposed);assert.equal(row.createStatus,0);assert.equal(row.commands,579*row.loops);assert.equal(row.preparedCommands,84);
 assert.equal(row.replySha256,sha256(stream(original).repeat(row.loops)));assert.equal(row.preparedReplySha256,sha256(stream(preparedRows)));
 assert.equal(row.destroyStatus,0);assert.equal(row.remainingBytes,0);assert.equal(row.remainingBlocks,0);assert(row.tracked.peak_bytes<=row.heapMiB*1024*1024);
 assert.equal(row.collections.length,row.policy==='startup'?1:0);
}
const typed=reports.typed;assert(typed.passed&&typed.cleaned&&typed.inputsUnchanged);sources(typed.sources);sources(typed.package.sources);
assert.equal(typed.package.nativeSha256,native.nativeSha256);assert.equal(typed.package.sha256,'a7897392f9508bb65a7e7abca61a9777435a7402c2c2ae8c857cdaa1381afa65');
const expectedTyped=JSON.parse(observed.typed['expected.json']);assert.equal(expectedTyped.length,84);
for(const stage of ['editor','player']){
 const result=typed.results[stage];assert.deepEqual(JSON.parse(observed.typed[stage+'-result.json']),result);
 for(const field of ['passed','closed','retiredAccount','retiredInventory','retiredCommand','ownerDisposal','foreignOwner'])assert(result[field]);
 assert.equal(result.unity,'2021.3.6f1');assert.equal(result.steps,84);assert(result.peak>0&&result.peak<=32*1024*1024);
 const replies=observed.typed[stage+'-replies.jsonl'].replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(JSON.parse);
 assert.equal(replies.length,84);for(let i=0;i<84;i++){if(Object.hasOwn(replies[i],'text'))replies[i].text=JSON.parse(replies[i].text);assert.deepEqual(replies[i],expectedTyped[i]);}
}
const storage=reports.storage,faults=reports.faults;assert.deepEqual(faults.control,storage);
assert(storage.passed&&storage.cleaned&&storage.inputsUnchanged);sources(storage.sources);
for(const pack of Object.values(storage.packages))sources(pack.sources);
assert.equal(storage.packages.gameplay.sha256,typed.package.sha256);assert.equal(storage.packages.storage.sha256,'c82b34e6a0c6b5c44c26c1aab1443efe170598eabf9bc69d02ab13e994cf57d5');
const expectedStorage=JSON.parse(observed.storage['expected.json']);
for(const stage of ['editor','player']){
 const result=storage.results[stage];assert.deepEqual(JSON.parse(observed.storage[stage+'-result.json']),result);
 for(const field of ['passed','closed','policyRollback','exceptionRollback','invalidRollback','busy','staleDependency','reopened','publicationFailureClosed','incompleteGroupRefused'])assert(result[field]);
 assert.equal(result.unity,'2021.3.6f1');assert(result.peak>0&&result.peak<=48*1024*1024);assert(['committed','cancelled'].includes(result.cancellation));
 for(const[name,rows]of Object.entries(expectedStorage))for(const[i,part]of ['account','inventory0','inventory1'].entries())assert.deepEqual(JSON.parse(observed.storage[stage+'-'+name+'-'+part+'.json']),rows[i]);
 const final=storage.databases[stage];assert.deepEqual(final.map(row=>row[0]),[10,20,30]);
 for(const[i,part]of ['account','inventory0','inventory1'].entries())assert.deepEqual(JSON.parse(final[i][2]),JSON.parse(observed.storage[stage+'-final-'+part+'.json']));
}
assert(faults.passed&&faults.cleaned&&faults.inputsUnchanged);sources(faults.sources);assert.equal(faults.basePackageSha256,storage.packages.storage.sha256);
assert.deepEqual(faults.faults.map(row=>row.name),['omit-unchanged-dependency','publish-before-ack','lose-publication','ignore-gameplay-policy','retain-aborted-proposal','leave-storage-open']);
for(const fault of faults.faults){const row=observed.faults[fault.name];assert(fault.detected&&row.status!==0&&!row.report.passed&&row.report.cleaned);assert(row.report.failure.includes(fault.assertion));assert(row.assertions.some(line=>line.includes('Exception: '+fault.assertion)));assert.equal(row.report.packages.storage.faultControl.baseSha256,faults.basePackageSha256);}
for(const rows of [observed.typed,observed.storage])assert(Object.keys(rows).every(name=>!name.endsWith('.log')));
const prior=unpack('prior-attempts.json.gz');assert(!prior.nativeR2.passed&&prior.nativeR2.cleaned);assert(!prior.sdkR6.passed);assert(prior.sdkR6FailureLog.includes('exceeds 20 KiB'));
console.log({passed:true,sdkTests:1660,accountContracts:30,packageFaults:23,nativeOriginal:579,nativePrepared:84,unityStages:['editor','relocated-player'],durableFaults:6,fullPackageQualified:false,physicalDeviceQualified:false});
