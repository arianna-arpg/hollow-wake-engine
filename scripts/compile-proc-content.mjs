import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {pathToFileURL} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';import {readCatalogue} from './catalogue-tools.mjs';
import {ProcContent} from '../dist/proc-content.js';import {StatRules} from '../dist/stat-rules.js';

export function procPack(){
  const raw=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-thirty-eight/proc-catalogue.json.gz'))));
  const data={schemaVersion:1,capability:'proc-dispatch/v1',rules:raw.ruleConfiguration,procs:raw.procs.map(r=>r.value),riders:raw.riders.map(r=>r.value)};
  const pack={...data,contentId:'hollow-wake-procs:sha256:'+sha256(JSON.stringify(data))};new ProcContent(pack);
  const definitions=new Map(readCatalogue().tables.stats.map(r=>[r.id,r.value]));
  const ids=['procDepth','luck','highRollWindow','killProcOnHit',...pack.procs.flatMap(p=>['proc_'+p.id,'procPower_'+p.id])];
  const stats=Object.fromEntries(ids.map(id=>{assert(definitions.has(id),'Missing authored proc stat '+id);return[id,definitions.get(id)];}));
  const dynamicStatIds=[];
  for(const rider of pack.riders){const id='procRider_'+rider.id;if(definitions.has(id))stats[id]=definitions.get(id);else dynamicStatIds.push(id);}
  new StatRules(stats);return {pack,stats,dynamicStatIds};
}
export function buildProcContent(destination){
  const result=procPack(),{pack,stats,dynamicStatIds}=result;fs.mkdirSync(destination,{recursive:true});
  const procs=JSON.stringify(pack)+'\n',statBytes=JSON.stringify(stats)+'\n';fs.writeFileSync(path.join(destination,'procs.json'),procs);fs.writeFileSync(path.join(destination,'stats.json'),statBytes);
  writeJSON(path.join(destination,'package.json'),{name:'@hollow-wake/proc-content',version:'0.1.0',type:'module',license:'PolyForm-Noncommercial-1.0.0',files:['procs.json','stats.json','manifest.json','LICENSE.md','README.md'],exports:{'./procs.json':'./procs.json','./stats.json':'./stats.json','./manifest.json':'./manifest.json'}});
  writeJSON(path.join(destination,'manifest.json'),{schemaVersion:1,capability:pack.capability,contentId:pack.contentId,procs:pack.procs.length,riders:pack.riders.length,stats:Object.keys(stats).length,dynamicStatIds,files:{'procs.json':{sha256:sha256(procs),bytes:Buffer.byteLength(procs)},'stats.json':{sha256:sha256(statBytes),bytes:Buffer.byteLength(statBytes)}}});
  fs.copyFileSync(path.join(root,'LICENSE.md'),path.join(destination,'LICENSE.md'));
  fs.writeFileSync(path.join(destination,'README.md'),'# Hollow Wake proc content\n\nOrdered authored proc and rider records plus existing chance, power and dispatch stat definitions. Load procs.json with ProcContent from @hollow-wake/engine/combat/procs; load stats.json with StatRules from @hollow-wake/engine. ProcContent owns immutable dispatch data. Effect payloads remain data and require a host executor; this package does not implement every authored effect. Dynamic rider stat IDs without an original display definition are listed in the manifest; no default or display row is invented. StatSheet preserves the original zero base for these unknown IDs. Neither content file contains executable callbacks.\n');
  return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const {pack,stats,dynamicStatIds}=buildProcContent(path.join(root,'.artifacts/proc-content-package'));console.log(JSON.stringify({contentId:pack.contentId,procs:pack.procs.length,riders:pack.riders.length,stats:Object.keys(stats).length,dynamicStatIds}));}
