import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,sha256} from './reference-utils.mjs';

// Join the source-capture, portable SDK, native editor/export and inventory
// tests. Verify the bytes of the distributable archives before recording them.
const [sdkFile,desktopFile,workshopFile,addon,target,...rest]=process.argv.slice(2);
assert(target&&!rest.length,'Expected corpus, desktop, workshop, addon ZIP and new record path');
const read=f=>JSON.parse(fs.readFileSync(f)),hash=f=>sha256(fs.readFileSync(f));
const original=read(path.join(root,'baseline/cargo-cards/acceptance.json')),sdk=read(sdkFile);
const desktop=read(desktopFile),workshop=read(workshopFile),native=workshop.cargo,folder=path.dirname(workshopFile);
assert(sdk.passed&&workshop.passed&&desktop.passed);
assert.equal(sdk.originalCards,original.files['cards.jsonl'].sha256);assert.equal(sdk.visible,original.counts.accepted);
assert.equal(sdk.unknown+sdk.foreign,original.counts.refused);assert.equal(sdk.pageCount,32);assert(sdk.largestPage<=32768);
assert.equal(workshop.platform,desktop.platform);assert.equal(workshop.arch,desktop.arch);
assert.equal(hash(addon),desktop.package.archiveSha256);assert.equal(workshop.addonSha256,desktop.package.archiveSha256);
assert.equal(desktop.version,read(path.join(root,'package.json')).version);
assert.equal(native.cases,25);assert(native.cancelKeptSave&&native.staleSaleRefused);assert.equal(native.confirmedRevision,3);
assert(native.cache['1'].reads>0&&native.cache['4'].reads===0&&native.cache['4'].pages===4);
assert.equal(native.afterClose.retainedPages,0);assert.equal(native.afterClose.sourceBytes,0);
assert(native.heap.closed&&!native.heap.poisoned&&!native.heap.delivery_failed);
assert.equal(native.heap.live_bytes,0);assert.equal(native.heap.live_blocks,0);assert(native.heap.peak_bytes>0&&native.heap.peak_bytes<=desktop.capBytesPerHost);
for(const check of ['cargo-screen','cargo-corrupt','shipping-cargo-sample','shipping-player'])assert(workshop.checks.some(r=>r.label===check),check);
assert.equal(hash(path.join(folder,'cargo.png')),native.screenshot);
for(const [name,digest] of Object.entries(workshop.archives)){assert.equal(name,path.basename(name));assert.equal(hash(path.join(folder,name)),digest);}
const receipt={schemaVersion:1,passed:true,version:desktop.version,platform:desktop.platform,arch:desktop.arch,
  corpus:sdk,native,retainedCraftingCommands:desktop.observations.rows,capBytesPerHost:desktop.capBytesPerHost,
  shippedSample:true,corruptPageRefused:true,archives:{addon:workshop.addonSha256,...workshop.archives},
  receipts:{original:hash(path.join(root,'baseline/cargo-cards/acceptance.json')),sdk:hash(sdkFile),desktop:hash(desktopFile),workshop:hash(workshopFile)}};
fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
console.log({platform:receipt.platform,originalCases:original.counts.cases,exportedCases:native.cases,peak:native.heap.peak_bytes});
