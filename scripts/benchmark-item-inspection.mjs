import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {ItemContent} from '@hollow-wake/engine/items';
import {ItemInspector} from '@hollow-wake/engine/items/inspection';
import {inspectionCases} from './item-inspection-corpus.mjs';
import {inspectionTerms} from './compile-inspection-terms.mjs';
import {itemPack} from './compile-item-content.mjs';
import {root,sha256} from './reference-utils.mjs';

// UI workload. Generate content and read saved items before timing. Each
// query accepts a complete item and includes validation and result creation.
const [output,...extra]=process.argv.slice(2);
assert(output && !extra.length && !fs.existsSync(output),'Supply a new report path');
const items=new ItemContent(itemPack()),terms=JSON.stringify(inspectionTerms())+'\n';
const cases=inspectionCases(),blockSize=64;
const accepted=JSON.parse(fs.readFileSync(path.join(root,'baseline/item-inspection/observations.json')));
assert.equal(cases.length,accepted.count);
const begin=()=>performance.now();
const elapsedUs=start=>(performance.now()-start)*1000;
const inspector=new ItemInspector(items,JSON.parse(terms));
// A fixed coprime stride interleaves base, affix and unique families. Each
// pass visits every saved item and compares it to the same original neighbor.
const order=Array.from({length:cases.length},(_,i)=>(i*7919)%cases.length);
assert.equal(new Set(order).size,cases.length);
const card=i=>{
  const result=inspector.inspect(cases[i].item);
  return result.modifiers.length+result.description.title.length+result.procReferences.length;
};
const compare=i=>inspector.compare(cases[i].item,cases[(i+cases.length-1)%cases.length].item).length;
function distribution(sample) {
  const sorted=[...sample].sort((a,b)=>a-b);
  const at=f=>sorted[Math.ceil(sorted.length*f)-1];
  return {median:at(.5),p95:at(.95),max:at(1)};
}
function measure(query) {
  for(const i of order.slice(0,2048))query(i);
  let expectedSum;
  const passes=[],batchMeans=[];
  for(let pass=0;pass<5;pass++){
    let sum=0;
    const start=begin();
    for(let from=0;from<order.length;from+=blockSize){
      const end=Math.min(from+blockSize,order.length),batchStart=begin();
      for(let j=from;j<end;j++)sum+=query(order[j]);
      batchMeans.push(elapsedUs(batchStart)/(end-from));
    }
    passes.push(elapsedUs(start)/order.length);
    expectedSum??=sum;assert.equal(sum,expectedSum);
  }
  return {queriesPerPass:order.length,passes,blockMeanMicroseconds:distribution(batchMeans),checksum:expectedSum};
}
const loadSamples=[];
for(let i=0;i<16;i++){
  const start=begin();
  new ItemInspector(items,JSON.parse(terms));
  loadSamples.push(elapsedUs(start));
}
const report={schemaVersion:1,version:JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version,
  platform:process.platform,arch:process.arch,node:process.version,cpu:os.cpus()[0]?.model,
  corpusBlocksSha256:sha256(JSON.stringify(accepted.blocks)),termsBytes:Buffer.byteLength(terms),
  setupMicroseconds:distribution(loadSamples),blockSize,inspect:measure(card),compare:measure(compare),
  scope:'Warm Node engine. Setup parses in-memory vocabulary JSON against an existing ItemContent. Query times include admission and detached outputs. Percentiles describe batch means; disk, rendering, native transport and device power are outside this workload.'};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log({setupMicroseconds:report.setupMicroseconds,inspect:report.inspect.blockMeanMicroseconds,compare:report.compare.blockMeanMicroseconds});
