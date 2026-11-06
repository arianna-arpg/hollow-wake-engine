import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {performance} from 'node:perf_hooks';
import {EquipmentSlots} from '@hollow-wake/engine/inventory/equipment';
import {ItemContent} from '@hollow-wake/engine/items';
import {ItemInspector} from '@hollow-wake/engine/items/inspection';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {equipmentPack,itemPack} from './compile-item-content.mjs';
import {inspectionTerms} from './compile-inspection-terms.mjs';

const dir=path.join(root,'baseline/loadout-cards');
const raw=gunzipSync(fs.readFileSync(path.join(dir,'observations.json.gz')));
const accepted=JSON.parse(fs.readFileSync(path.join(dir,'acceptance.json')));
assert.equal(sha256(raw),accepted.sha256);
const cases=JSON.parse(raw).filter(r=>r.expected);
const inspector=new ItemInspector(new ItemContent(itemPack()),inspectionTerms()),slots=new EquipmentSlots(equipmentPack());
const scenarios={compact:[],full:[]},rounds=8,passes=12;
let checksum=0;
function run(mode){
  const start=performance.now();
  for(let i=0;i<passes;i++)for(const {input} of cases){
    const view=inspector.inspectLoadout(input.item,input.equipped,input.heroLevel,slots,mode);
    checksum+=view.title.length+view.targets.length;
  }
  return (performance.now()-start)*1000/(passes*cases.length);
}
for(const mode of Object.keys(scenarios))run(mode);
for(let i=0;i<rounds;i++){
  for(const mode of i%2?['full','compact']:['compact','full'])scenarios[mode].push(run(mode));
}
const median=values=>{
  const sorted=[...values].sort((a,b)=>a-b),mid=sorted.length/2;
  return (sorted[mid-1]+sorted[mid])/2;
};
const report={platform:process.platform,architecture:process.arch,cpu:os.cpus()[0].model,node:process.version,
  cases:cases.length,sourceSha256:accepted.sha256,passes,rounds,checksum,
  meanMicrosecondsPerCard:scenarios,medianOfMeans:Object.fromEntries(Object.entries(scenarios).map(([k,v])=>[k,median(v)])),
  scope:'Warm standalone JS inventory reads with content loaded. Includes portable body validation, projection and formatting. Excludes renderer, engine transport, database and device performance.'};
writeJSON(path.join(root,'.artifacts/loadout-benchmark.json'),report);console.log(report);
