import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {root,verifyReference,sha256} from './reference-utils.mjs';

const args=process.argv.slice(2),capture=args[0]==='--initial-capture';
assert(args.length===0 || (args.length===1 && capture));
const ref=path.join(root,'.reference'),dir=path.join(root,'baseline/live-equipment/v2');
const accepted=path.join(dir,'observations.json.gz'),manifest=path.join(dir,'acceptance.json');
if(capture)assert(!fs.existsSync(accepted) && !fs.existsSync(manifest),'Refusing to replace the accepted original observations');
const lockFile=path.join(root,'baseline/source-lock.json'),lockBytes=fs.readFileSync(lockFile),lock=JSON.parse(lockBytes);
verifyReference(ref,lock);
const sourceFile='reference/export-live-equipment.ts',source=fs.readFileSync(path.join(root,sourceFile));
const script=path.join(ref,'balance','hwe-live-equipment-'+randomUUID()+'.ts');
const work=fs.mkdtempSync(path.join(root,'.artifacts/live-equipment-'));
let created=false;
try{
 fs.writeFileSync(script,source,{flag:'wx'});created=true;
 const run=index=>{
  const output=path.join(work,index+'.json');
  execFileSync(process.execPath,['--import','tsx',script,output],{cwd:ref,windowsHide:true,stdio:'inherit',timeout:120000});
  return fs.readFileSync(output);
 };
 const first=run('first'),second=run('second');assert.deepEqual(second,first,'Fresh original-game captures differ');
 const data=JSON.parse(first);
 assert.equal(data.rows.length,12);
 if(capture){
  const compressed=gzipSync(first,{level:9});
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(accepted,compressed,{flag:'wx'});
  fs.writeFileSync(manifest,JSON.stringify({schemaVersion:1,scope:data.scope,source:sourceFile,
   sourceSha256:sha256(source),sourceLockSha256:sha256(lockBytes),sha256:sha256(first),
   gzipSha256:sha256(compressed),courses:data.rows.length,
   observations:data.rows.reduce((n,row)=>n+row.steps.length,0),freshProcesses:2},null,2)+'\n',{flag:'wx'});
 }else{
  const receipt=JSON.parse(fs.readFileSync(manifest)),bytes=fs.readFileSync(accepted);
  assert.equal(sha256(lockBytes),receipt.sourceLockSha256);
  assert.equal(sha256(source),receipt.sourceSha256);
  assert.equal(sha256(bytes),receipt.gzipSha256);
  const original=gunzipSync(bytes);assert.equal(sha256(original),receipt.sha256);
  assert.deepEqual(first,original,'Original equipment behavior changed');
 }
 console.log({passed:true,capture,courses:data.rows.length,sha256:sha256(first)});
}finally{
 try{
  verifyReference(ref,lock);assert.equal(sha256(fs.readFileSync(path.join(root,sourceFile))),sha256(source));
 }finally{
  if(created)fs.unlinkSync(script);
  const resolved=fs.realpathSync(work);
  assert(resolved.startsWith(fs.realpathSync(path.join(root,'.artifacts'))+path.sep));
  fs.rmSync(resolved,{recursive:true});
 }
}
