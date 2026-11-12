import {packageRuntimeFiles} from './package-runtime-files.mjs';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {gunzipSync} from 'node:zlib';
import {workshopBundles} from './godot-crafting-bundle.mjs';
import {writeSupportGate} from './compile-workshop-supports.mjs';
import {writePouchRecall} from './build-pouch-recall.mjs';
import {root,sha256,writeJSON,listFiles} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';
import {composedAddon} from './godot-addon-inventory.mjs';
import {inspectionTerms} from './compile-inspection-terms.mjs';
import {writeCargoAtlas} from './compile-cargo-cards.mjs';
import {itemPack,equipmentPack} from './compile-item-content.mjs';import {craftingPack} from './compile-crafting-content.mjs';import {skillProgressionPack} from './compile-skill-progression.mjs';

// Extend the verified progression package, preserving its native extension,
// definitions, wrappers and licenses byte for byte. Install exactly its SDK.
const args=process.argv.slice(2);assert.deepEqual([args.length,args[0],args[2]],[4,'--progression','--tools']);
const read=f=>JSON.parse(fs.readFileSync(f)),hash=f=>sha256(fs.readFileSync(f));
const progressionFile=fs.realpathSync(args[1]),previous=read(progressionFile),tools=read(args[3]);
assert(previous.passed&&previous.platform===process.platform&&previous.arch===process.arch&&previous.arch==='x64');assert.equal(hash(previous.archive),previous.archiveSha256);assert.equal(hash(previous.sdkArchive),previous.sdkArchiveSha256);assert.equal(previous.addon.archiveSha256,previous.archiveSha256);
for(const [f,digest] of Object.entries(previous.sources))assert.equal(hash(path.join(root,f)),digest,'Changed progression package source: '+f);
const proof=read(path.join(root,'evidence/content-tables/windows.json'));assert(proof.passed);assert.equal(hash(path.join(root,proof.raw.file)),proof.raw.sha256);
const retained=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,proof.raw.file))));assert.equal(retained.course.rows.length,proof.native.commands);assert.equal(proof.native.commands,56);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/godot-crafting-addon-')),consumer=path.join(directory,'consumer'),extra=path.join(directory,'extra');
try {
fs.mkdirSync(consumer);fs.mkdirSync(extra);
const commands=[];function run(name,command,args,cwd=consumer){const log=path.join(directory,name+'.txt'),fd=fs.openSync(log,'wx');try{execFileSync(command,args,{cwd,windowsHide:true,stdio:['ignore',fd,fd],timeout:180000});}finally{fs.closeSync(fd);commands.push({name,logSha256:hash(log)});}}
writeJSON(path.join(consumer,'package.json'),{name:'hollow-crafting-consumer',private:true,type:'module'});
run('install',process.execPath,[npmCli(),'install',previous.sdkArchive,'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(root,'.artifacts/npm-cache')]);
const installed=path.join(consumer,'node_modules/@hollow-wake/engine/dist');assert.deepEqual(listFiles(installed),packageRuntimeFiles());
assert.equal(read(path.join(installed,'../package.json')).version,read(path.join(root,'package.json')).version);
for(const f of listFiles(installed))assert.equal(hash(path.join(installed,f)),hash(path.join(root,'dist',f)),f);
const packs={items:itemPack(),crafting:craftingPack(),skills:skillProgressionPack()};const plain=JSON.stringify(packs);assert.equal(sha256(plain),proof.content.contentSha256);
fs.writeFileSync(path.join(consumer,'source.json'),plain);fs.writeFileSync(path.join(consumer,'course.json'),JSON.stringify(retained.course));
fs.copyFileSync(path.join(root,'adapters/embedded/crafting-session.mjs'),path.join(consumer,'session.mjs'));
fs.writeFileSync(path.join(consumer,'compile.mjs'),`import fs from 'node:fs';import assert from 'node:assert/strict';import {encodeContentTable} from '@hollow-wake/engine/content/table/compiler';import {decodeContentTable} from '@hollow-wake/engine/content/table';import {create,dispatch} from './session.mjs';
const plain=fs.readFileSync('source.json','utf8'),table=encodeContentTable(JSON.parse(plain));assert.equal(JSON.stringify(decodeContentTable(table)),plain);fs.writeFileSync('content.json',JSON.stringify(table));const host=create(table);assert.equal(table.nodes.length,0);const course=JSON.parse(fs.readFileSync('course.json'));for(const {request,expected}of course.rows)assert.deepEqual(JSON.parse(JSON.stringify(dispatch(host,request))),expected);console.log({commands:course.rows.length,completeOrderedContent:true});`);
run('compile-and-replay',process.execPath,['compile.mjs']);assert.equal(hash(path.join(consumer,'content.json')),proof.content.tableSha256);fs.copyFileSync(path.join(consumer,'content.json'),path.join(extra,'content.json'));
const bridge=['entry.mjs','number-wire.mjs'];
for(const f of bridge)fs.copyFileSync(path.join(root,'adapters/godot',f==='entry.mjs'?'crafting':'shared',f),path.join(consumer,f));
const inspectionPath=path.join(extra,'inspection.json');
fs.writeFileSync(inspectionPath,JSON.stringify(inspectionTerms())+'\n');
assert(fs.statSync(inspectionPath).size<=64*1024);
fs.writeFileSync(path.join(extra,'equipment.json'),JSON.stringify(equipmentPack())+'\n');
writeCargoAtlas(extra,packs.skills.contentId,packs.crafting.contentId);
fs.copyFileSync(path.join(root,'adapters/godot/crafting/rack-entry.mjs'),path.join(consumer,'rack-entry.mjs'));
fs.copyFileSync(path.join(root,'adapters/godot/crafting/support-entry.mjs'),path.join(consumer,'support-entry.mjs'));
fs.copyFileSync(path.join(root,'adapters/godot/crafting/vestige-entry.mjs'),path.join(consumer,'vestige-entry.mjs'));
await writeSupportGate(extra);
fs.copyFileSync(path.join(root,'adapters/godot/crafting/pouch-entry.mjs'),path.join(consumer,'pouch-entry.mjs'));
fs.copyFileSync(path.join(root,'adapters/embedded/pouch-session.mjs'),path.join(consumer,'pouch-session.mjs'));
await writePouchRecall(extra,path.join(consumer,'pouch-entry.mjs'));
fs.copyFileSync(path.join(root,'adapters/godot/crafting/pouch_recall.gd'),path.join(extra,'pouch_recall.gd'));
const {base,rack,support,vestiges}=await workshopBundles(consumer),inputs=vestiges.inputs;
assert(inputs.includes('node_modules/@hollow-wake/engine/dist/content-table.js')&&inputs.includes('node_modules/@hollow-wake/engine/dist/crafting-session.js'));
assert(inputs.every(f=>f==='session.mjs'||f==='vestige-entry.mjs'||bridge.includes(f)||f.startsWith('node_modules/@hollow-wake/engine/dist/')));
fs.writeFileSync(path.join(extra,'bundle.txt'),vestiges.bytes);
const bundleBytes=vestiges.bytes.length,contentBytes=fs.statSync(path.join(extra,'content.json')).size;assert(contentBytes<=2*1024*1024);
for(const f of ['README.md','crafting.gd','cargo_cards.gd'])fs.copyFileSync(path.join(root,'adapters/godot/crafting',f),path.join(extra,f));fs.copyFileSync(path.join(root,'adapters/godot/shared/owned_session.gd'),path.join(extra,'owned_session.gd'));
fs.copyFileSync(path.join(root,'adapters/godot/crafting/support_fit.gd'),path.join(extra,'support_fit.gd'));
const files=Object.fromEntries(['README.md','crafting.gd','owned_session.gd','cargo_cards.gd','content.json','inspection.json','equipment.json','cargo-index.json','cargo-pages.txt','bundle.txt','support_fit.gd','support-fit.txt','support-index.json','support-pages.txt','pouch_recall.gd','pouch-rules.txt','pouch-data.json'].map(f=>[f,hash(path.join(extra,f))]));
const content=[packs.items.id,packs.crafting.contentId,packs.skills.contentId];
assert.deepEqual(content,retained.course.rows.find(row=>row.expected.save).expected.save.content.slice(0,3));
const sizes={baseBytes:base.bytes.length,rackBytes:rack.bytes.length-base.bytes.length,socketBytes:support.bytes.length-rack.bytes.length,vestigeBytes:bundleBytes-support.bytes.length};
const capabilities=['crafting-session/v2','crafting-session/v3','workshop-supports/v1','pouch-recall/v1','vestige-inlays/v1','crafting-view/v1','crafting-station/v1'];
writeJSON(path.join(extra,'manifest.json'),{schemaVersion:1,experimental:true,capability:'crafting-session/v1',optional:capabilities,...sizes,transport:'content-table/v1',content,parentAddonSha256:previous.archiveSha256,sdkArchiveSha256:previous.sdkArchiveSha256,files});
const capabilityProof=path.join(directory,'capabilities.json');
run('bundled-capabilities',process.execPath,[path.join(root,'scripts/test-godot-capability-faults.mjs'),'--assets',extra,'--consumer',consumer,'--out',capabilityProof]);
writeJSON(path.join(directory,'base-files.json'),previous.addon);const archive=path.join(directory,'hollow-wake-godot-crafting-progression-'+(process.platform==='win32'?'windows':'linux')+'-x64.zip');
run('archive-contracts',tools.python,['-I',path.join(root,'test/godot-addon-archive.py')]);run('assemble',tools.python,['-I',path.join(root,'scripts/godot-proc-example-archive.py'),'assemble',previous.archive,path.join(directory,'base-files.json'),extra,archive,'crafting']);
const sources=['adapters/godot/crafting/cargo_cards.gd','scripts/compile-cargo-cards.mjs','baseline/cargo-cards/acceptance.json','baseline/cargo-cards/faces.json.gz','adapters/godot/crafting/entry.mjs','scripts/compile-inspection-terms.mjs','baseline/item-inspection/terms.json.gz','baseline/item-inspection/observations.json','scripts/godot-addon-inventory.mjs','adapters/embedded/crafting-session.mjs','adapters/godot/shared/owned_session.gd','adapters/godot/crafting/crafting.gd','adapters/godot/crafting/README.md','scripts/build-godot-crafting.mjs','scripts/godot-proc-example-archive.py','test/godot-addon-archive.py','evidence/content-tables/windows.json'];
sources.push('adapters/godot/crafting/rack-entry.mjs','adapters/godot/crafting/support-entry.mjs','adapters/godot/crafting/vestige-entry.mjs','test/godot-crafting/bundle-contract.mjs','scripts/test-godot-capability-faults.mjs','adapters/godot/crafting/support_fit.gd','scripts/godot-crafting-bundle.mjs',
  'adapters/embedded/support-fit.mjs','adapters/embedded/support-fit-pages.mjs','scripts/compile-workshop-supports.mjs','baseline/workshop-supports/acceptance.json');
sources.push('adapters/embedded/pouch-session.mjs','adapters/godot/crafting/pouch-entry.mjs','adapters/godot/crafting/pouch_recall.gd','scripts/build-pouch-recall.mjs',
  'content/pouch-recall.json','baseline/pouch-recall/acceptance.json','src/pouch-recall.ts');
const report={passed:true,directory,platform:process.platform,arch:process.arch,archive,archiveSha256:hash(archive),archiveBytes:fs.statSync(archive).size,progressionArchiveSha256:previous.archiveSha256,progressionProofSha256:hash(progressionFile),sdkArchiveSha256:previous.sdkArchiveSha256,baseProofSha256:previous.baseProofSha256,libraryProofSha256:previous.libraryProofSha256,files,bundleBytes,...sizes,contentBytes,immutableCourseSha256:proof.native.courseSha256,commandsReplayed:retained.course.rows.length,inputs,commands,sources:Object.fromEntries(sources.map(f=>[f,hash(path.join(root,f))])),
  capabilityControls:read(capabilityProof),addon:composedAddon(hash(archive),previous.addon,'crafting',files,hash(path.join(extra,'manifest.json')))};
writeJSON(path.join(directory,'package.json'),report);writeJSON(path.join(root,'.artifacts/godot-crafting-addon-latest.json'),{directory,receipt:path.join(directory,'package.json')});console.log({passed:true,directory,archive,bundleBytes,contentBytes,commands:report.commandsReplayed});
} finally {
  // Node dependencies and generated consumer inputs are not release artifacts.
  // Retain receipts/logs and the sealed addon, including on a failed build.
  fs.rmSync(consumer,{recursive:true,force:true,maxRetries:8,retryDelay:250});
}
