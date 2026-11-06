import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {gzipSync,gunzipSync} from 'node:zlib';
import {root,verifyReference,writeJSON,sha256} from './reference-utils.mjs';
import {itemPack} from './compile-item-content.mjs';
import {inspectionCases,observationDigest} from './item-inspection-corpus.mjs';
const capture=process.argv[2]==='--capture';
assert(process.argv.length===(capture?3:2));
const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
const accepted=path.join(root,'baseline/item-inspection');
if(capture)assert(!fs.existsSync(accepted),'Frozen observations already exist');
verifyReference(reference,lock);
const dir=fs.mkdtempSync(path.join(root,'.artifacts/inspection-original-'));
const cases=inspectionCases();
fs.writeFileSync(path.join(dir,'inputs.json'),JSON.stringify(cases));
const script=path.join(reference,'balance/export-sdk-item-inspection.ts');
fs.copyFileSync(path.join(root,'reference/export-item-inspection.ts'),script);
execFileSync(process.execPath,['--import','tsx',script,dir,itemPack().id],{cwd:reference,stdio:'inherit',windowsHide:true,timeout:240000});
const terms=fs.readFileSync(path.join(dir,'terms.json')),blocks=[],samples=[];
let block=[],index=0;
const selected=new Set(['crafted','locked','both','epitaph','proc','legacy','unique','superior','local','socket','exclusive','two-lines']);
for await(const line of createInterface({input:fs.createReadStream(path.join(dir,'original.jsonl')),crlfDelay:Infinity})){
  const row=JSON.parse(line);
  assert.equal(row.label,cases[index].label);
  const d=row.observation.description;
  const tags=[row.label==='markers/true/false'?'crafted':'',row.label==='markers/false/true'?'locked':'',row.label==='markers/true/true'?'both':'',
    d.epitaph?'epitaph':'',row.observation.procReferences.length?'proc':'',row.label.includes('missing-choice')?'legacy':'',
    d.unique.length?'unique':'',d.implicit.some(s=>s.startsWith('Superior'))?'superior':'',d.defense.some(s=>s.augmented)?'local':'',
    d.sockets?.some(s=>s.name!=='Empty socket')?'socket':'',d.affix.some(a=>a.tag==='EX'||a.tag==='M1')?'exclusive':'',d.affix.length>=2?'two-lines':''];
  const hits=tags.filter(t=>selected.delete(t));
  if(hits.length)samples.push({index,tags:hits,...row,item:cases[index].item,worn:cases[(index+cases.length-1)%cases.length].item});
  block.push(row);index++;
  if(block.length===128){blocks.push(observationDigest(block));block=[];}
}
if(block.length)blocks.push(observationDigest(block));
assert.equal(index,cases.length);assert.deepEqual([...selected],[]);
const result={version:1,count:index,blockSize:128,blocks,termsSha256:sha256(terms),samples};
if(capture){
  fs.mkdirSync(accepted);
  fs.writeFileSync(path.join(accepted,'terms.json.gz'),gzipSync(terms,{level:9}));
  writeJSON(path.join(accepted,'observations.json'),result);
}else{
  assert.deepEqual(result,JSON.parse(fs.readFileSync(path.join(accepted,'observations.json'))));
  assert(gunzipSync(fs.readFileSync(path.join(accepted,'terms.json.gz'))).equals(terms));
}
verifyReference(reference,lock);
console.log({count:index,blocks:blocks.length,samples:samples.length,termsBytes:terms.length,dir});
