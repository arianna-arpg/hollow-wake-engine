import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const pkg=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/content-table-package-latest.json')));assert(pkg.passed);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/content-table-faults-')),consumer=path.join(directory,'consumer');fs.cpSync(pkg.consumer,consumer,{recursive:true});
const installed=path.join(consumer,'node_modules/@hollow-wake/engine/dist'),original=new Map(),results=[];
const faults=[
  ['negative-zero','content-table','value = -0;','value = 0;'],
  ['mutable-definitions','content-table','value = Object.freeze(out);','value = out;'],
  ['duplicate-keys','content-table',"typeof key === 'string' && !Object.hasOwn(out, key)","typeof key === 'string'"],
  ['depth-budget','content-table',"need(depth <= limits.depth, 'depth limit');",''],
  ['expansion-budget','content-table',"need(weight <= limits.expandedValues, 'expanded value limit');",''],
  ['string-budget','content-table',"need(stringUnits <= limits.stringUnits, 'string limit');",''],
  ['unreachable-nodes','content-table',"need(used[index] === 1, 'unreachable node');",'void index;'],
  ['ordinary-accessor','content-table',"const d = Object.getOwnPropertyDescriptor(value, key);","const d = {value:value[key],enumerable:true};"],
  ['lost-sharing','item-rules','Object.isFrozen(pack) ? copySharedContent(pack) : copy(pack)','copy(pack)'],
];
for(const [,name]of faults){const file=path.join(installed,name+'.js');if(!original.has(file))original.set(file,fs.readFileSync(file,'utf8'));assert.equal(sha256(original.get(file)),pkg.runtimeMap[name+'.js']);}
const run=()=>spawnSync(process.execPath,['contracts.mjs'],{cwd:consumer,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:8*1024*1024});
const clean=run();assert.equal(clean.status,0);fs.writeFileSync(path.join(directory,'before.txt'),clean.stdout+clean.stderr);
for(const [name,module,from,to]of faults){
  const file=path.join(installed,module+'.js'),source=original.get(file);assert(source.includes(from),name);
  try {fs.writeFileSync(file,source.replaceAll(from,to));const observed=run();fs.writeFileSync(path.join(directory,name+'.txt'),observed.stdout+observed.stderr);
    const detected=!observed.error&&observed.signal===null&&observed.status===1&&/(?:not ok|✖)/.test(observed.stdout);results.push({name,detected,status:observed.status});assert(detected,'Fault survived: '+name);
  } finally {fs.writeFileSync(file,source);}
}
const after=run();assert.equal(after.status,0);fs.writeFileSync(path.join(directory,'after.txt'),after.stdout+after.stderr);
const report={passed:true,directory,archiveSha256:pkg.archiveSha256,results,sources:Object.fromEntries(['scripts/test-content-table-faults.mjs','test/content-table.test.mjs'].map(f=>[f,sha256(fs.readFileSync(path.join(root,f)))]))};
writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/content-table-faults-latest.json'),report);console.log({passed:true,directory,faults:results.length});
