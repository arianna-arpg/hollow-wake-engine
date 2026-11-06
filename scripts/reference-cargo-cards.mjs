import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {gzipSync,gunzipSync} from 'node:zlib';
import {root,verifyReference,sha256,writeJSON} from './reference-utils.mjs';

const args=process.argv.slice(2),capture=args.length===1&&args[0]==='--capture';
assert(capture||args.length===0);
const accepted=path.join(root,'baseline/cargo-cards');
if(capture)assert(!fs.existsSync(accepted),'Original inventory observations are already frozen');
const reference=path.join(root,'.reference');
const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
verifyReference(reference,lock);
const script=path.join(reference,'balance/export-sdk-cargo-cards.ts');
fs.copyFileSync(path.join(root,'reference/export-cargo-cards.ts'),script);
function run(){
  const dir=fs.mkdtempSync(path.join(root,'.artifacts/original-cargo-cards-'));
  execFileSync(process.execPath,['--import','tsx',script,dir],{cwd:reference,windowsHide:true,stdio:'inherit',timeout:180000});
  return Object.fromEntries(['cards.jsonl','faces.json','roster.json'].map(name=>[name,fs.readFileSync(path.join(dir,name))]));
}
const files=run();
if(capture){
  const repeated=run();
  for(const [name,bytes] of Object.entries(files))assert(bytes.equals(repeated[name]),'Original replay differed: '+name);
}
const rows=files['cards.jsonl'].toString().trimEnd().split('\n').map(JSON.parse);
const faces=JSON.parse(files['faces.json']);
assert.equal(new Set(rows.map(r=>r.label)).size,rows.length);
const categories=Object.fromEntries([...new Set(rows.map(r=>r.label.split('/')[0]))].map(name=>[name,rows.filter(r=>r.label.startsWith(name+'/')).length]));
const fit=rows.flatMap(r=>r.values?.fit??[]);
const counts={cases:rows.length,categories,skills:Object.keys(faces.skills).length,supports:Object.keys(faces.supports).length,
  monsters:Object.keys(faces.monsters).length,accepted:rows.filter(r=>r.card).length,refused:rows.filter(r=>!r.card).length,
  crewOnly:fit.filter(s=>s.fits&&!s.direct).length,compatibleFull:fit.filter(s=>s.fits&&s.sockets>0&&s.occupied===s.sockets).length,
  compatibleZero:fit.filter(s=>s.fits&&s.sockets===0).length,incompatible:fit.filter(s=>!s.fits).length};
assert.equal(categories.skill,counts.skills*4);assert.equal(categories.support,counts.supports*3);
assert.equal(categories.pin,counts.skills+counts.supports);assert.equal(categories.dropper,counts.monsters);
for(const n of [counts.crewOnly,counts.compatibleFull,counts.compatibleZero,counts.incompatible,counts.refused])assert(n>0);
for(const r of rows){
  assert.equal(Boolean(r.card),r.view.place!=='guest-stash'&&!r.label.startsWith('removed/'),r.label);
  if(r.card)assert(r.card.title&&r.card.description&&r.card.meta,r.label);
}
const manifest={schemaVersion:1,sourceCommit:lock.commit,counts,files:Object.fromEntries(Object.entries(files).map(([name,bytes])=>[name,{bytes:bytes.length,sha256:sha256(bytes)}]))};
verifyReference(reference,lock);
if(capture){
  // Publish a complete baseline together. A failed verifier leaves no accepted directory.
  const stage=fs.mkdtempSync(path.join(root,'.artifacts/cargo-capture-'));
  for(const [name,bytes] of Object.entries(files))fs.writeFileSync(path.join(stage,name+'.gz'),gzipSync(bytes,{level:9}));
  writeJSON(path.join(stage,'acceptance.json'),manifest);fs.renameSync(stage,accepted);
}else{
  assert.deepEqual(manifest,JSON.parse(fs.readFileSync(path.join(accepted,'acceptance.json'))));
  for(const [name,bytes] of Object.entries(files))assert(gunzipSync(fs.readFileSync(path.join(accepted,name+'.gz'))).equals(bytes),name);
}
console.log(counts);
