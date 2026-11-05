import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {itemPack} from './compile-item-content.mjs';
import {ItemContent} from '../dist/item-rules.js';
import {CraftingContent} from '../dist/crafting-content.js';

export function readCraftingFixture(name){
  const accepted=JSON.parse(fs.readFileSync(path.join(root,'baseline/crafting/acceptance.json'))).fixtures[name];
  assert(accepted,'Unknown crafting fixture');
  const compressed=fs.readFileSync(path.join(root,accepted.file));assert.equal(sha256(compressed),accepted.compressedSha256);
  const bytes=gunzipSync(compressed);assert.equal(sha256(bytes),accepted.sha256);return JSON.parse(bytes);
}
export function craftingPack(items=new ItemContent(itemPack())){
  const source=readCraftingFixture('policy'),s=source.content,actions=readCraftingFixture('actions');
  // Reviewed original cost expression: compile data, never evaluate captured code.
  assert.equal(s.costSource,'cost(rank){if(rank<=1)return{essence:"glimmering",count:6};if(rank===2)return{essence:"brilliant",count:5};return{essence:"pristine",count:4}}');
  const rankCosts={first:s.costs.find(r=>r.rank===1).cost,second:s.costs.find(r=>r.rank===2).cost,higher:s.costs.find(r=>r.rank===3).cost};
  for(const row of s.costs)assert.deepEqual(row.cost,rankCosts[row.rank<=1?'first':row.rank===2?'second':'higher']);
  assert.deepEqual(s.socketCaps,JSON.parse(JSON.stringify(items.pack.config.sockets.cap)));
  const ledger=actions.rows.find(r=>r.name==='salvage-break').after.saved[0].ledger;
  assert.equal(Object.keys(ledger).length,1);assert.equal(Object.values(ledger)[0],1);
  const coarse=new Set([...source.gear.map(r=>r.sell.essence),...source.memory.map(r=>r.yield.essence)]);
  const support=new Set(source.gem.map(r=>r.supportSalvage.essence));assert.equal(coarse.size,1);assert.equal(support.size,1);
  const body={schemaVersion:1,capability:'crafting/v1',itemContentId:items.id,craft:s.craft,salvage:s.salvage,sell:s.sell,vendor:s.vendor,
    rankCosts,oracleCosts:s.oracleCosts,gearEssences:s.gearEssences,gemEssences:s.gemEssences,
    essences:s.essenceIds.map(id=>s.essences[id]),coarseEssence:[...coarse][0],supportEssence:[...support][0],ledgerCraftsUnlocked:Object.keys(ledger)[0]};
  const pack={...body,contentId:'hollow-wake-crafting:sha256:'+sha256(JSON.stringify(body))};
  return new CraftingContent(pack,items).pack;
}
export function buildCraftingContent(destination){
  const pack=craftingPack(),bytes=JSON.stringify(pack,null,2)+'\n';fs.mkdirSync(destination,{recursive:true});
  fs.writeFileSync(path.join(destination,'crafting.json'),bytes);
  writeJSON(path.join(destination,'package.json'),{name:'@hollow-wake/crafting',version:'0.1.0',private:true,type:'module',license:'PolyForm-Noncommercial-1.0.0',
    files:['crafting.json','manifest.json','LICENSE.md','NOTICE.md','README.md'],exports:{'./crafting.json':'./crafting.json','./manifest.json':'./manifest.json'}});
  writeJSON(path.join(destination,'manifest.json'),{schemaVersion:1,contentId:pack.contentId,itemContentId:pack.itemContentId,capability:pack.capability,sha256:sha256(bytes),bytes:Buffer.byteLength(bytes)});
  for(const file of ['LICENSE.md','NOTICE.md'])fs.copyFileSync(path.join(root,file),path.join(destination,file));
  fs.writeFileSync(path.join(destination,'README.md'),'# Hollow Wake crafting content\n\nValidated crafting, salvage, sale, and vendor-price tuning. Load with CraftingContent and the matching shared ItemContent. Host ports own item custody, payment, saves, and presentation. Smith/rune values are presentation metadata; this pack does not implement their input UI.\n');
  return pack;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const pack=buildCraftingContent(path.join(root,'.artifacts/crafting-content'));console.log({contentId:pack.contentId,itemContentId:pack.itemContentId});}
