import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {root,sha256} from '../../../scripts/reference-utils.mjs';
import {verifyQualifiedRuntime} from './verify-qualified-runtime.mjs';
const args=process.argv.slice(2);assert.equal(args.length,8);
assert.deepEqual([args[0],args[2],args[4],args[6]],['--parent','--runtime','--python','--output']);
const parent=fs.realpathSync(args[1]),runtime=fs.realpathSync(args[3]),python=fs.realpathSync(args[5]),out=path.resolve(args[7]);
assert(!fs.existsSync(out),'Output must be fresh');assert(fs.statSync(path.dirname(out)).isDirectory());
const native=verifyQualifiedRuntime(runtime);
const evidence=path.join(root,'evidence/unity-progression/reports.json'),accepted=JSON.parse(fs.readFileSync(evidence)).progression.package;
assert.equal(accepted.sha256,'e75f83bad493ddb159ab0217513e5216e203bdb0c7e5834a1c5dc0a8a2721317');
assert.equal(sha256(fs.readFileSync(parent)),accepted.sha256,'Use the exact public gameplay 0.4 archive');
assert.equal(accepted.name,'com.hollowwake.gameplay');assert.equal(accepted.version,'0.4.0-preview.1');
for(const[file,hash]of Object.entries(accepted.sources))assert.equal(sha256(fs.readFileSync(path.join(root,file))),hash,file);
const sdkSources={};
for(const[file,hash]of Object.entries(accepted.sdkSources)){
  // This is a byte-preserving patch of a published archive, not a new SDK build.
  // Keep its original package metadata in the parent receipt. Its compiled
  // runtime sources must still match; new unrelated exports are not included.
  if(file==='package.json')continue;
  assert.equal(sha256(fs.readFileSync(path.join(root,file))),hash,file);sdkSources[file]=hash;
}
const sourceFiles=['experiments/embedded-js/patches/package-unity-cleanup.mjs','experiments/embedded-js/patches/unity-cleanup-archive.py',
 'experiments/embedded-js/patches/verify-qualified-runtime.mjs'];
const sources={...accepted.sources,...Object.fromEntries(sourceFiles.map(file=>[file,sha256(fs.readFileSync(path.join(root,file)))])),...native.sources};
const version='0.4.1-preview.1',file=accepted.name+'-'+version+'.tgz',artifacts=fs.realpathSync(path.join(root,'.artifacts'));
const work=fs.mkdtempSync(path.join(artifacts,'unity-cleanup-package-'));
try{
  const archive=path.join(work,file),inventoryFile=path.join(work,'inventory.json');
  const provenance={schemaVersion:1,profile:native.profile,parentPackageSha256:accepted.sha256,
    nativeSha256:native.files['hwe_embedded.dll'],upstream:native.patch,sourceHashes:native.sources,
    behavior:'CString allocation-failure cleanup; optional explicit idle collection is available in the native ABI. No automatic collection policy is installed.',
    engineQualified:false,deviceQualified:false};
  // Build-machine paths are not needed in the installed provenance document.
  delete provenance.upstream.directory;
  const config={parent,native:path.join(runtime,'hwe_embedded.dll'),version,provenance,output:archive,inventory:inventoryFile};
  fs.writeFileSync(path.join(work,'input.json'),JSON.stringify(config));
  execFileSync(python,['-I','-B',path.join(root,'experiments/embedded-js/patches/unity-cleanup-archive.py'),path.join(work,'input.json')],
    {cwd:root,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work},windowsHide:true,stdio:'pipe',timeout:30000});
  const inventory=JSON.parse(fs.readFileSync(inventoryFile));
  assert.equal(inventory.files['package/Runtime/Native/Windows/hwe_embedded.dll'],native.files['hwe_embedded.dll']);
  const receipt={...accepted,version,file,bytes:fs.statSync(archive).size,sha256:sha256(fs.readFileSync(archive)),
    kind:'Native-only patch of the exact published Unity package; actual engine acceptance is a separate gate.',
    parentPackageSha256:accepted.sha256,parentReceiptSha256:sha256(JSON.stringify(accepted)),parentReceiptEvidence:'evidence/unity-progression/reports.json#progression.package',
    sdkOrigin:'Published 0.4 gameplay payload preserved byte-for-byte. The old SDK package metadata is historical; compiled runtime sources remain bound.',
    historicalSdkPackageMetadataSha256:accepted.sdkSources['package.json'],sdkSources,sources,nativeSources:native.sources,
    nativeSha256:native.files['hwe_embedded.dll'],nativeProfile:native.profile,
    nativeBuildReceiptSha256:sha256(fs.readFileSync(path.join(runtime,'runtime-receipt.json'))),archiveChanges:inventory,
    engineQualified:false,deviceQualified:false};
  for(const[source,hash]of Object.entries(sources))assert.equal(sha256(fs.readFileSync(path.join(root,source))),hash,source);
  verifyQualifiedRuntime(runtime);assert.equal(sha256(fs.readFileSync(parent)),accepted.sha256);
  fs.mkdirSync(out);fs.copyFileSync(archive,path.join(out,file));
  fs.writeFileSync(path.join(out,'parent-package-receipt.json'),JSON.stringify(accepted,null,2)+'\n',{flag:'wx'});
  fs.writeFileSync(path.join(out,'package-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  console.log({file,sha256:receipt.sha256,bytes:receipt.bytes,preservedFiles:inventory.preservedFiles,engineQualified:false});
}finally{
  assert.equal(path.dirname(fs.realpathSync(work)),artifacts);fs.rmSync(work,{recursive:true,force:true});
}
