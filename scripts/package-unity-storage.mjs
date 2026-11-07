import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {root,sha256,writeJSON,listFiles} from './reference-utils.mjs';

const [libraryFlag,libraryFile,proofFlag,proofFile,pythonFlag,python,outputFlag,output,...rest]=process.argv.slice(2);
assert.deepEqual([libraryFlag,proofFlag,pythonFlag,outputFlag,rest.length],
  ['--library','--qualification','--python','--output',0]);
const read=file=>JSON.parse(fs.readFileSync(file)),hash=file=>sha256(fs.readFileSync(file));
const native=read(libraryFile),qualified=read(proofFile),nativeDir=path.dirname(path.resolve(libraryFile));
assert(native.passed&&native.platform==='win32'&&native.arch==='x64'&&native.abi===1);
assert(qualified.passed&&qualified.cAbi.passed&&qualified.managed.passed&&qualified.sqliteExportsPrivate);
assert.equal(qualified.suppliedBuildReceiptSha256,hash(libraryFile));
assert.equal(qualified.librarySha256,native.librarySha256);
for(const proof of [native,qualified])
  for(const [file,digest]of Object.entries(proof.sources))assert.equal(hash(path.join(root,file)),digest,file);
for(const [file,record]of Object.entries(native.files)){
  assert.equal(path.basename(file),file);
  const bytes=fs.readFileSync(path.join(nativeDir,file));
  assert.equal(bytes.length,record.bytes);assert.equal(sha256(bytes),record.sha256,file);
}
const out=path.resolve(output);assert(!fs.existsSync(out),'Choose a fresh package delivery');
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const temp=fs.mkdtempSync(path.join(root,'.artifacts/unity-storage-pack-'));
try{
  const stage=path.join(temp,'package'),src=path.join(root,'adapters/unity-storage');
  fs.cpSync(src,stage,{recursive:true});
  const target=path.join(stage,'Runtime/Native/Windows');fs.mkdirSync(target,{recursive:true});
  fs.copyFileSync(path.join(nativeDir,native.library),path.join(target,'hwe_save.dll'));
  fs.copyFileSync(path.join(nativeDir,'SlotStore.cs'),path.join(stage,'Runtime/SlotStore.cs'));
  fs.copyFileSync(path.join(nativeDir,'LICENSE.md'),path.join(stage,'LICENSE.md'));
  fs.copyFileSync(path.join(nativeDir,'SQLITE-NOTICE.txt'),path.join(stage,'Third Party Notices.txt'));
  const manifest=read(path.join(stage,'package.json'));
  assert.deepEqual(manifest.dependencies,{});
  const file=manifest.name+'-'+manifest.version+'.tgz',packed=path.join(temp,file);
  execFileSync(python,['-I','-B',path.join(root,'scripts/unity-package-archive.py'),stage,packed],{
    env:{...process.env,TEMP:temp,TMP:temp,TMPDIR:temp},windowsHide:true,stdio:'pipe'});
  const sources=['scripts/package-unity-storage.mjs','scripts/unity-package-archive.py',
    ...listFiles(src).map(file=>'adapters/unity-storage/'+file)];
  const receipt={passed:true,kind:'package-build; Unity editor/player acceptance recorded separately',
    name:manifest.name,version:manifest.version,file,bytes:fs.statSync(packed).size,sha256:hash(packed),
    platform:'win32',arch:'x64',unity:'2021.3',backend:'Mono',
    nativeSha256:native.librarySha256,nativeBuildReceiptSha256:hash(libraryFile),nativeQualificationSha256:hash(proofFile),
    sources:Object.fromEntries(sources.map(file=>[file,hash(path.join(root,file))])),
    files:Object.fromEntries(listFiles(stage).map(file=>[file,hash(path.join(stage,file))])),
    nativeSources:native.sources};
  fs.mkdirSync(out,{recursive:true});fs.copyFileSync(packed,path.join(out,file));
  writeJSON(path.join(out,'package-receipt.json'),receipt);
  console.log({passed:true,directory:out,file,bytes:receipt.bytes,sha256:receipt.sha256,nativeSha256:receipt.nativeSha256});
}finally{
  assert.equal(path.dirname(temp),path.join(root,'.artifacts'));
  fs.rmSync(temp,{recursive:true,force:true});
}
