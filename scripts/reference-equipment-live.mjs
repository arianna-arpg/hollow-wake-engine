import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';import {gzipSync,gunzipSync} from 'node:zlib';
import {root,verifyReference,sha256} from './reference-utils.mjs';
const capture=process.argv[2]==='--initial-capture';assert.equal(process.argv.length,capture?3:2);
const ref=path.join(root,'.reference'),dir=path.join(root,'baseline/equipment-live');if(capture)assert(!fs.existsSync(dir));
const lockBytes=fs.readFileSync(path.join(root,'baseline/source-lock.json')),lock=JSON.parse(lockBytes);verifyReference(ref,lock);
const sourcePath='reference/export-equipment-live.ts',source=fs.readFileSync(path.join(root,sourcePath));
const owned=path.join(root,'.artifacts');fs.mkdirSync(owned,{recursive:true});const work=fs.mkdtempSync(path.join(owned,'equipment-live-reference-owned-'));
const probe=path.join(ref,'balance','hwe-equipment-live-'+randomUUID()+'.ts');
const report={passed:false,capture,source:sourcePath,sourceSha256:sha256(source),sourceLockSha256:sha256(lockBytes)};
const run=args=>{try{return execFileSync(process.execPath,args,{cwd:ref,windowsHide:true,timeout:180000,stdio:'pipe',maxBuffer:4*1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work}});}catch(error){process.stderr.write(error.stdout??'');process.stderr.write(error.stderr??'');throw error;}};
try{
 fs.writeFileSync(probe,source,{flag:'wx'});
 run([path.join(ref,'node_modules/typescript/bin/tsc'),'--noEmit','-p','tsconfig.sim.json']);report.types=true;
 const fresh=n=>{const output=path.join(work,n+'.json');run(['--import','tsx',probe,output]);return fs.readFileSync(output);};
 const first=fresh(1),second=fresh(2);assert(first.equals(second));const data=JSON.parse(first);assert.equal(data.rows.length,47);assert.equal(data.scenarios.length,9);
 const packed=capture?gzipSync(first,{level:9}):fs.readFileSync(path.join(dir,'observations.json.gz'));
 const manifest={schemaVersion:1,scope:data.scope,source:sourcePath,sourceSha256:sha256(source),sourceLockSha256:sha256(lockBytes),cases:data.rows.length,scenarios:data.scenarios,freshProcesses:2,sha256:sha256(first),gzipSha256:sha256(packed)};
 if(capture){fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'observations.json.gz'),packed,{flag:'wx'});fs.writeFileSync(path.join(dir,'acceptance.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});}
 else{assert(first.equals(gunzipSync(packed)));assert.deepEqual(manifest,JSON.parse(fs.readFileSync(path.join(dir,'acceptance.json'))));}
 report.passed=true;report.manifest=manifest;
}finally{
 try{verifyReference(ref,lock);assert.equal(sha256(fs.readFileSync(path.join(root,sourcePath))),report.sourceSha256);report.inputsUnchanged=true;}
 finally{if(fs.existsSync(probe))fs.unlinkSync(probe);assert.equal(path.dirname(fs.realpathSync(work)),fs.realpathSync(owned));fs.rmSync(work,{recursive:true});report.cleaned=true;fs.writeFileSync(path.join(owned,'equipment-live-reference-'+randomUUID()+'.json'),JSON.stringify(report,null,2)+'\n');}
}
console.log({passed:true,cases:report.manifest.cases,scenarios:report.manifest.scenarios.length});
