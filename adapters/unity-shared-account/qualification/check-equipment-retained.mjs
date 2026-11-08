import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {root,sha256} from '../../../scripts/reference-utils.mjs';
import {sourceHasher} from '../../../scripts/evidence-source.mjs';

const dir=path.join(root,'evidence/shared-account-equipment/retained');
const read=file=>JSON.parse(fs.readFileSync(file));
const unpack=file=>JSON.parse(gunzipSync(fs.readFileSync(file)));
const accepted=read(path.join(dir,'acceptance.json')),args=process.argv.slice(2);
assert(args.length===0||(args.length===2&&args[0]==='--source-ref'&&args[1]===accepted.sourceCommit));
assert(accepted.passed&&accepted.schemaVersion===1);
for(const flag of ['packagePublication','physicalDeviceQualification','completeSdkQualification'])assert.equal(accepted[flag],false);
const historical=sourceHasher(accepted.sourceCommit),current=sourceHasher(args.length?accepted.sourceCommit:null);
for(const[file,want]of Object.entries(accepted.sources)){assert.equal(historical(file),want,file);assert.equal(current(file),want,file);}
for(const[file,want]of Object.entries(accepted.tools))assert.equal(sha256(fs.readFileSync(path.join(root,file))),want,file);
for(const[file,want]of Object.entries(accepted.files)){assert.equal(path.basename(file),file);assert.equal(sha256(fs.readFileSync(path.join(dir,file))),want,file);}
for(const[folder,field]of [['shared-account-equipment','developmentEvidenceSha256'],['unity-shared-account','priorPackageEvidenceSha256']]){
 assert.equal(sha256(fs.readFileSync(path.join(root,'evidence',folder,'acceptance.json'))),accepted[field]);
}
const r=unpack(path.join(dir,'reports.json.gz')),o=unpack(path.join(dir,'observations.json.gz'));
assert.deepEqual(Object.keys(r).sort(),['account-storage','archives','equipment','gameplay','progression','shared']);
const parse=text=>JSON.parse(text.replace(/^\uFEFF/,''));
const rows=text=>text.replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(JSON.parse);
function sources(value){
 if(Array.isArray(value)){for(const child of value)sources(child);return;}
 if(!value||typeof value!=='object')return;
 for(const[field,child]of Object.entries(value)){
  if(['sources','sdkSources','nativeSources'].includes(field))for(const[file,want]of Object.entries(child))assert.equal(accepted.sources[file.replaceAll('\\','/')],want,file);
  else sources(child);
 }
}
for(const[name,report]of Object.entries(r)){assert(report.passed&&report.cleaned,name);assert.notEqual(report.inputsUnchanged,false,name);sources(report);}
const development=unpack(path.join(root,'evidence/shared-account-equipment/reports.json.gz'));
const original=development.equipmentFaults.control.packages;
const previous=unpack(path.join(root,'evidence/unity-shared-account/observations.json.gz'));
function packageView(name,kind,pack){
 const base=original[kind],meta=r[name].metadata[kind];
 const{hashes,qualificationMetadata,...unchanged}=pack;
 assert.deepEqual(unchanged,base);
 assert.equal(meta.archiveSha256,base.sha256);
 assert.equal(meta.receiptSha256,sha256(JSON.stringify(base,null,2)+'\n'));
 // This Windows-only runner writes its temporary metadata with native CRLF.
 // The original builder receipt uses explicit LF and remains byte-identical.
 assert.equal(meta.supplementalReceiptSha256,sha256((JSON.stringify(pack,null,2)+'\n').replaceAll('\n','\r\n')));
 assert.deepEqual(qualificationMetadata,{originalReceiptSha256:meta.receiptSha256,resourceHashesDerivedFromVerifiedMembers:true,archiveUnchanged:true});
 assert.deepEqual(hashes,meta.resourceHashes);
 const prefix='package/Runtime/Resources/HollowWake/';
 assert.deepEqual(hashes,Object.fromEntries(Object.entries(base.files).filter(([file])=>file.startsWith(prefix)&&file.endsWith('.bytes')).map(([file,sha])=>[file.slice(prefix.length,-6),sha])));
}
for(const name of ['gameplay','shared'])packageView(name,'gameplay',r[name].result.package);
for(const name of ['equipment','account-storage'])for(const kind of ['gameplay','storage'])packageView(name,kind,r[name].result.packages['com.hollowwake.'+kind]);
assert.deepEqual(r.progression.package,original.gameplay);
assert.deepEqual(r.archives.packages,Object.fromEntries(Object.entries(original).map(([name,pack])=>[name,pack.sha256])));
assert.deepEqual(r.archives.controls,[
 'gameplay-exact-rebuild','gameplay-preserved-unrelated-files','gameplay-existing-view',
 'storage-exact-rebuild','storage-preserved-unrelated-files','storage-existing-view',
 'existing-build-output','wrong-gameplay-parent','wrong-storage-parent','wrong-archive-hash',
 'wrong-member-hash','contradictory-resource-index','changed-sdk-source']);
