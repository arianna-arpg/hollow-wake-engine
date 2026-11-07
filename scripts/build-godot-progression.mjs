import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {npmCli} from './npm-cli.mjs';
import {composedAddon} from './godot-addon-inventory.mjs';

const args=process.argv.slice(2), options={};
assert(['win32','linux'].includes(process.platform));assert.equal(process.arch,'x64');
assert.equal(args.length,6,'--base DIRECTORY --library-proof DIRECTORY --tools JSON');
for(let i=0;i<args.length;i+=2){assert(['--base','--library-proof','--tools'].includes(args[i]));assert(!Object.hasOwn(options,args[i]));options[args[i]]=fs.realpathSync(args[i+1]);}
const read=f=>JSON.parse(fs.readFileSync(f)),hash=f=>sha256(fs.readFileSync(f));
const baseFile=path.join(options['--base'],'verification.json'),base=read(baseFile),tools=read(options['--tools']);
const libraryFile=path.join(options['--library-proof'],'verification.json'),library=read(libraryFile);
assert(base.passed&&base.platform===process.platform&&base.arch==='x64'&&base.editor.passed&&base.release.passed);
assert(library.passed&&library.inputsUnchanged&&library.status==='completed');
assert.equal(hash(libraryFile),base.libraryProofSha256);
for(const file of ['experiments/godot-native/host.cpp','experiments/godot-native/hollow_wake.gdextension',
  'experiments/godot-native/toolchain-lock.json','experiments/godot-native/CMakeLists.txt',
  'experiments/embedded-js/native/hwe_embedded.h','LICENSE.md','NOTICE.md'])assert.equal(hash(path.join(root,file)),base.sources[file],file);
// Test-harness changes do not change a native library. Verify every compiled
// implementation/header/allocator and its exact upstream pin independently.
for(const file of ['experiments/embedded-js/native/hwe_embedded.c','experiments/embedded-js/native/hwe_embedded.h',
  'experiments/embedded-js/tracked-allocator.h','experiments/embedded-js/host-source-lock.json'])assert.equal(hash(path.join(root,file)),library.sourceHashes[file],file);
