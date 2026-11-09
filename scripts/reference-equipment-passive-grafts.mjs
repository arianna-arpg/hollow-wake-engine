import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';import {gzipSync,gunzipSync} from 'node:zlib';
import {root,verifyReference,sha256} from './reference-utils.mjs';
const capture=process.argv[2]==='--initial-capture';assert.equal(process.argv.length,capture?3:2);
const ref=path.join(root,'.reference'),dir=path.join(root,'baseline/equipment-passive-grafts');if(capture)assert(!fs.existsSync(dir));
const lockBytes=fs.readFileSync(path.join(root,'baseline/source-lock.json')),lock=JSON.parse(lockBytes);verifyReference(ref,lock);
const sourcePath='reference/export-equipment-passive-grafts.ts',helperPath='reference/equipment-skill-observer.ts';
const source=fs.readFileSync(path.join(root,sourcePath),'utf8'),helper=fs.readFileSync(path.join(root,helperPath));
const owned=path.join(root,'.artifacts');fs.mkdirSync(owned,{recursive:true});const work=fs.mkdtempSync(path.join(owned,'equipment-passive-reference-owned-'));
const helperFile=path.join(ref,'balance','hwe-passive-graft-helper-'+randomUUID()+'.ts'),probe=path.join(ref,'balance','hwe-passive-graft-probe-'+randomUUID()+'.ts');
const report={passed:false,capture,source:sourcePath,sourceSha256:sha256(source),helper:helperPath,helperSha256:sha256(helper),sourceLockSha256:sha256(lockBytes)};
try{
 assert.equal(source.split('__EQUIPMENT_OBSERVER__').length,2);
 fs.writeFileSync(helperFile,helper,{flag:'wx'});fs.writeFileSync(probe,source.replace('__EQUIPMENT_OBSERVER__','./'+path.basename(helperFile)),{flag:'wx'});
 const run=n=>{const output=path.join(work,n+'.json');execFileSync(process.execPath,['--import','tsx',probe,output],{cwd:ref,windowsHide:true,timeout:180000,stdio:'pipe',maxBuffer:4*1024*1024});return fs.readFileSync(output);};
 const first=run(1),second=run(2);assert(first.equals(second));const data=JSON.parse(first);assert.equal(data.rows.length,15);
 const packed=capture?gzipSync(first,{level:9}):fs.readFileSync(path.join(dir,'observations.json.gz'));
 const manifest={schemaVersion:1,scope:'Original passive graft ownership and live authoring transitions using registered supports',source:sourcePath,sourceSha256:sha256(source),helper:helperPath,helperSha256:sha256(helper),sourceLockSha256:sha256(lockBytes),cases:data.rows.length,worlds:data.worlds,freshProcesses:2,sha256:sha256(first),gzipSha256:sha256(packed)};
 if(capture){fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'observations.json.gz'),packed,{flag:'wx'});fs.writeFileSync(path.join(dir,'acceptance.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});}
 else{assert(first.equals(gunzipSync(packed)));assert.deepEqual(manifest,JSON.parse(fs.readFileSync(path.join(dir,'acceptance.json'))));}
 report.passed=true;report.manifest=manifest;
}finally{
 try{verifyReference(ref,lock);assert.equal(sha256(fs.readFileSync(path.join(root,sourcePath))),report.sourceSha256);assert.equal(sha256(fs.readFileSync(path.join(root,helperPath))),report.helperSha256);report.inputsUnchanged=true;}
 finally{for(const file of [helperFile,probe])if(fs.existsSync(file))fs.unlinkSync(file);assert.equal(path.dirname(fs.realpathSync(work)),fs.realpathSync(owned));fs.rmSync(work,{recursive:true});report.cleaned=true;fs.writeFileSync(path.join(owned,'equipment-passive-reference-'+randomUUID()+'.json'),JSON.stringify(report,null,2)+'\n');}
}
console.log({passed:true,cases:report.manifest.cases});
