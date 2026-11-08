import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gzipSync,gunzipSync} from 'node:zlib';
import {root,sha256} from '../../../scripts/reference-utils.mjs';import{verifyQualifiedRuntime}from'./verify-qualified-runtime.mjs';
assert.equal(process.argv.length,3);const directory=fs.realpathSync(process.argv[2]);verifyQualifiedRuntime(directory);
const names=['runtime-receipt.json','runtime-receipt.json.raw.json.gz','hwe_embedded.dll','hwe_embedded.h'];
const originals=Object.fromEntries(names.map(name=>[name,fs.readFileSync(path.join(directory,name))]));
const base=JSON.parse(originals['runtime-receipt.json']),observed=JSON.parse(gunzipSync(originals['runtime-receipt.json.raw.json.gz']));
const artifacts=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(artifacts,'runtime-receipt-controls-')),passed=[];
try{
 const reject=(name,mutate)=>{
  for(const[name,body]of Object.entries(originals))fs.writeFileSync(path.join(work,name),body);
  const report=structuredClone(base),raw=structuredClone(observed);mutate(report,raw);
  const packed=gzipSync(JSON.stringify(raw));report.rawSha256=sha256(packed);
  fs.writeFileSync(path.join(work,'runtime-receipt.json.raw.json.gz'),packed);
  fs.writeFileSync(path.join(work,'runtime-receipt.json'),JSON.stringify(report));
  assert.throws(()=>verifyQualifiedRuntime(work),undefined,name);passed.push(name);
 };
 reject('missing-native-source',r=>delete r.sources['experiments/embedded-js/native/hwe_embedded.c']);
 reject('source-drift',r=>r.sources['experiments/embedded-js/native/hwe_embedded.c']='0'.repeat(64));
 reject('missing-collection-export',r=>r.exports=r.exports.filter(name=>name!=='hwe_js_collect_v1'));
 reject('wrong-library-hash',r=>r.files['hwe_embedded.dll']='0'.repeat(64));
 reject('unqualified-platform',r=>r.platform='linux');
 reject('invented-engine-acceptance',r=>r.engineQualified=true);
 reject('failed-build',r=>r.passed=false);
 reject('missing-caller',r=>r.rows[1].consumers.pop());
 reject('changed-reply',(_,raw)=>{const lines=raw.patched.cpp.replies.trim().split(/\r?\n/);lines[0]='{"ok":false}';raw.patched.cpp.replies=lines.join('\n')+'\n';});
 reject('retry-allowed-after-failure',(r,raw)=>{const row=r.rows[1];row.memory.rows[0].retryStatus=0;raw.patched.lowMemory.stdout=JSON.stringify(row.memory.rows);});
 reject('leak-after-destroy',(r,raw)=>{const row=r.rows[1];row.memory.rows[0].remainingBytes=1;raw.patched.lowMemory.stdout=JSON.stringify(row.memory.rows);});
 reject('missing-original-control',(r,raw)=>{const row=r.rows[0];row.memory.rows[0].remainingBytes=0;raw.original.lowMemory.stdout=JSON.stringify(row.memory.rows);});
 reject('wrong-patch',r=>r.patch.files['quickjs-amalgam.c']='0'.repeat(64));
 reject('missing-cleanup',r=>r.cleaned=false);
 verifyQualifiedRuntime(directory);
}finally{assert.equal(path.dirname(fs.realpathSync(work)),artifacts);fs.rmSync(work,{recursive:true,force:true});}
console.log(JSON.stringify({passed:true,controls:passed.length,names:passed,cleaned:!fs.existsSync(work)},null,2));
