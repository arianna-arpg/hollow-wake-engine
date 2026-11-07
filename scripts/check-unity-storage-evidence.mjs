import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {root,sha256} from './reference-utils.mjs';

// This checks that accepted Unity evidence still describes the shipped sources.
// It does not replace running the real editor/player qualification course.
const dir=path.join(root,'evidence/unity-storage');
const summary=JSON.parse(fs.readFileSync(path.join(dir,'windows.json')));
const bytes=fs.readFileSync(path.join(dir,'windows-raw.json.gz'));
assert(summary.passed);
assert.equal(sha256(bytes),summary.rawSha256);
assert.equal(sha256(fs.readFileSync(path.join(dir,'workshop.png'))),summary.screenshotSha256);
const raw=JSON.parse(gunzipSync(bytes));
const baselineBytes=fs.readFileSync(path.join(dir,'play-entry-baseline.json.gz'));
assert.equal(sha256(baselineBytes),summary.playEntryBaselineSha256);
const baseline=JSON.parse(gunzipSync(baselineBytes));
assert.equal(baseline.archiveSha256,raw.rejectedPlayEntryPackage.sha256);
assert.equal(baseline.nativeSha256,raw.package.nativeSha256);
for(const[file,text]of Object.entries(baseline.files))
  assert.equal(sha256(Buffer.from(text)),raw.rejectedPlayEntryPackage.files[file],file);
assert(raw.rejectedPlayEntryLog.includes('Lifecycle retained native workshop or save resources'));
for(const name of ['package','combined','standalone','native','nativeContracts']){
  assert(raw[name].passed,name);
  for(const[file,value]of Object.entries(raw[name].sources)){
    assert(!path.isAbsolute(file) && !file.split(/[\\/]/).includes('..'),file);
    assert.equal(sha256(fs.readFileSync(path.join(root,file))),value,name+': '+file);
  }
}
assert.equal(raw.package.sha256,summary.package.sha256);
const packer='scripts/unity-package-archive.py';
assert.equal(raw.packagerBeforeLf.replaceAll('\r\n','\n'),fs.readFileSync(path.join(root,packer),'utf8'));
assert.equal(sha256(Buffer.from(raw.packagerBeforeLf)),raw.combined.package.sources[packer]);
for(const name of ['combined','standalone'])
  assert.deepEqual({...raw[name].package.sources,[packer]:raw.package.sources[packer]},raw.package.sources);
assert.equal(raw.archive.toolSha256,raw.package.sources[packer]);
assert.equal(raw.combined.packageSha256,raw.package.sha256);
assert.equal(raw.standalone.packageSha256,raw.package.sha256);
assert.equal(raw.package.nativeSha256,raw.native.librarySha256);
assert.equal(raw.package.nativeSha256,raw.nativeContracts.librarySha256);
assert.equal(raw.standalone.gameplayPackageSha256,null);
assert(raw.combined.faultControls.passed && raw.combined.faultControls.cases.length===2);
assert(raw.combined.faultControls.cases.every(test=>test.rejected));
for(const stage of ['play-entry-0','play-entry-1','play-exit-0','play-exit-1','reload','quit']){
  const result=raw.combined.workshopLifecycle[stage];
  assert(result.passed && result.closed && result.finalLiveBytes===0 && result.finalLiveBlocks===0,stage);
}
assert(raw.combined.sample['sample-reopen'].restartContinuation);
assert(raw.archive.passed && raw.archive.byteIdentical && raw.archive.packageGuidIsolation);
console.log({passed:true,scope:'Source and receipt integrity; actual Unity results are retained evidence',
  packageSha256:raw.package.sha256,nativeSha256:raw.package.nativeSha256});
