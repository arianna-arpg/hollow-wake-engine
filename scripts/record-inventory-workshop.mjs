import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {listFiles,root,sha256,writeJSON} from './reference-utils.mjs';
const [buildFlag,buildFile,verifiedFlag,verifiedFile,outFlag,target,...rest]=process.argv.slice(2);
assert.deepEqual([buildFlag,verifiedFlag,outFlag,rest.length],['--build','--verified','--out',0]);
const read=f=>JSON.parse(fs.readFileSync(f)),hash=f=>sha256(fs.readFileSync(f));
const b=read(buildFile),v=read(verifiedFile);
assert(b.built && v.passed);assert.equal(v.buildSha256,hash(buildFile));
assert.deepEqual(v.archives,b.archives);
assert.deepEqual(v.crashes.map(r=>r.phase),['before-stage','after-stage','after-commit']);
assert(v.crashes.every(r=>r.terminated) && v.crashes[1].journalBytes>0);
assert.equal(v.revisionAfterUI,5);
for(const check of ['race-read','busy-commit','stale-read','withdraw-read','reject-duplicate','reject-full-stash','reject-foreign','screen','shipping-player']){
  assert(v.runs.some(row=>row.label===check),check);
}
for(const row of v.runs)assert.equal(hash(path.join(v.dir,row.label+'.txt')),row.logSha256,row.label);
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
    ...(v.cargo?{cargoRepliesSha256:v.cargo.repliesSha256,cargoQuote:v.cargo.quote,cargoCases:v.cargo.cases}:{})});
}
const summary={schemaVersion:1,passed:true,platform:process.platform,arch:process.arch,
  buildSha256:hash(buildFile),verificationSha256:hash(verifiedFile),nativeReceiptSha256:b.nativeReceiptSha256,
  addonSha256:b.addonSha256,saveLibrarySha256:b.librarySha256,archives:b.archives,originalCourseSha256:v.originalCourseSha256,
  originalCheckpointSha256:v.originalCheckpointSha256,crashes:v.crashes,checks:v.runs,inspection:v.inspection,cargo:v.cargo,render:v.screenshot??null};
writeJSON(path.join(out,'verification.json'),summary);
console.log({passed:true,out,packages:Object.keys(b.archives)});
