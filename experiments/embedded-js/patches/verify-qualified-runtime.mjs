import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {root,sha256,listFiles} from '../../../scripts/reference-utils.mjs';

export const qualifiedRuntimeSources=['experiments/embedded-js/patches/build-qualified-runtime.mjs',
  'experiments/embedded-js/patches/verify-qualified-runtime.mjs','scripts/embedded-native-tools.mjs','scripts/native-tools.mjs','scripts/reference-utils.mjs',
  'experiments/embedded-js/patches/cstring-cleanup.mjs','experiments/embedded-js/patches/cstring-cleanup.json','experiments/embedded-js/host-source-lock.json',
  'experiments/embedded-js/tracked-allocator.h','scripts/probe-shared-account-native.py',
  ...listFiles(path.join(root,'experiments/embedded-js/native')).map(file=>'experiments/embedded-js/native/'+file)];

export function verifyQualifiedRuntime(directory) {
  const read=file=>JSON.parse(fs.readFileSync(path.join(directory,file)));
  const report=read('runtime-receipt.json'),packed=fs.readFileSync(path.join(directory,'runtime-receipt.json.raw.json.gz'));
  assert.equal(report.schemaVersion,1);assert.equal(report.profile,'quickjs-ng-0.17.0-cstring-cleanup/v1');
  for(const field of ['passed','cleaned','inputsUnchanged','upstreamUnchanged','preparedUnchanged'])assert.equal(report[field],true,field);
  assert.equal(report.platform,'win32');assert.equal(report.arch,'x64');
  assert.equal(report.engineQualified,false);assert.equal(report.deviceQualified,false);
  assert.deepEqual(Object.keys(report.sources),qualifiedRuntimeSources);
  for(const[file,hash]of Object.entries(report.sources)){
    assert(!path.isAbsolute(file)&&!file.includes('..'));assert.equal(sha256(fs.readFileSync(path.join(root,file))),hash,file);
  }
  for(const file of ['build-qualified-runtime.mjs','verify-qualified-runtime.mjs','cstring-cleanup.mjs','cstring-cleanup.json'])
    assert(Object.hasOwn(report.sources,'experiments/embedded-js/patches/'+file));
  const lockBytes=fs.readFileSync(path.join(root,'experiments/embedded-js/host-source-lock.json'));
  const patchBytes=fs.readFileSync(path.join(root,'experiments/embedded-js/patches/cstring-cleanup.json'));
  const lock=JSON.parse(lockBytes),patch=JSON.parse(patchBytes);
  assert.equal(report.patch.id,patch.id);assert.equal(report.patch.sourceLockSha256,sha256(lockBytes));
  assert.equal(report.patch.manifestSha256,sha256(patchBytes));assert.deepEqual(report.patch.original,lock.files);
  assert.deepEqual(report.patch.files,{...lock.files,[patch.file]:patch.patchedSha256});
  assert.deepEqual(Object.keys(report.files),['hwe_embedded.dll','hwe_embedded.h']);
  for(const[file,hash]of Object.entries(report.files))assert.equal(sha256(fs.readFileSync(path.join(directory,file))),hash,file);
  assert.equal(report.files['hwe_embedded.h'],report.sources['experiments/embedded-js/native/hwe_embedded.h']);
  assert.deepEqual(report.exports,['cancel','collect','copy_response','create','destroy','layout','metrics','release_response','submit'].map(name=>'hwe_js_'+name+'_v1').sort());
  assert.equal(sha256(packed),report.rawSha256);const raw=JSON.parse(gunzipSync(packed));
  assert.equal(sha256(raw.runner),report.sources['experiments/embedded-js/patches/build-qualified-runtime.mjs']);
  const evidence=path.join(root,'evidence/native-cstring-cleanup/native-followthrough');
  const capsule=fs.readFileSync(path.join(evidence,'inputs.json.gz'));
  assert.equal(sha256(capsule),report.capsuleSha256);assert.equal(sha256(fs.readFileSync(path.join(evidence,'r2.json.gz'))),report.inputReceiptSha256);
  const inputs=JSON.parse(gunzipSync(capsule)),course=JSON.parse(inputs['courses.json']).flatMap(course=>course.rows);
  assert.equal(course.length,579);
  assert.deepEqual(report.rows.map(row=>row.variant),['original','patched']);
  for(const row of report.rows){
    assert(row.commands.length>=4&&row.compiler.length>0);
    assert.deepEqual(row.consumers.map(consumer=>consumer.name),['cpp','dotnet']);
    for(const consumer of row.consumers){
      const capture=raw[row.variant][consumer.name];assert.deepEqual(capture.process,{status:0,signal:null,error:null});
      assert.equal(capture.stderr,'');assert.deepEqual(JSON.parse(capture.stdout),consumer.stats);
      const stats=consumer.stats;assert(stats.passed&&stats.requests===579&&stats.liveBytesAfterDispose===0&&stats.liveBlocksAfterDispose===0);
      assert(stats.threadMigration&&stats.unloadReload);
      assert.deepEqual(capture.replies.trim().split(/\r?\n/).map(line=>JSON.parse(line)),course.map(step=>step.reply));
    }
    const capture=raw[row.variant].lowMemory;assert.equal(capture.status,0);assert.equal(capture.signal,null);assert.equal(capture.error,null);assert.equal(capture.stderr,'');
    assert.deepEqual(JSON.parse(capture.stdout),row.memory.rows);assert.equal(row.memory.rows.length,2);
    const [low,roomy]=row.memory.rows;assert.equal(low.heapMiB,32);assert.equal(roomy.heapMiB,48);
    assert.equal(low.error,"AssertionError(('submit', 4))");assert.equal(low.failedMetrics.poisoned,1);assert.equal(low.failedMetrics.pending,0);
    assert.equal(low.retryStatus,5);assert.equal(low.retryLength,0);assert.equal(low.copyStatus,8);assert.equal(low.copyWritten,0);
    assert.deepEqual(low.failedMetrics,low.afterRejectedRetry);
    if(row.variant==='original'){assert.equal(low.destroyStatus,11);assert(low.remainingBytes>0);}
    else{assert.equal(low.destroyStatus,0);assert.equal(low.remainingBytes,0);assert.equal(row.librarySha256,report.files['hwe_embedded.dll']);}
    assert(roomy.coursePassed&&roomy.commands===579&&roomy.destroyStatus===0&&roomy.remainingBytes===0);
  }
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  assert.equal(process.argv.length,3,'Qualified runtime directory required');
  const report=verifyQualifiedRuntime(fs.realpathSync(process.argv[2]));
  console.log({passed:true,profile:report.profile,nativeSha256:report.files['hwe_embedded.dll'],engineQualified:false});
}