const nativeName=process.platform==='win32'?'hwe_embedded.dll':'libhwe_embedded.so';
assert.equal(base.addon.files['bin/'+nativeName],library.librarySha256);
assert.equal(hash(path.join(options['--library-proof'],nativeName)),library.librarySha256);
const archiveBase=path.join(options['--base'],'hollow-wake-godot-experimental.zip');assert.equal(hash(archiveBase),base.addon.archiveSha256);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/godot-progression-addon-'));
const extra=path.join(directory,'extra'),consumer=path.join(directory,'consumer');fs.mkdirSync(extra);fs.mkdirSync(consumer);
const npm=npmCli(), commands=[];
function run(name,command,args,cwd=consumer){
  const log=path.join(directory,name+'.txt'),fd=fs.openSync(log,'wx');
  try{execFileSync(command,args,{cwd,windowsHide:true,stdio:['ignore',fd,fd],timeout:180000});}
  finally{fs.closeSync(fd);commands.push({name,logSha256:hash(log)});}
}
run('runtime-build',process.execPath,[npm,'run','build'],root);
// Content compilers import dist modules. Load them only after the build, so a
// clean checkout does not require a previous run's compiled output.
const [{unlockContentPack},{memoryRewardPack},{progressionGatePack}]=await Promise.all([
  import('./compile-unlock-content.mjs'),import('./compile-memory-rewards.mjs'),import('./compile-progression-gates.mjs'),
]);
const content={unlocks:unlockContentPack(),gates:progressionGatePack(),memories:memoryRewardPack()};
const compiled=read(path.join(root,'baseline/unlock-lifecycle/compiled-content.json'));
for(const [key,pack] of Object.entries(content)){
  assert.equal(pack.contentId,compiled.packs[key].contentId);assert.equal(sha256(JSON.stringify(pack,null,2)+'\n'),compiled.packs[key].sha256);
}
writeJSON(path.join(extra,'content.json'),content);
run('pack',process.execPath,[npm,'pack','--json','--ignore-scripts','--pack-destination',directory,'--cache',path.join(root,'.artifacts/npm-cache')],root);
const packed=read(path.join(directory,'pack.txt'))[0],archiveSDK=path.join(directory,packed.filename);
writeJSON(path.join(consumer,'package.json'),{name:'hollow-progression-consumer',private:true,type:'module'});
run('install',process.execPath,[npm,'install',archiveSDK,'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(root,'.artifacts/npm-cache')]);
const source=path.join(root,'adapters/godot/progression');fs.copyFileSync(path.join(source,'session.mjs'),path.join(consumer,'session.mjs'));
fs.copyFileSync(path.join(extra,'content.json'),path.join(consumer,'content.json'));
const contract=fs.readFileSync(path.join(root,'test/progression-session.test.mjs'),'utf8');
const imports=contract.slice(contract.indexOf("import {unlockContentPack}"),contract.indexOf('const clean ='));
assert(imports.includes('const content ='));
fs.writeFileSync(path.join(consumer,'contract.test.mjs'),contract.replace("'../dist/progression-session.js'","'@hollow-wake/engine/progression/session'")
  .replace(imports,"import fs from 'node:fs';\nconst content=JSON.parse(fs.readFileSync(new URL('./content.json',import.meta.url)));\n"));
run('consumer-contract',process.execPath,['--test','contract.test.mjs']);
fs.writeFileSync(path.join(consumer,'types.ts'),"import {ProgressionSession,type ProgressionSessionContent} from '@hollow-wake/engine/progression/session';\ndeclare const content:ProgressionSessionContent;\nnew ProgressionSession(content).command({op:'open',profile:0,seed:1});\n");
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022'],types:[]},files:['types.ts']});
run('consumer-types',process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.json']);
const bundle=path.join(extra,'bundle.txt');
const bridge=['entry.mjs','number-wire.mjs'];
for(const f of bridge)fs.copyFileSync(path.join(root,'adapters/godot/shared',f),path.join(consumer,f));
const result=await build({absWorkingDir:consumer,entryPoints:['entry.mjs'],bundle:true,format:'iife',platform:'neutral',target:'es2022',
  globalName:'HollowWakeSession',minify:true,outfile:bundle,metafile:true,tsconfigRaw:{}});
const inputs=Object.keys(result.metafile.inputs);assert(inputs.includes('node_modules/@hollow-wake/engine/dist/progression-session.js'));
assert(inputs.every(f=>f==='session.mjs'||bridge.includes(f)||f.startsWith('node_modules/@hollow-wake/engine/dist/')));
assert(Object.values(result.metafile.outputs).every(row=>row.imports.length===0));
const bundleBytes=fs.statSync(bundle).size,contentBytes=fs.statSync(path.join(extra,'content.json')).size;
assert(bundleBytes<=96*1024&&contentBytes<=512*1024,'Explicit package asset limit exceeded');
for(const file of ['progression.gd','README.md'])fs.copyFileSync(path.join(source,file),path.join(extra,file));
fs.copyFileSync(path.join(root,'adapters/godot/shared/owned_session.gd'),path.join(extra,'owned_session.gd'));
const files=Object.fromEntries(['owned_session.gd','bundle.txt','content.json','progression.gd','README.md'].map(f=>[f,hash(path.join(extra,f))]));
writeJSON(path.join(extra,'manifest.json'),{schemaVersion:1,capability:'progression-session/v1',experimental:true,
  baseSha256:base.addon.archiveSha256,content:Object.values(content).map(p=>p.contentId),sdkArchiveSha256:hash(archiveSDK),files});
const archive=path.join(directory,'hollow-wake-godot-progression-'+(process.platform==='win32'?'windows':'linux')+'-x64.zip');
writeJSON(path.join(directory,'base-files.json'),base.addon);
run('archive-contracts',tools.python,['-I',path.join(root,'test/godot-addon-archive.py')]);
run('assemble',tools.python,['-I',path.join(root,'scripts/godot-proc-example-archive.py'),'assemble',archiveBase,path.join(directory,'base-files.json'),extra,archive,'progression']);
const sourceFiles=[...bridge.map(f=>'adapters/godot/shared/'+f),'scripts/godot-addon-inventory.mjs','adapters/godot/shared/owned_session.gd','src/progression-session.ts','test/progression-session.test.mjs','scripts/build-godot-progression.mjs','scripts/godot-proc-example-archive.py','test/godot-addon-archive.py',
  ...['session.mjs','progression.gd','README.md'].map(f=>'adapters/godot/progression/'+f)];
const report={passed:true,directory,platform:process.platform,arch:process.arch,archive,archiveSha256:hash(archive),archiveBytes:fs.statSync(archive).size,
  sdkArchive:archiveSDK,sdkArchiveSha256:hash(archiveSDK),baseProofSha256:hash(baseFile),libraryProofSha256:hash(libraryFile),
  sources:Object.fromEntries(sourceFiles.map(f=>[f,hash(path.join(root,f))])),files,bundleBytes,contentBytes,inputs,commands,
  addon:composedAddon(hash(archive),base.addon,'progression',files,hash(path.join(extra,'manifest.json')))};
writeJSON(path.join(directory,'package.json'),report);writeJSON(path.join(root,'.artifacts/godot-progression-addon-latest.json'),{directory,receipt:path.join(directory,'package.json')});
console.log({passed:true,archive,bundleBytes,contentBytes});
