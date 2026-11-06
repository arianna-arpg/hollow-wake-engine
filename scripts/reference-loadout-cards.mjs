import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {gzipSync,gunzipSync} from 'node:zlib';
import {root,verifyReference,sha256,writeJSON} from './reference-utils.mjs';

const capture=process.argv[2]==='--capture';
assert.equal(process.argv.length,capture?3:2);
const accepted=path.join(root,'baseline/loadout-cards'),ref=path.join(root,'.reference');
if(capture)assert(!fs.existsSync(accepted),'Original loadout observations already frozen');
const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
verifyReference(ref,lock);
const script=path.join(ref,'balance/export-sdk-loadout-cards.ts');
fs.copyFileSync(path.join(root,'reference/export-loadout-cards.ts'),script);
const dir=fs.mkdtempSync(path.join(root,'.artifacts/loadout-capture-'));
function original(name){
  const file=path.join(dir,name);
  execFileSync(process.execPath,['--import','tsx',script,path.join(root,'baseline/milestone-four/items.json.gz'),file],{cwd:ref,stdio:'inherit',windowsHide:true});
  return fs.readFileSync(file);
}
const bytes=original('first.json');
if(capture)assert(bytes.equals(original('second.json')),'Original hover replay differed');
const cases=JSON.parse(bytes),displayed=cases.filter(c=>c.expected);
assert.equal(new Set(cases.map(c=>c.label)).size,cases.length);
assert(displayed.length<cases.length && displayed.some(c=>c.expected.targets.length===2));
const manifest={schemaVersion:1,sourceCommit:lock.commit,sha256:sha256(bytes),bytes:bytes.length,
  cases:cases.length,visible:displayed.length,bases:cases.filter(c=>c.label.startsWith('base/')).length};
verifyReference(ref,lock);
if(capture){
  const stage=path.join(dir,'accepted');fs.mkdirSync(stage);
  fs.writeFileSync(path.join(stage,'observations.json.gz'),gzipSync(bytes,{level:9}));
  writeJSON(path.join(stage,'acceptance.json'),manifest);fs.renameSync(stage,accepted);
}else{
  assert.deepEqual(manifest,JSON.parse(fs.readFileSync(path.join(accepted,'acceptance.json'))));
  assert(bytes.equals(gunzipSync(fs.readFileSync(path.join(accepted,'observations.json.gz')))));
}
console.log(manifest);
