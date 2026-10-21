import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {pathToFileURL} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {ContainerLayout,SeatRules} from '../dist/container-policy.js';
import {RelicCustody} from '../dist/relic-custody.js';
export function containerPack(){
 const {authored}=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-thirteen/containers.json.gz'))));
 const custodySource=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-fourteen/relic-custody.json.gz')))).authored;
 const {costBase,maxRank,powerPerRank,xpPenaltyPerCell,attunement}=custodySource.config;
 const custody={capability:'relic-custody/v1',progression:{costBase,maxRank,powerPerRank,xpPenaltyPerCell},attunement,storageFeature:'reliquary',stash:custodySource.stash};
 const data={schemaVersion:1,capability:'container-seat-policy/v1',containers:authored.containers,rules:{amplifiers:Object.values(authored.amplifiers),relicCaps:authored.relicCaps,relicBaseline:authored.relicBaseline},custody};
 const ids=new Set();
 for(const def of data.containers){
  assert(typeof def.id==='string'&&def.id&&!ids.has(def.id),'Unique container ID required');ids.add(def.id);
  assert(typeof def.label==='string'&&def.label&&typeof def.active==='boolean');
  for(const key of ['accountStorage','levelGate'])assert(def[key]===undefined||typeof def[key]==='boolean');
  for(const key of ['categories','tags'])assert(def.accepts[key]===undefined||(Array.isArray(def.accepts[key])&&def.accepts[key].every(value=>typeof value==='string'&&value)));
  new ContainerLayout(def.ladder);
 }
 new SeatRules(data.rules);
 const validation=new RelicCustody({isRelic:()=>true,footprint:()=>({w:1,h:1}),nextUid:()=>1,bumpUidFloor:()=>{},cloneItems:items=>[...items],stash:()=>({...custody.stash,accepts:()=>true}),bagBoard:()=>({w:1,h:1}),progression:()=>custody.progression});
 validation.cost(validation.empty());
 return {...data,contentId:'hollow-wake-containers:sha256:'+sha256(JSON.stringify(data))};
}
export function buildContainerContent(destination){
 const pack=containerPack(),bytes=JSON.stringify(pack)+'\n';fs.mkdirSync(destination,{recursive:true});fs.writeFileSync(path.join(destination,'containers.json'),bytes);
 writeJSON(path.join(destination,'package.json'),{name:'@hollow-wake/containers',version:'0.2.0',type:'module',license:'PolyForm-Noncommercial-1.0.0',files:['containers.json','manifest.json','LICENSE.md','README.md'],exports:{'./containers.json':'./containers.json','./manifest.json':'./manifest.json'}});
 writeJSON(path.join(destination,'manifest.json'),{schemaVersion:1,contentId:pack.contentId,sha256:sha256(bytes),bytes:Buffer.byteLength(bytes),capability:pack.capability});fs.copyFileSync(path.join(root,'LICENSE.md'),path.join(destination,'LICENSE.md'));
 fs.writeFileSync(path.join(destination,'README.md'),'# Hollow Wake container and seat content\n\nValidated container definitions and raw seat/relic numeric rules for @hollow-wake/engine/inventory/containers. Version 0.2 also projects relic progression tuning and the storage layout for @hollow-wake/engine/inventory/relics. Supply explicit host item classification, storage acceptance, identity allocation, clone and bag ports. Authorize account features and save state in the host. Items and their immutable content come from the separate item package. Rule caps use explicit null for unbounded numeric lines. Container rung costs/gates remain metadata, separate from the executable relic power/storage investment rules. Quest rewards, network authority and crash-safe persistence remain host responsibilities. No rendering, SQL or native-engine dependency is required.\n');return pack;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const pack=buildContainerContent(path.join(root,'.artifacts/container-package'));console.log(JSON.stringify({containers:pack.containers.length,amplifiers:pack.rules.amplifiers.length,relicCaps:pack.rules.relicCaps.length,contentId:pack.contentId}));}
