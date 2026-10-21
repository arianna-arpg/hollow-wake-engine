import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {pathToFileURL} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';import {readCatalogue} from './catalogue-tools.mjs';
import {SupportContent,SUPPORT_MECHANISM_NAMES} from '../dist/support-content.js';
export function supportPack(observed=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-twenty-one/support-content.json.gz'))))){
 const catalogue=readCatalogue(),defs=new Map(catalogue.tables.supports.map(row=>[row.id,row.value]));
 assert.deepEqual(observed.supports.map(s=>s.id),catalogue.registryOrder.supports);
 for(const support of observed.supports)assert.deepEqual(support,defs.get(support.id),'Support catalogue differs from current original capture: '+support.id);
 assert.deepEqual(observed.mechanisms,[...SUPPORT_MECHANISM_NAMES]);
 const registered=new Set(observed.statIds),vocabulary=new Set(observed.statIds);
 const mods=[...observed.policy.defaultLeveling,...observed.statuses.flatMap(s=>s.mods??[]),...observed.supports.flatMap(s=>[...s.mods,...(s.perLevel??[]),...(s.rollBase?.axes.flatMap(a=>a.rows.flatMap(r=>r.mods??[]))??[])])];
 for(const mod of mods){vocabulary.add(mod.stat);if(mod.kind==='link')vocabulary.add(mod.fromStat);}
 const dynamicStatIds=[...vocabulary].filter(id=>!registered.has(id));
 const data={schemaVersion:1,capability:'support-rules/v1',statIds:[...vocabulary],dynamicStatIds,supports:observed.supports,statuses:observed.statuses,ailmentTuning:observed.ailmentTuning,policy:observed.policy};
 const pack={...data,contentId:'hollow-wake-supports:sha256:'+sha256(JSON.stringify(data))},content=new SupportContent(pack);
 for(const status of observed.chances)for(const row of status.rows)assert.equal(content.tuneChance(status.id,row.authored),row.tuned);
 return pack;
}
export function buildSupportContent(destination){
 const pack=supportPack(),bytes=JSON.stringify(pack)+'\n';fs.mkdirSync(destination,{recursive:true});fs.writeFileSync(path.join(destination,'supports.json'),bytes);
 writeJSON(path.join(destination,'package.json'),{name:'@hollow-wake/support-content',version:'0.1.0',type:'module',license:'PolyForm-Noncommercial-1.0.0',files:['supports.json','manifest.json','LICENSE.md','README.md'],exports:{'./supports.json':'./supports.json','./manifest.json':'./manifest.json'}});
 writeJSON(path.join(destination,'manifest.json'),{schemaVersion:1,contentId:pack.contentId,sha256:sha256(bytes),bytes:Buffer.byteLength(bytes),capability:pack.capability,supports:pack.supports.length,statusObservations:pack.statuses.length,dynamicStatIds:pack.dynamicStatIds});
 fs.copyFileSync(path.join(root,'LICENSE.md'),path.join(destination,'LICENSE.md'));
 fs.writeFileSync(path.join(destination,'README.md'),'# Hollow Wake support content\n\nAll 457 authored supports, with validated admission requirements, numeric modifiers, cut rows, routing policy and status observations. Use SupportContent and SupportRules from @hollow-wake/engine. Hosts provide resolved skill delivery/component observations; SupportActions provides synchronous custody policy. Other retained support payloads are immutable authoring data, not complete effect execution. No data string is evaluated.\n');
 return pack;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const pack=buildSupportContent(path.join(root,'.artifacts/support-content-package'));console.log(JSON.stringify({supports:pack.supports.length,statuses:pack.statuses.length,contentId:pack.contentId}));}
