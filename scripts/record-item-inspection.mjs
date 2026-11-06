import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {inspectionTerms} from './compile-inspection-terms.mjs';
import {root,sha256} from './reference-utils.mjs';

// Join the original item corpus to the actual exported workshop and its archives.
const [desktopFile,workshopFile,corpusFile,target,...rest]=process.argv.slice(2);
assert(target&&!rest.length,'Expected desktop, workshop, corpus and new output paths');
const read=f=>JSON.parse(fs.readFileSync(f)),hash=f=>sha256(fs.readFileSync(f));
const desktop=read(desktopFile),workshop=read(workshopFile),corpus=read(corpusFile);
const frozen=read(path.join(root,'baseline/item-inspection/observations.json'));
const terms=inspectionTerms(),bytes=JSON.stringify(terms)+'\n';
assert(desktop.passed&&workshop.passed&&corpus.passed);
assert.equal(desktop.platform,workshop.platform);
assert.equal(desktop.version,read(path.join(root,'package.json')).version);
assert.equal(desktop.arch,workshop.arch);
assert.equal(desktop.package.archiveSha256,workshop.addonSha256);
assert.equal(corpus.vocabularySha256,frozen.termsSha256);
assert.equal(corpus.blocksSha256,sha256(JSON.stringify(frozen.blocks)));
assert.equal(corpus.transportBytes,Buffer.byteLength(bytes));
assert.equal(corpus.observations,frozen.count);assert.equal(corpus.comparisons,frozen.count);
const inspection=workshop.inspection;
assert.equal(inspection.originalCards,frozen.samples.length);
assert.equal(inspection.originalComparisons,frozen.samples.length);
assert(inspection.keyboardScroll&&inspection.saveUnchanged);
assert(inspection.heap.closed&&!inspection.heap.poisoned&&!inspection.heap.delivery_failed);
assert.equal(inspection.heap.live_bytes,0);assert.equal(inspection.heap.live_blocks,0);
assert(inspection.heap.peak_bytes>0&&inspection.heap.peak_bytes<=desktop.capBytesPerHost);
assert(inspection.secondProfileItems===128 && inspection.secondProfileLore===3929);
assert(workshop.render.width===960&&workshop.render.height===600);
const folder=path.dirname(workshopFile);
for(const [name,digest] of Object.entries(workshop.archives)){
  assert.equal(name,path.basename(name));assert.equal(hash(path.join(folder,name)),digest);
}
assert.equal(hash(path.join(folder,'inventory.png')),workshop.render.sha256);
const evidence={schemaVersion:1,passed:true,version:desktop.version,platform:desktop.platform,arch:desktop.arch,
  corpus,vocabulary:{bytes:Buffer.byteLength(bytes),sha256:sha256(bytes),itemContentId:terms.itemsId},
  native:{...inspection,capBytesPerHost:desktop.capBytesPerHost,render:workshop.render},
  archives:{addon:workshop.addonSha256,...workshop.archives},
  receipts:{desktop:hash(desktopFile),workshop:hash(workshopFile),corpus:hash(corpusFile)}};
fs.mkdirSync(path.dirname(target),{recursive:true});
fs.writeFileSync(target,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
console.log({platform:desktop.platform,cards:corpus.observations,peakBytes:inspection.heap.peak_bytes});
