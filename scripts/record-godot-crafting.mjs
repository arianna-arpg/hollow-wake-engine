import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {root,sha256,writeJSON} from './reference-utils.mjs';

// Collect only mutually matching successful builds and replays. A clean
// destination keeps CI reruns from overwriting an earlier acceptance record.
const [flag,out,...rest]=process.argv.slice(2);
assert(flag==='--out'&&out&&!rest.length,'--out NEW_DIRECTORY');
const target=path.resolve(out);
assert(!fs.existsSync(target),'Evidence destination already exists');
const read=f=>JSON.parse(fs.readFileSync(f)), hash=f=>sha256(fs.readFileSync(f));
function latest(name){
  const {receipt}=read(path.join(root,'.artifacts',name+'-latest.json'));
  const data=read(receipt);assert(data.passed,name);
  for(const [f,h] of Object.entries(data.sources??{}))assert.equal(hash(path.join(root,f)),h,f);
  return {data,sha:hash(receipt)};
}
const pkg=latest('godot-crafting-addon'),progression=latest('godot-progression-addon');
const replay=latest('godot-crafting-replay'),priorReplay=latest('godot-progression-replay');
const faults=latest('progression-session-faults');
const wrapperFaults=latest('godot-crafting-faults');
const isolatedCertificateDiagnostic='ERROR: Failed to read the root certificate store.';
const diagnostics={isolatedWindowsCertificateMessages:0};
function verifyEngineLog(directory,label,expected){
  const file=path.join(directory,label+'.txt');assert.equal(hash(file),expected);
  for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){
    if(process.platform==='win32'&&line===isolatedCertificateDiagnostic){diagnostics.isolatedWindowsCertificateMessages++;continue;}
    assert(!/ERROR:|Parse Error:|WARNING:.*(?:leak|ObjectDB)/i.test(line),label+': '+line);
  }
}
assert.equal(wrapperFaults.data.archiveSha256,pkg.data.archiveSha256);
assert.deepEqual(wrapperFaults.data.runs.map(({label,status})=>[label,status]),[
  ['import',0],['control-before',0],['item-roll-precision',1],['automatic-sale-lane',1],['transfer-releases-custody',1],['control-after',0]]);
for(const run of wrapperFaults.data.runs)verifyEngineLog(wrapperFaults.data.directory,run.label,run.logSha256);
assert.equal(pkg.data.progressionProofSha256,progression.sha);
assert.equal(pkg.data.progressionArchiveSha256,progression.data.archiveSha256);
assert.equal(pkg.data.sdkArchiveSha256,progression.data.sdkArchiveSha256);
assert.equal(hash(progression.data.sdkArchive),pkg.data.sdkArchiveSha256);
assert.equal(faults.data.archiveSha256,pkg.data.sdkArchiveSha256);
assert.equal(faults.data.runs.length,4);
for(const run of faults.data.runs)assert(run.controlPassed&&run.faultDetected);
for(const [built,played] of [[pkg,replay],[progression,priorReplay]]){
  assert.equal(hash(built.data.archive),built.data.archiveSha256);
  assert.equal(played.data.packageReceiptSha256,built.sha);
  assert.equal(played.data.archiveSha256,built.data.archiveSha256);
  assert(played.data.editor.passed&&played.data.release.passed&&played.data.releaseWithoutProject);
  assert.deepEqual(played.data.commands.map(c=>c.name),['import','editor','export','release']);
  for(const run of played.data.commands){
    assert.equal(run.exitCode,0);verifyEngineLog(played.data.directory,run.name,run.logSha256);
  }
}
const source=read(path.join(root,'evidence/content-tables/windows.json'));
const raw=fs.readFileSync(path.join(root,source.raw.file));assert.equal(sha256(raw),source.raw.sha256);
const {course}=JSON.parse(gunzipSync(raw));assert.equal(sha256(JSON.stringify(course,null,2)+'\n'),pkg.data.immutableCourseSha256);
const expected=course.rows.map(r=>r.expected);
let observations;
for(const name of ['editor','release']){
  const observed=fs.readFileSync(path.join(replay.data.directory,name+'-observations.jsonl'));
  assert.equal(sha256(observed),replay.data.observations[name].sha256);
  assert.deepEqual(observed.toString('utf8').trimEnd().split('\n').map(line=>JSON.parse(line)),expected);
  // Both executions must emit the same values in the same order. Retain one copy.
  if(observations)assert(observations.equals(observed));else observations=observed;
}
const {archiveSha256,archiveBytes,sdkArchiveSha256,progressionArchiveSha256,bundleBytes,contentBytes,files,addon,libraryProofSha256,baseProofSha256}=pkg.data;
const sources={...progression.data.sources,...pkg.data.sources,...priorReplay.data.sources,...replay.data.sources,...wrapperFaults.data.sources,
  'scripts/record-godot-crafting.mjs':hash(path.join(root,'scripts/record-godot-crafting.mjs'))};
const compressed=gzipSync(observations,{level:9});
const stem=process.platform==='win32'?'windows':process.platform;
const rawName=stem+'-observations.jsonl.gz';
const proof={schemaVersion:1,passed:true,version:read(path.join(root,'package.json')).version,platform:process.platform,arch:process.arch,
  scope:'Godot 4.7.2 desktop editor and relocated release; selected crafting and progression capabilities.',
  package:{archiveSha256,archiveBytes,sdkArchiveSha256,progressionArchiveSha256,bundleBytes,contentBytes,files,
    ...(pkg.data.baseBytes===undefined?{}:{baseBytes:pkg.data.baseBytes,rackBytes:pkg.data.rackBytes,...(pkg.data.socketBytes!==undefined?{socketBytes:pkg.data.socketBytes}:{})}),
    libraries:Object.fromEntries(Object.entries(addon.files).filter(([f])=>f.startsWith('bin/'))),libraryProofSha256,baseProofSha256},
  fixture:replay.data.fixture,capBytesPerHost:32*1024*1024,crafting:{editor:replay.data.editor,release:replay.data.release,releaseWithoutProject:true,
    wrapperControls:wrapperFaults.data.runs},diagnostics,
  progression:{editor:priorReplay.data.editor,release:priorReplay.data.release,releaseWithoutProject:true,detectedFaults:faults.data.runs.map(r=>r.name)},
  observations:{file:rawName,rows:expected.length,sha256:sha256(compressed),uncompressedSha256:sha256(observations),uncompressedBytes:observations.length,
    editorEqualsRelease:true,independentlyEqualsReference:true},
  receipts:{package:pkg.sha,progression:progression.sha,replay:replay.sha,progressionReplay:priorReplay.sha,faults:faults.sha,wrapperFaults:wrapperFaults.sha},
  sources,limits:['No hosted CI or physical-device claim from this local run.','Peak/live bytes cover tracked embedded allocations in one host, not total process or rendering memory.','No performance speedup claim; existing compiled-content tradeoffs apply.','Durable writes, station authority and cross-capability transactions belong to the game.']};
fs.mkdirSync(target);
fs.writeFileSync(path.join(target,rawName),compressed,{flag:'wx'});
writeJSON(path.join(target,stem+'.json'),proof);
console.log({archiveSha256,rawName,rows:expected.length,peakBytes:proof.crafting.release.metrics.peak_bytes});
