import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {gzipSync,gunzipSync} from 'node:zlib';
import {root,sha256,verifyReference} from './reference-utils.mjs';
assert.equal(process.argv.length,2,'This runner compares accepted observations; it cannot regenerate expectations');
const owned=path.join(root,'.artifacts');fs.mkdirSync(owned,{recursive:true});const work=fs.mkdtempSync(path.join(owned,'companion-mechanics-reference-owned-'));
const ref=path.join(root,'.reference'),report={passed:false,sources:{},courses:[]},logs={};
function tracked(file){const bytes=fs.readFileSync(path.join(root,file));report.sources[file]=sha256(bytes);return bytes;}
const lockBytes=tracked('baseline/source-lock.json'),lock=JSON.parse(lockBytes);tracked('scripts/reference-companion-mechanics.mjs');
const run=(label,args)=>{const c=spawnSync(process.execPath,args,{cwd:ref,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:4*1024*1024,
 env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_COMPILE_CACHE:path.join(work,'compile-cache')}});logs[label]={stdout:c.stdout??'',stderr:c.stderr??''};assert(!c.error&&!c.signal&&c.status===0,label+': '+JSON.stringify(logs[label]));return logs[label];};
try{
 verifyReference(ref,lock);const accepted=JSON.parse(tracked('baseline/bond-mechanics/acceptance.json')),packed=tracked('baseline/bond-mechanics/original.logs.json.gz'),expected=JSON.parse(gunzipSync(packed));
 assert.equal(sha256(lockBytes),accepted.sourceLockSha256);assert.equal(sha256(packed),accepted.logsSha256);
 for(const course of accepted.courses)assert.equal(sha256(fs.readFileSync(path.join(ref,course.source))),accepted.sources[course.source]);
 const config=path.join(work,'tsconfig.json');fs.writeFileSync(config,JSON.stringify({extends:path.join(ref,'tsconfig.sim.json'),compilerOptions:{typeRoots:[path.join(ref,'node_modules/@types')]},include:[path.join(ref,'src'),...accepted.courses.map(c=>path.join(ref,c.source))]}));
 run('types',[path.join(ref,'node_modules/typescript/bin/tsc'),'--noEmit','-p',config]);report.types=true;
 for(const course of accepted.courses){const name=path.basename(course.source,'.ts');assert.deepEqual(expected[name+'-1'],expected[name+'-2']);
  for(let i=1;i<=2;i++)assert.deepEqual(run(name+'-'+i,['--import','tsx',course.source]),expected[name+'-1']);report.courses.push({...course,freshProcesses:2});
 }
 report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 try{verifyReference(ref,lock);report.inputsUnchanged=Object.entries(report.sources).every(([f,h])=>sha256(fs.readFileSync(path.join(root,f)))===h);report.passed=report.passed&&report.inputsUnchanged;}
 catch(error){report.failure=String(error);report.passed=false;process.exitCode=1;}
 finally{assert.equal(path.dirname(fs.realpathSync(work)),fs.realpathSync(owned));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;
  const bytes=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(bytes);fs.writeFileSync(path.join(owned,'companion-mechanics-reference.logs.json.gz'),bytes);fs.writeFileSync(path.join(owned,'companion-mechanics-reference.json'),JSON.stringify(report,null,2)+'\n');}
}
assert(report.passed,report.failure);console.log({passed:true,courses:report.courses,cleaned:true});
