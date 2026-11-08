import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {buildEmbeddedExecutable} from './embedded-native-tools.mjs';
import {root,sha256} from './reference-utils.mjs';

// Deliberately isolated research: never overwrites a package, DLL or accepted fixture.
const args=process.argv.slice(2);
assert.equal(args.length,8,'--amalgam-dir <pinned-source> --package <published-gameplay.tgz> --python <python> --output <fresh-report.json>');
assert.deepEqual([args[0],args[2],args[4],args[6]],['--amalgam-dir','--package','--python','--output']);
assert(['win32','linux'].includes(process.platform) && process.arch==='x64');
const upstream=fs.realpathSync(args[1]),archive=fs.realpathSync(args[3]),python=args[5],output=path.resolve(args[7]);
const rawOutput=output+'.raw.json.gz';
assert(!fs.existsSync(output) && !fs.existsSync(rawOutput),'Use new output paths');
assert(fs.statSync(path.dirname(output)).isDirectory());
const sourceDirectory='experiments/embedded-js/measurements';
const sources=['scripts/probe-workshop-startup.mjs','scripts/embedded-native-tools.mjs','scripts/native-tools.mjs',
 'scripts/reference-utils.mjs',sourceDirectory+'/startup-collection.c',sourceDirectory+'/startup-inputs.py',
 'experiments/embedded-js/native/hwe_embedded.c','experiments/embedded-js/native/hwe_embedded.h',
 'experiments/embedded-js/tracked-allocator.h','experiments/embedded-js/host-source-lock.json',
 'evidence/unity-workshop/acceptance.json','evidence/unity-workshop/replay.json.gz'];
const hashFile=file=>sha256(fs.readFileSync(file));
const hashes=Object.fromEntries(sources.map(file=>[file,hashFile(path.join(root,file))]));
const lock=JSON.parse(fs.readFileSync(path.join(root,'experiments/embedded-js/host-source-lock.json')));
for(const [file,hash] of Object.entries(lock.files))assert.equal(hashFile(path.join(upstream,file)),hash,file);
const packageSha256=hashFile(archive);
assert.equal(packageSha256,'ea56ce53d14a5c0b669ba1dcc05e96e90ea768994ac682e6ec54c5fd38577c76');
const work=fs.mkdtempSync(path.join(root,'.artifacts/workshop-startup-'));
const report={schemaVersion:1,passed:false,startedAt:new Date().toISOString(),
 scope:'Native workshop collection experiment. No shipping runtime change, Unity acceptance or device-performance claim.',
 sources:hashes,packageSha256,upstream:lock,
 environment:{platform:process.platform,arch:process.arch,node:process.version,os:os.release(),cpu:os.cpus()[0]?.model},
 methods:{0:'unchanged',1:'collect after create',2:'collect after configuration',
 3:'collect after create and reset threshold',4:'collect after configuration and reset threshold'},
 schedule:[0,1,2,3,4,4,3,2,1,0,2,0,4,1,3],rows:[]};
const raw={sourceText:Object.fromEntries(sources.filter(file=>!file.endsWith('.gz')).map(file=>[file,fs.readFileSync(path.join(root,file),'utf8')]))};
let failure;
try{
 execFileSync(python,['-I','-B',path.join(root,sourceDirectory,'startup-inputs.py'),archive,work],
 {cwd:root,windowsHide:true,stdio:'pipe',timeout:30000});
 const built=buildEmbeddedExecutable(work,upstream,path.join(root,sourceDirectory,'startup-collection.c'),'probe');
 report.compiler=built.compilerBanner;report.commands=built.commands;report.binarySha256=hashFile(built.binary);
 report.inputs=Object.fromEntries(['bundle.js','content.json','requests.jsonl','expected.jsonl'].map(file=>[file,hashFile(path.join(work,file))]));
 const expected=fs.readFileSync(path.join(work,'expected.jsonl'),'utf8').trim().split(/\r?\n/).map(JSON.parse);
 const verify=(actual)=>{
  assert.equal(actual.length,expected.length+2);assert(actual[0].ok && actual[1].ok);
  assert.deepEqual(actual.slice(2),expected,'Frozen original workshop replies');
 };
 for(const mode of report.schedule){
  const out=path.join(work,'replies.jsonl');
  const metrics=execFileSync(built.binary,[path.join(work,'bundle.js'),path.join(work,'content.json'),
   path.join(work,'requests.jsonl'),out,String(mode)],{cwd:work,env:built.env,windowsHide:true,encoding:'utf8',timeout:60000});
  const row=JSON.parse(metrics),bytes=fs.readFileSync(out),actual=bytes.toString('utf8').trim().split(/\r?\n/).map(JSON.parse);
  verify(actual);
  if(!report.replyMutationRejected){
   const changed=structuredClone(actual);changed[2]={ok:false,reason:'deliberately changed reply'};
   assert.throws(()=>verify(changed),/Frozen original workshop replies/);
   report.replyMutationRejected=true;
  }
  assert.equal(row.mode,mode);assert.equal(row.requests,expected.length+2);
  assert.equal(row.closedBytes,0);assert(row.peakBytes<=32*1024*1024);
  assert(mode===0 ? row.afterBytes===row.beforeBytes : row.afterBytes<row.beforeBytes);
  row.responseSha256=sha256(bytes);report.rows.push(row);fs.unlinkSync(out);
  console.log(JSON.stringify(row));
 }
 assert.equal(new Set(report.rows.map(row=>row.responseSha256)).size,1);
 report.passed=true;
}catch(error){failure=error;report.failure=String(error.stack ?? error);}
finally{
 try{
  for(const [file,hash] of Object.entries(hashes))assert.equal(hashFile(path.join(root,file)),hash,file);
  assert.equal(hashFile(archive),packageSha256);
  for(const [file,hash] of Object.entries(lock.files))assert.equal(hashFile(path.join(upstream,file)),hash,file);
  for(const file of ['build.txt','build-commands.json'])if(fs.existsSync(path.join(work,file)))raw[file]=fs.readFileSync(path.join(work,file),'utf8');
 }catch(error){failure ??=error;report.failure=String(error.stack ?? error);report.passed=false;}
 finally{
  const resolved=fs.realpathSync(work);
  assert(resolved.startsWith(fs.realpathSync(path.join(root,'.artifacts'))+path.sep));
  fs.rmSync(resolved,{recursive:true});report.cleaned=!fs.existsSync(resolved);
 }
 report.finishedAt=new Date().toISOString();
 const bytes=gzipSync(JSON.stringify(raw));report.rawSha256=sha256(bytes);
 fs.writeFileSync(rawOutput,bytes,{flag:'wx'});
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
}
if(failure)throw failure;
console.log(JSON.stringify({passed:report.passed,runs:report.rows.length,cleaned:report.cleaned,output}));
