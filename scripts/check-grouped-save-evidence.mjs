import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {root,sha256} from './reference-utils.mjs';
import {sourceHasher} from './evidence-source.mjs';

// This retained SDK/native checkpoint predates later Unity bindings. Read its
// actual Git blobs when requested; fresh platform tests still use today's code.
const checkpoint='eb6a01647063aaebe72a19f63ca29fd876288f69',args=process.argv.slice(2);
assert(args.length===0||(args.length===2&&args[0]==='--source-ref'&&args[1]===checkpoint));
const sourceHash=sourceHasher(args.length?checkpoint:null);

const directory=path.join(root,'evidence/grouped-saves');
const read=file=>JSON.parse(fs.readFileSync(path.join(directory,file)));
const accepted=read('windows.json');
assert(accepted.passed&&accepted.platform==='win32'&&accepted.arch==='x64');
assert.equal(accepted.engineQualification,false);assert.equal(accepted.physicalDeviceQualification,false);
for(const [file,hash]of Object.entries(accepted.files))
  assert.equal(sha256(fs.readFileSync(path.join(directory,file))),hash,file);
for(const [file,hash]of Object.entries(accepted.sources))
  assert.equal(sourceHash(file),hash,file);
const reports=JSON.parse(gunzipSync(fs.readFileSync(path.join(directory,'windows-raw.json.gz'))));
for(const name of ['build','contracts','worker']){
  const report=reports[name];assert(report.passed,name);
  for(const [file,hash]of Object.entries(report.sources))
    assert.equal(sourceHash(file),hash,name+': '+file);
}
const {build,contracts,worker,sdk}=reports;
assert.equal(build.version,'0.2.0-preview.1');assert.equal(build.abi,1);
assert.equal(build.librarySha256,contracts.librarySha256);
assert.equal(contracts.suppliedBuildReceiptSha256,accepted.buildReceiptSha256);
assert.equal(accepted.librarySha256,build.librarySha256);
assert.equal(accepted.libraryBytes,contracts.libraryBytes);
assert(contracts.cAbi.passed&&contracts.managed.passed&&contracts.legacyConsumer.passed&&contracts.legacyManaged.passed);
assert.equal(contracts.cAbi.groupExtension,1);assert.equal(contracts.managed.groupExtension,1);
assert(contracts.legacyManaged.legacyLibrary&&contracts.legacyManaged.groupsRefused);
assert.equal(contracts.crashRecovery.length,6);
for(const journal of ['wal','rollback'])for(const boundary of ['staged','committed','refused'])
  assert(contracts.crashRecovery.some(row=>row.journal===journal&&row.boundary===boundary&&row.passed&&row.recovered));
assert.deepEqual(contracts.mutations.map(row=>row.name),[
  'stale-update','paired-document','lost-commit','lost-rollback','payload-limit','split-update','hidden-commit-error','wrong-token',
  'group-partial-commit','group-read-order','group-byte-limit','group-null-record']);
assert(contracts.mutations.every(row=>row.detected));
assert(contracts.sqliteExportsPrivate&&contracts.exports.includes('hwe_save_submit_group_v1'));
assert(worker.boundedAdmission&&worker.cancelBoundary&&worker.ownedInputs&&worker.destructorJoin);
assert(worker.mutations.every(row=>row.detected));
assert.equal(sdk.results.length,1);
const result=sdk.results[0];
assert.equal(result.name,'verify');assert.equal(result.exitCode,0);assert(!result.error&&!result.signal);
assert.equal(sha256(gunzipSync(fs.readFileSync(path.join(directory,'sdk-verify.txt.gz')))),result.logSha256);
// npm verify covers the SDK source. Two independently qualified native fixes
// landed while that regression ran; retain the original run's failed whole-tree
// stability flag rather than claiming it tested those native files.
const changed=[];
for(const [file,hash]of Object.entries(sdk.sources)){
  const current=sourceHash(file);
  if(current!==hash){
    assert.equal(build.sources[file],current,'Changed SDK source lacks native qualification: '+file);
    changed.push(file);
  }
}
assert.deepEqual(changed.sort(),accepted.nativeChangesDuringSdkRegression);
assert(changed.every(file=>['native/save/src/slot-store.cpp','native/save/src/hwe_save.cpp'].includes(file)));
assert.equal(sdk.unchanged,changed.length===0);
assert.equal(sdk.passed,changed.length===0);
const cleanup=read('cleanup.json');
assert(cleanup.passed&&cleanup.remainingWorktrees===3&&cleanup.newWorktrees===0);
console.log({passed:true,version:build.version,groups:8,aggregateBytes:4194304,crashBoundaries:6,
  storeFaults:12,legacyCompatibility:true,scope:'Windows x64 native C/C++ and .NET; engine/device qualification separate'});