const typedExpected=parse(previous.typed['expected.json']);
assert.equal(typedExpected.length,84);assert.deepEqual(parse(o.shared['expected.json']),typedExpected);
const progressionExpected=parse(previous.progression['inputs.json']).expected;
assert.equal(progressionExpected.length,104);
const accountInput=parse(o['account-storage']['inputs.json']),oldAccount=parse(previous.accountStorage['inputs.json']);
assert.deepEqual(accountInput.expected,oldAccount.expected);assert.deepEqual(accountInput.sampleExpected,oldAccount.sampleExpected);
for(const stage of ['editor','player']){
 const typed=r.shared.result.results[stage];assert.deepEqual(parse(o.shared[stage+'-result.json']),typed);
 assert.equal(typed.steps,84);assert(typed.peak>0&&typed.peak<=32*1024*1024);
 for(const key of ['passed','closed','retiredAccount','retiredInventory','retiredCommand','ownerDisposal','foreignOwner','documentationExample'])assert(typed[key],key);
 const replies=rows(o.shared[stage+'-replies.jsonl']);for(const row of replies)if(Object.hasOwn(row,'text'))row.text=JSON.parse(row.text);assert.deepEqual(replies,typedExpected);
 assert.equal(parse(o.shared[stage+'-documentation-account.json']).progression.account.credits,970);
 assert(!Object.hasOwn(parse(o.shared[stage+'-documentation-inventory.json']).workshop.state,'account'));
 const progression=r.progression.results[stage];assert.deepEqual(parse(o.progression[stage+'-result.json']),progression);
 for(const key of ['passed','closed','retiredHandle','ownerDisposal','sample'])assert(progression[key],key);
 assert.equal(progression.steps,104);assert(progression.peak>0&&progression.peak<=32*1024*1024);
 assert.deepEqual(rows(o.progression[stage+'-replies.jsonl']),progressionExpected);
 const equipment=r.equipment.result.results[stage];assert.deepEqual(parse(o.equipment[stage+'-result.json']),equipment);
 assert(equipment.passed&&equipment.closed&&equipment.publicationFailureClosed&&equipment.revision===7);
 assert(equipment.combatPeak>0&&equipment.combatPeak<=64*1024*1024);assert(equipment.workshopPeak>0&&equipment.workshopPeak<=32*1024*1024);
 for(const phase of ['equip','remove']){
  const{character:a,...before}=parse(o.equipment[stage+'-'+phase+'-before.json']),{character:b,...after}=parse(o.equipment[stage+'-'+phase+'-after.json']);
  assert.notDeepEqual(a,b);assert.deepEqual(before,after);
 }
 const gameplay=r.gameplay.result[stage];assert.deepEqual(parse(o.gameplay[stage+'.json']),gameplay);
 assert.equal(gameplay.liveBytes,0);assert.equal(gameplay.liveBlocks,0);
 for(const key of ['saveContinuation','isolatedActors','refusedInvalidRestore','closedHost','duplicatePress','catchUpBoundary','stoppedOnDeath','typedPouch','typedWorkshop','workshopContinuation','workshopIsolation','workshopClosed'])assert(gameplay[key],key);
 assert.equal(gameplay.singleRequests,512);assert.equal(gameplay.catchUpRequests,8);
 assert(gameplay.catchUpWireBytes>0&&gameplay.catchUpWireBytes<gameplay.singleWireBytes);
 for(const[field,count]of [['combat',60],['pouches',2334],['workshop',56]]){
  const got=rows(o.gameplay[stage+'-'+field+'.replies']),expected=rows(o.gameplay[field+'.expected']);
  assert.equal(got.length,count);assert.equal(expected.length,count);assert.deepEqual(expected,rows(previous.retained[field+'.expected']));
  if(field!=='pouches'){assert.deepEqual(got,expected);continue;}
  for(const[i,want]of expected.entries()){
   const reply=got[i];assert.equal(reply.ok,want.ok);
   if(Object.hasOwn(want,'gem')){assert.equal(reply.nextUid,want.nextUid);assert.equal(reply.items.length,1);assert.deepEqual(reply.items[0].gem,want.gem);}
   else if(Object.hasOwn(want,'result')){
    assert.deepEqual(reply.result,want.result);assert.deepEqual(reply.items.at(-1),want.item);assert.deepEqual(reply.items.map(item=>item.uid),want.order);
    assert.deepEqual(reply.items.find(item=>item.uid===want.pouch)?.mem??null,want.remaining);assert.deepEqual(reply.ledger,want.ledger);
    assert.deepEqual(reply.memory.secondary,want.secondary);assert.deepEqual(reply.memory.seatLedger,want.seatLedger);
   }else for(const[key,value]of Object.entries(want))assert.deepEqual(reply[key],value);
  }
 }
 const account=r['account-storage'].result.results[stage];assert.deepEqual(parse(o['account-storage'][stage+'-result.json']),account);
 for(const key of ['passed','closed','accountRefusal','workshopRollback','busy','stale','invalidReload','publicationFailureClosed'])assert(account[key],key);
 assert(['committed','cancelled'].includes(account.cancellation));
 for(const label of ['initial','pair','equipped','continued','cancellation','publication-failure']){
  const expected=label==='cancellation'?(account.cancellation==='committed'?'cancel-committed':'continued'):label;
  for(const owner of ['account','workshop'])assert.deepEqual(parse(o['account-storage'][stage+'-'+label+'-'+owner+'.json']),accountInput.expected[expected][owner]);
 }
 for(const result of [typed,progression,equipment,gameplay,account])assert.equal(result.unity,'2021.3.6f1');
}
const gameplay=r.gameplay.result;
for(const key of ['installedFromTarball','sampleImported','relocatedPlayer','changedPouchAssetRejected','changedWorkshopAssetRejected'])assert(gameplay[key],key);
assert.equal(gameplay.playModeExitsWithoutDomainReload,2);
const account=r['account-storage'].result;
assert.deepEqual(Object.keys(account.lifecycle),['play-entry-0','play-exit-0','play-entry-1','play-exit-1','reload']);
for(const[stage,result]of Object.entries(account.lifecycle)){
 assert.deepEqual(result,{passed:true,closed:true,stage});assert.deepEqual(parse(o['account-storage'][stage+'-lifecycle.json']),result);
}
for(const stage of ['sample-editor','sample-player']){
 assert.deepEqual(account.sample[stage],{passed:true,closed:true});
 for(const label of ['initial','memory','forge','continued'])for(const owner of ['account','workshop'])assert.deepEqual(parse(o['account-storage'][stage+'-'+label+'-'+owner+'.json']),accountInput.sampleExpected[label][owner]);
}
assert.equal(account.faults.length,4);
for(const fault of account.faults)assert(fault.detected&&o['account-storage'].faultAssertions[fault.name].some(line=>line.startsWith('Exception: '+fault.assertion)));
for(const raw of Object.values(o))assert(Object.keys(raw).every(file=>!file.endsWith('.log')));
console.log({passed:true,source:accepted.sourceCommit,sharedStepsEach:84,progressionStepsEach:104,gameplayEach:{combat:60,pouches:2334,workshop:56},accountFaults:4,lifecyclePaths:5,archiveControls:13,packagePublication:false,physicalDeviceQualification:false});
