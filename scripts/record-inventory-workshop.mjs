import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {listFiles,root,sha256,writeJSON} from './reference-utils.mjs';
const [buildFlag,buildFile,verifiedFlag,verifiedFile,outFlag,target,...rest]=process.argv.slice(2);
assert.deepEqual([buildFlag,verifiedFlag,outFlag,rest.length],['--build','--verified','--out',0]);
const read=f=>JSON.parse(fs.readFileSync(f)),hash=f=>sha256(fs.readFileSync(f));
const b=read(buildFile),v=read(verifiedFile);
assert(b.built && v.passed);assert.equal(v.buildSha256,hash(buildFile));
assert.deepEqual(v.archives,b.archives);
assert.deepEqual(v.crashes.map(r=>r.phase),['before-stage','after-stage','after-commit']);
// WAL can keep a small uncommitted transaction in the page cache. Journal size
// is diagnostic; correctness is the exact checkpoint recovered by both readers.
const reference=read(path.join(root,'evidence/content-tables/windows.json'));
const packed=fs.readFileSync(path.join(root,reference.raw.file));
assert.equal(sha256(packed),reference.raw.sha256);
const {course}=JSON.parse(gunzipSync(packed));
const original=course.rows.map(row=>row.expected.save).find(s=>s?.state.overflow.length===1&&s.state.items.length===2);
assert(original);
const moved=structuredClone(original),cargo=moved.state.overflow.pop();
for(const row of v.crashes){
  assert(row.terminated&&row.barrierVerified,'crash barrier verified');
  assert(Number.isSafeInteger(row.journalBytes)&&row.journalBytes>=0,'journal observation');
  const committed=row.phase==='after-commit';
  assert.deepEqual(row.recovery,{revision:committed?2:1,
    sourceSha256:sha256(JSON.stringify(committed?moved:original)),
    stashSha256:sha256(JSON.stringify(committed?[cargo]:[])),gameEqualsDatabase:true},'exact recovered checkpoint');
}
assert.equal(v.revisionAfterUI,5);
for(const check of ['race-read','busy-commit','stale-read','withdraw-read','reject-duplicate','reject-full-stash','reject-foreign','screen','shipping-player']){
  assert(v.runs.some(row=>row.label===check),check);
}
for(const row of v.runs)assert.equal(hash(path.join(v.dir,row.label+'.txt')),row.logSha256,row.label);
assert(v.workshop?.coldImport.cacheInitiallyAbsent);
for(const mode of ['editor','player']){
  const observed=v.workshop[mode];
  for(const name of ['background','stations','inlays']){
    assert.deepEqual(observed[name].map(row=>row.resumed),[false,true]);
    for(const suffix of [name,name==='background'?'background-reopen':name+'-reopen'])
      assert(v.runs.some(row=>row.label==='workshop-'+mode+'-'+suffix));
  }
  assert.equal(observed.stations[0].assertions,79);
}
assert.equal(v.workshop.playerArchiveSha256,b.archives['hollow-wake-inventory-'+(process.platform==='win32'?'windows':'linux')+'-x64.zip']);
const out=path.resolve(target);fs.mkdirSync(out);
for(const [file,h] of Object.entries(b.archives)){
  assert.equal(path.basename(file),file);const src=path.join(b.dir,file);assert.equal(hash(src),h);
  fs.copyFileSync(src,path.join(out,file),fs.constants.COPYFILE_EXCL);
}
if(v.screenshot){
  const png=path.join(v.dir,'inventory.png');assert.equal(hash(png),v.screenshot.sha256);
  fs.copyFileSync(png,path.join(out,'inventory.png'),fs.constants.COPYFILE_EXCL);
}
if(v.cargo?.screenshot){
  const png=path.join(v.dir,'cargo.png');assert.equal(hash(png),v.cargo.screenshot);
  fs.copyFileSync(png,path.join(out,'cargo.png'),fs.constants.COPYFILE_EXCL);
}
if(process.platform==='linux'){
  const staging=path.join(out,'player-input');fs.mkdirSync(staging);
  const game=path.join(out,'hollow-wake-inventory-linux-x64.zip');
  fs.copyFileSync(game,path.join(staging,'game.zip'),fs.constants.COPYFILE_EXCL);
  fs.cpSync(path.join(v.dir,'release'),path.join(staging,'proof'),{recursive:true,force:false,errorOnExist:true});
  const fixture=path.join(v.dir,'project-unavailable','fixture.json');
  assert.equal(hash(fixture),v.originalCheckpointSha256);
  fs.copyFileSync(fixture,path.join(staging,'source.json'),fs.constants.COPYFILE_EXCL);
  fs.copyFileSync(path.join(root,'scripts/test-inventory-platform.py'),path.join(staging,'test-inventory-platform.py'));
  const proofFiles=Object.fromEntries(listFiles(path.join(staging,'proof')).map(f=>[f,hash(path.join(staging,'proof',f))]));
  writeJSON(path.join(staging,'inputs.json'),{gameSha256:hash(game),fixtureSha256:hash(fixture),proofFiles,
    ...(v.cargo?{cargoRepliesSha256:v.cargo.repliesSha256,cargoQuote:v.cargo.quote,cargoCases:v.cargo.cases}:{}),
    ...(v.loadout?{loadout:v.loadout}:{})});
}
const summary={schemaVersion:1,passed:true,platform:process.platform,arch:process.arch,
  buildSha256:hash(buildFile),verificationSha256:hash(verifiedFile),nativeReceiptSha256:b.nativeReceiptSha256,
  addonSha256:b.addonSha256,saveLibrarySha256:b.librarySha256,archives:b.archives,originalCourseSha256:v.originalCourseSha256,
  originalCheckpointSha256:v.originalCheckpointSha256,crashes:v.crashes,checks:v.runs,inspection:v.inspection,cargo:v.cargo,loadout:v.loadout,
  workshop:v.workshop,render:v.screenshot??null};
writeJSON(path.join(out,'verification.json'),summary);
console.log({passed:true,out,packages:Object.keys(b.archives)});
