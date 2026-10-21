import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {pathToFileURL} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';import {readCatalogue} from './catalogue-tools.mjs';
import {ResourceContent} from '../dist/resource-content.js';import {compileSkillTree} from '../dist/skill-tree.js';
const read=name=>JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-twenty-two',name+'.json.gz'))));
export function resourcePack(){
 const banks=read('charge-banks'),gauges=read('resource-gauges'),costs=read('resource-costs'),catalogue=readCatalogue();
 const charges=Object.entries(banks.definitions).map(([id,def])=>({id,...def}));
 const payload=def=>Object.fromEntries(['id','chargeGain','chargeCost','gauge'].filter(k=>def[k]!==undefined).map(k=>[k,def[k]]));
 const skills=[],supports=[],projectedCosts=[];
 for(const table of ['skills','supports']){
  const defs=new Map(catalogue.tables[table].map(r=>[r.id,r.value]));
  for(const id of catalogue.registryOrder[table]){
   const def=defs.get(id),row=payload(def);if(def.chargeCost)projectedCosts.push({id:(table==='skills'?'skill:':'support:')+id,cost:def.chargeCost});
   if(table==='skills'&&def.tree){
    const graph=compileSkillTree(def.tree),nodes=[];
    for(const nodeId of graph.order){const n=graph.nodes.get(nodeId).node,r={id:nodeId};if(n.chargeGain)r.chargeGain=n.chargeGain;if(n.over?.chargeCost){r.chargeCost=n.over.chargeCost;projectedCosts.push({id:'tree:'+id+':'+nodeId,cost:r.chargeCost});}if(Object.keys(r).length>1)nodes.push(r);}
    if(nodes.length)row.nodes=nodes;
   }
   if(Object.keys(row).length>1)(table==='skills'?skills:supports).push(row);
  }
 }
 assert.deepEqual(projectedCosts,costs.rows.slice(1),'Authored resource cost projection differs from original resolution');
 for(const row of gauges.authored)assert.deepEqual(skills.find(s=>s.id===row.id)?.gauge,row.spec,'Gauge catalogue differs from original: '+row.id);
 const ids=new Set(['chargeCap','gaugeNeed','gaugeGain','gaugeLockout']);
 for(const d of charges){ids.add('chargeCap_'+d.id);ids.add('chargeRegen_'+d.id);for(const m of d.perCharge??[]){ids.add(m.stat);if(m.fromStat)ids.add(m.fromStat);}}
 const sourceStats=new Map(catalogue.tables.stats.map(r=>[r.id,r.value]));
 const stats=Object.fromEntries([...ids].map(id=>{assert(sourceStats.has(id),'Missing authored resource stat '+id);return[id,sourceStats.get(id)];}));
 const data={schemaVersion:1,capability:'resource-runtime/v1',charges,gaugeTuning:gauges.tuning,stats,skills,supports};
 const pack={...data,contentId:'hollow-wake-resources:sha256:'+sha256(JSON.stringify(data))};new ResourceContent(pack);return pack;
}
export function buildResourceContent(destination){
 const pack=resourcePack(),bytes=JSON.stringify(pack)+'\n';fs.mkdirSync(destination,{recursive:true});fs.writeFileSync(path.join(destination,'resources.json'),bytes);
 writeJSON(path.join(destination,'package.json'),{name:'@hollow-wake/resource-content',version:'0.1.0',type:'module',license:'PolyForm-Noncommercial-1.0.0',files:['resources.json','manifest.json','LICENSE.md','README.md'],exports:{'./resources.json':'./resources.json','./manifest.json':'./manifest.json'}});
 writeJSON(path.join(destination,'manifest.json'),{schemaVersion:1,contentId:pack.contentId,sha256:sha256(bytes),bytes:Buffer.byteLength(bytes),capability:pack.capability,charges:pack.charges.length,skills:pack.skills.length,supports:pack.supports.length,treeNodes:pack.skills.reduce((n,s)=>n+(s.nodes?.length??0),0),stats:Object.keys(pack.stats).length});
 fs.copyFileSync(path.join(root,'LICENSE.md'),path.join(destination,'LICENSE.md'));
 fs.writeFileSync(path.join(destination,'README.md'),'# Hollow Wake resource content\n\nAuthored charge definitions, gauge tuning, resource stat definitions, skill/support resource fields and tree resource payloads. Use ResourceContent, ChargeRuntime and the gauge helpers from @hollow-wake/engine. ResourceContent owns immutable data and stable ordered registry entries; no data string is evaluated. The host resolves equipped skills, admitted tree ranks, sockets, event eligibility and spatial filters. Resource tree rows are payload projections, not graph admission or complete effect execution. State remains transient unless the host explicitly persists it.\n');return pack;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const pack=buildResourceContent(path.join(root,'.artifacts/resource-content-package'));console.log(JSON.stringify({charges:pack.charges.length,skills:pack.skills.length,supports:pack.supports.length,treeNodes:pack.skills.reduce((n,s)=>n+(s.nodes?.length??0),0),stats:Object.keys(pack.stats).length,contentId:pack.contentId}));}
