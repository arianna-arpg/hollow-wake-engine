import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const cache=fs.readFileSync(path.join(root,'dist/tag-context-cache.js'),'utf8'),stats=fs.readFileSync(path.join(root,'dist/stats.js'),'utf8'),directory=fs.mkdtempSync(path.join(root,'.artifacts/tag-context-mutations-'));
const faults=[
 ['cache','capacity-validation','!Number.isSafeInteger(capacity) || capacity < 0','false'],
 ['cache','empty-reencoded','return this.empty;', 'return this.encode(Object.freeze([]));'],
 ['cache','recent-size','entry && entry.tags.length === size','entry'],
 ['cache','recent-membership','same = false;','same = true;'],
 ['cache','fallback-size','entry.tags.length !== size','false'],
 ['cache','fallback-membership','continue candidate;','void 0;'],
 ['cache','snapshot-sort','[...tags].sort()','[...tags]'],
 ['cache','snapshot-freeze','Object.freeze([...tags].sort())','[...tags].sort()'],
 ['cache','disabled-storage','if (this.capacity > 0)','if (true)'],
 ['cache','capacity-overrun','this.entries.length < this.capacity','this.entries.length <= this.capacity'],
 ['cache','replacement-cursor','this.next = (this.next + 1) % this.capacity;','this.next = 0;'],
 ['cache','clear-entries','this.entries.length = 0;','void 0;'],
 ['cache','clear-recent','this.recent = undefined;','void 0;'],
 ['cache','failed-encoding-evicts','const value = this.encode(snapshot);','this.entries.length = 0; const value = this.encode(snapshot);'],
 ['cache','shared-entries','entries = [];','static shared = []; entries = TagContextCache.shared;'],
 ['stats','baseline-key-prefix',"(noLinks ? '1:' : '0:')","'0:'"],
 ['stats','context-discarded',"+ stat + context;","+ stat;"],
 ['stats','stat-discarded',"+ stat.length + ':' + stat + context;","+ context;"],
 ['stats','context-budget','new TagContextCache(encodeContext, this.maxContextCacheEntries)','new TagContextCache(encodeContext)'],
 ['stats','context-budget-validation',"integer(maxContextCacheEntries, 0, 'stat context cache bound');",''],
 ['stats','extra-bypass','(!extra || !extra.length) && baseValue === undefined','baseValue === undefined'],
 ['stats','base-bypass','(!extra || !extra.length) && baseValue === undefined','(!extra || !extra.length)'],
];
const results=[];let passed=false;
try{for(const fault of [null,...faults]){
 const name=fault?.[1]??'control',env={...process.env,HWE_TAG_CONTEXT_MODULE:'',HWE_STAT_MODULE:''};
 if(fault){const[kind,,needle,replacement]=fault,source=kind==='cache'?cache:stats;assert.equal(source.split(needle).length-1,1,name);
   const file=path.join(directory,name+'.mjs');let changed=source.replace(needle,replacement);
   if(kind==='stats')changed=changed.replace(/from '(\.\/[^']+)'/g,(_a,relative)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'dist',relative)).href));fs.writeFileSync(file,changed);
   if(kind==='cache')env.HWE_TAG_CONTEXT_MODULE=pathToFileURL(file).href;
   else {const bridge=path.join(directory,name+'-entry.mjs');fs.writeFileSync(bridge,`export {StatSheet} from ${JSON.stringify(pathToFileURL(file).href)};\nexport {StatRules} from ${JSON.stringify(pathToFileURL(path.join(root,'dist/stat-rules.js')).href)};\n`);env.HWE_STAT_MODULE=pathToFileURL(bridge).href;}
 }
 const result=spawnSync(process.execPath,['--test',path.join(root,'test/tag-context-cache.test.mjs')],{cwd:root,env,encoding:'utf8',timeout:30000,windowsHide:true}),output=(result.stdout??'')+(result.stderr??'');fs.writeFileSync(path.join(directory,name+'.txt'),output);
 assert(!result.error);if(!fault){assert.equal(result.status,0);assert.match(output,/(?:#|ℹ) tests 18/);}else{assert.notEqual(result.status,0,name);assert.match(output,/ERR_ASSERTION/,name);assert.doesNotMatch(output,/SyntaxError|ReferenceError|TypeError|ERR_MODULE_NOT_FOUND|ERR_UNKNOWN_FILE_EXTENSION/,name);}
 results.push({name,detected:!!fault});
 }passed=true;
}finally{assert.equal(fs.readFileSync(path.join(root,'dist/tag-context-cache.js'),'utf8'),cache);assert.equal(fs.readFileSync(path.join(root,'dist/stats.js'),'utf8'),stats);const report={passed,directory,faults:results.filter(r=>r.detected).length,cacheSha256:sha256(cache),statsSha256:sha256(stats),results};writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/tag-context-mutation-verification.json'),report);console.log({passed,directory,faults:report.faults});}
