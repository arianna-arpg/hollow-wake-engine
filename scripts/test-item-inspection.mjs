import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {ItemContent,ItemRules} from '@hollow-wake/engine/items';
import {ItemInspector} from '@hollow-wake/engine/items/inspection';
import {itemPack} from './compile-item-content.mjs';
import {inspectionTerms} from './compile-inspection-terms.mjs';
import {inspectionCases,observationDigest} from './item-inspection-corpus.mjs';
import {root,writeJSON,sha256} from './reference-utils.mjs';
import {InspectionFormat} from '../dist/inspection-format.js';

const raw=gunzipSync(fs.readFileSync(path.join(root,'baseline/item-inspection/terms.json.gz')));
const frozen=JSON.parse(fs.readFileSync(path.join(root,'baseline/item-inspection/observations.json')));
assert.equal(sha256(raw),frozen.termsSha256);
const terms=inspectionTerms(),content=new ItemContent(itemPack());
const inspector=new ItemInspector(content,terms),cases=inspectionCases();
const fmt=new InspectionFormat(terms),stats=Object.entries(JSON.parse(raw).stats);
for(const [stat,[name,percent]] of stats){
  assert.equal(fmt.label(stat),name,stat);assert.equal(fmt.value(stat,'flat',0.01),percent?'1%':'0.01',stat);
}
const bytes=Buffer.byteLength(JSON.stringify(terms)+'\n');
assert(bytes<=64*1024,'Inspection vocabulary exceeded its separate 64 KiB transport budget');
assert.throws(()=>new ItemInspector(content,{...terms,itemsId:'other'}),/content-mismatch/);
assert.throws(()=>new ItemInspector(content,{...terms,stats:{bad:['x',1]}}),/stat-label/);
terms.localSuffix='mutated'; terms.rarities.common.color='changed';
assert.equal(cases.length,frozen.count);
const sampleAt=new Map(frozen.samples.map(sample=>[sample.index,sample]));
const original=(row)=>JSON.parse(JSON.stringify(row));
let block=[],blockIndex=0;
for(let i=0;i<cases.length;i++){
  const {label,item}=cases[i],worn=cases[(i+cases.length-1)%cases.length].item;
  const observation=inspector.inspect(item),comparison=inspector.compare(item,worn);
  const row={label,observation,comparison},sample=sampleAt.get(i);
  if(sample){
    assert.deepEqual(original(observation),sample.observation,label);
    assert.deepEqual(comparison,sample.comparison,label);
  }
  block.push(row);
  if(block.length===frozen.blockSize || i===cases.length-1){
    assert.equal(observationDigest(block),frozen.blocks[blockIndex++],'Original observations ending at '+label);
    block=[];
  }
}
assert.equal(blockIndex,frozen.blocks.length);
const rules=new ItemRules(content,317,10),item=rules.forge({baseId:'helmet_armor',quality:0.75,fillRandom:true,rarity:'rare',ilvl:80});
const state=rules.snapshot(),snapshot=structuredClone(item),view=inspector.inspect(item);
const unchanged=inspector.compare(item,item);
assert(unchanged.length>0 && unchanged.every(row=>row.kind==='same'));
view.description.affix.length=0;
assert(inspector.inspect(item).description.affix.length>0);
assert.deepEqual(item,snapshot);assert.deepEqual(rules.snapshot(),state);
for(const key of ['constructor','__proto__','missing'])assert.throws(()=>inspector.inspect({...item,baseId:key}),/invalid-item/);
assert.throws(()=>inspector.inspect({...item,affixes:Array(129).fill(item.affixes[0])}),/invalid-array/);
assert.throws(()=>inspector.inspect({...item,ilvl:Number.MAX_VALUE,baseRoll:Number.MAX_VALUE}),/invalid-item-value/);
assert.throws(()=>inspector.compare({...item,ilvl:Number.MAX_VALUE,baseRoll:Number.MAX_VALUE},item),/invalid-item-value/);
assert.throws(()=>inspector.inspect({...item,get name(){throw Error('invoked getter');}}),/invalid-property/);
const receipt={passed:true,observations:cases.length,comparisons:cases.length,blocks:blockIndex,
  statLabels:stats.length,factoredFamilies:Object.keys(terms.grafts).length,originalVocabularyBytes:raw.length,transportBytes:bytes,
  vocabularySha256:frozen.termsSha256,blocksSha256:sha256(JSON.stringify(frozen.blocks))};
writeJSON(path.join(root,'.artifacts/item-inspection-verification.json'),receipt);
console.log(receipt);
