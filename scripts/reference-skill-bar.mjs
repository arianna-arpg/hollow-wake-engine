import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';import {gzipSync,gunzipSync} from 'node:zlib';
import {root,verifyReference,sha256} from './reference-utils.mjs';
const capture=process.argv[2]==='--initial-capture';assert.equal(process.argv.length,capture?3:2);
const ref=path.join(root,'.reference'),dir=path.join(root,'baseline/skill-bar');if(capture)assert(!fs.existsSync(dir));
const lockBytes=fs.readFileSync(path.join(root,'baseline/source-lock.json')),lock=JSON.parse(lockBytes);verifyReference(ref,lock);
const sourcePath='reference/export-skill-bar.ts',source=fs.readFileSync(path.join(root,sourcePath));
const owned=path.join(root,'.artifacts');fs.mkdirSync(owned,{recursive:true});const work=fs.mkdtempSync(path.join(owned,'skill-bar-reference-owned-'));
const probe=path.join(ref,'balance','hwe-skill-bar-'+randomUUID()+'.ts');
const report={passed:false,capture,source:sourcePath,sourceSha256:sha256(source),sourceLockSha256:sha256(lockBytes)};
try{
 fs.writeFileSync(probe,source,{flag:'wx'});
 try{execFileSync(process.execPath,[path.join(ref,'node_modules/typescript/bin/tsc'),'--noEmit','-p','tsconfig.sim.json'],{cwd:ref,windowsHide:true,timeout:180000,stdio:'pipe',maxBuffer:4*1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work}});}
 catch(error){process.stderr.write(error.stdout??'');process.stderr.write(error.stderr??'');throw error;}
 report.types=true;
 const run=n=>{const output=path.join(work,n+'.json');try{execFileSync(process.execPath,['--import','tsx',probe,output],{cwd:ref,windowsHide:true,timeout:180000,stdio:'pipe',maxBuffer:4*1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work}});}catch(error){process.stderr.write(error.stderr??String(error));throw error;}return fs.readFileSync(output);};
 const first=run(1),second=run(2);assert(first.equals(second));const data=JSON.parse(first);assert.equal(data.rows.length,31);assert.equal(data.memory.length,8);
 const packed=capture?gzipSync(first,{level:9}):fs.readFileSync(path.join(dir,'observations.json.gz'));
 const manifest={schemaVersion:1,scope:data.scope,source:sourcePath,sourceSha256:sha256(source),sourceLockSha256:sha256(lockBytes),cases:data.rows.length,memoryCases:data.memory.length,freshProcesses:2,sha256:sha256(first),gzipSha256:sha256(packed)};
 if(capture){fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'observations.json.gz'),packed,{flag:'wx'});fs.writeFileSync(path.join(dir,'acceptance.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});}
 else{assert(first.equals(gunzipSync(packed)));assert.deepEqual(manifest,JSON.parse(fs.readFileSync(path.join(dir,'acceptance.json'))));}
 report.passed=true;report.manifest=manifest;
}finally{
 try{verifyReference(ref,lock);assert.equal(sha256(fs.readFileSync(path.join(root,sourcePath))),report.sourceSha256);report.inputsUnchanged=true;}
 finally{if(fs.existsSync(probe))fs.unlinkSync(probe);assert.equal(path.dirname(fs.realpathSync(work)),fs.realpathSync(owned));fs.rmSync(work,{recursive:true});report.cleaned=true;fs.writeFileSync(path.join(owned,'skill-bar-reference-'+randomUUID()+'.json'),JSON.stringify(report,null,2)+'\n');}
}
console.log({passed:true,cases:report.manifest.cases});
