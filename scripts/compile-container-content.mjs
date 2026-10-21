import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {pathToFileURL} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {ContainerLayout,SeatRules} from '../dist/container-policy.js';
export function containerPack(){
 const {authored}=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-thirteen/containers.json.gz'))));
 const data={schemaVersion:1,capability:'container-seat-policy/v1',containers:authored.containers,rules:{amplifiers:Object.values(authored.amplifiers),relicCaps:authored.relicCaps,relicBaseline:authored.relicBaseline}};
 const ids=new Set();
 for(const def of data.containers){
  assert(typeof def.id==='string'&&def.id&&!ids.has(def.id),'Unique container ID required');ids.add(def.id);
  assert(typeof def.label==='string'&&def.label&&typeof def.active==='boolean');
  for(const key of ['accountStorage','levelGate'])assert(def[key]===undefined||typeof def[key]==='boolean');
  for(const key of ['categories','tags'])assert(def.accepts[key]===undefined||(Array.isArray(def.accepts[key])&&def.accepts[key].every(value=>typeof value==='string'&&value)));
  new ContainerLayout(def.ladder);
 }
 new SeatRules(data.rules);
 return {...data,contentId:'hollow-wake-containers:sha256:'+sha256(JSON.stringify(data))};
}
export function buildContainerContent(destination){
 const pack=containerPack(),bytes=JSON.stringify(pack)+'\n';fs.mkdirSync(destination,{recursive:true});fs.writeFileSync(path.join(destination,'containers.json'),bytes);
 writeJSON(path.join(destination,'package.json'),{name:'@hollow-wake/containers',version:'0.1.0',type:'module',license:'PolyForm-Noncommercial-1.0.0',files:['containers.json','manifest.json','LICENSE.md','README.md'],exports:{'./containers.json':'./containers.json','./manifest.json':'./manifest.json'}});
 writeJSON(path.join(destination,'manifest.json'),{schemaVersion:1,contentId:pack.contentId,sha256:sha256(bytes),bytes:Buffer.byteLength(bytes),capability:pack.capability});fs.copyFileSync(path.join(root,'LICENSE.md'),path.join(destination,'LICENSE.md'));
 fs.writeFileSync(path.join(destination,'README.md'),'# Hollow Wake container and seat content\n\nValidated container definitions and raw seat/relic numeric rules for the optional @hollow-wake/engine/inventory/containers entry. Construct ContainerLayout and SeatRules once; authorize account features in the host. Items and their immutable content come from the separate item package. Rule caps use explicit null for unbounded numeric lines. Authored rung costs/gates are preserved metadata, not executable account purchasing, quest, ownership or save policy. No rendering, SQL or native-engine dependency is required.\n');return pack;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const pack=buildContainerContent(path.join(root,'.artifacts/container-package'));console.log(JSON.stringify({containers:pack.containers.length,amplifiers:pack.rules.amplifiers.length,relicCaps:pack.rules.relicCaps.length,contentId:pack.contentId}));}
