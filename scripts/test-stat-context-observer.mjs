import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {root,sha256,verifyReference,writeJSON} from './reference-utils.mjs';import {statContextObserverFaults,changeStatContextSource} from './stat-context-observer-faults.mjs';
const accepted=JSON.parse(fs.readFileSync('baseline/stat-context/acceptance.json'));
const {gunzipSync}=await import('node:zlib');
const helper=fs.readFileSync('reference/export-stat-context.ts','utf8');assert.equal(sha256(helper),accepted.helperSha256);
const compressed=fs.readFileSync(accepted.observations);assert.equal(sha256(compressed),accepted.compressedSha256);const expected=gunzipSync(compressed);assert.equal(sha256(expected),accepted.observationsSha256);
const source=fs.readFileSync('.reference/src/engine/stats.ts','utf8'),defense=fs.readFileSync('.reference/src/engine/defense.ts');
verifyReference(path.join(root,'.reference'),JSON.parse(fs.readFileSync('baseline/source-lock.json')));
assert.equal(sha256(source),JSON.parse(fs.readFileSync('baseline/stat-context/source-boundary.json')).sourceSha256);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/stat-context-source-faults-')),results=[];let passed=false;
try{for(const fault of [null,...statContextObserverFaults]){
 const name=fault?.[0]??'control',sample=path.join(directory,name);fs.mkdirSync(sample);
 fs.writeFileSync(path.join(sample,'stats.ts'),fault?changeStatContextSource(source,fault):source);fs.writeFileSync(path.join(sample,'defense.ts'),defense);
 const runtime=path.join(sample,'capture.ts'),out=path.join(sample,'observations.json');fs.writeFileSync(runtime,helper.replace("'../src/engine/stats'",JSON.stringify(pathToFileURL(path.join(sample,'stats.ts')).href)));
 const fd=fs.openSync(path.join(sample,'capture.txt'),'wx');try{execFileSync(process.execPath,['--import',pathToFileURL(path.join(root,'.reference/node_modules/tsx/dist/loader.mjs')).href,runtime,out],{cwd:root,stdio:['ignore',fd,fd],timeout:120000,windowsHide:true});}finally{fs.closeSync(fd);}
 const actual=fs.readFileSync(out);assert.equal(actual.equals(expected),!fault,name);assert.equal(JSON.parse(actual).rows.length,74);
 results.push({name,detected:!!fault,sha256:sha256(actual)});console.log('Passed '+name);
 }passed=true;
}finally{const report={passed,directory,faults:results.filter(r=>r.detected).length,helperSha256:sha256(helper),sourceSha256:sha256(source),results};writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/stat-context-observer-verification.json',report);console.log({passed,directory,faults:report.faults});}
