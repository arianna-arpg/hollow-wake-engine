import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync,spawnSync} from 'node:child_process';import {gzipSync} from 'node:zlib';
import {root,sha256} from '../../../scripts/reference-utils.mjs';import{nativeEnvironment}from'../../../scripts/native-tools.mjs';import{verifyQualifiedRuntime}from'./verify-qualified-runtime.mjs';
const args=process.argv.slice(2);assert.equal(args.length,8);assert.deepEqual([args[0],args[2],args[4],args[6]],['--runtime','--package','--python','--output']);
const runtime=fs.realpathSync(args[1]),archive=fs.realpathSync(args[3]),python=fs.realpathSync(args[5]),output=path.resolve(args[7]);
const profile=verifyQualifiedRuntime(runtime);assert.equal(process.platform,'win32');
assert.equal(sha256(fs.readFileSync(archive)),'ea56ce53d14a5c0b669ba1dcc05e96e90ea768994ac682e6ec54c5fd38577c76');
assert(!fs.existsSync(output)&&!fs.existsSync(output+'.raw.json.gz'));
const sources=['experiments/embedded-js/patches/test-qualified-collection.mjs','experiments/embedded-js/patches/verify-qualified-runtime.mjs',
 'experiments/embedded-js/native/collection-consumer.cpp','experiments/embedded-js/native/consumer.cpp','experiments/embedded-js/native/hwe_embedded.h',
 'experiments/embedded-js/measurements/startup-inputs.py','evidence/unity-workshop/acceptance.json','evidence/unity-workshop/replay.json.gz'];
const report={passed:false,engineQualified:false,deviceQualified:false,nativeSha256:profile.files['hwe_embedded.dll'],
 runtimeReceiptSha256:sha256(fs.readFileSync(path.join(runtime,'runtime-receipt.json'))),rows:[],
 sources:Object.fromEntries(sources.map(file=>[file,sha256(fs.readFileSync(path.join(root,file)))]))},raw={};
const artifacts=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(artifacts,'qualified-collection-'));
try{
 const env={...nativeEnvironment(work),TEMP:work,TMP:work,TMPDIR:work},binary=path.join(work,'collection.exe');
 report.command={command:'cl.exe',args:['/nologo','/O2','/W4','/WX','/std:c++17','/utf-8','/EHsc','/MT',
  path.join(root,'experiments/embedded-js/native/collection-consumer.cpp'),'/Fo:'+path.join(work,'collection.obj'),'/Fe:'+binary,'/link','/STACK:2097152']};
 raw.build=execFileSync(report.command.command,report.command.args,{cwd:work,env,windowsHide:true,encoding:'utf8',timeout:180000});
 execFileSync(python,['-I','-B',path.join(root,'experiments/embedded-js/measurements/startup-inputs.py'),archive,work],
  {cwd:root,env,windowsHide:true,stdio:'pipe',timeout:30000});
 const requestFile=path.join(work,'requests.jsonl'),requests=fs.readFileSync(requestFile,'utf8').trimEnd().split('\n');assert.equal(requests.length,58);
 fs.appendFileSync(requestFile,(requests.slice(2).join('\n')+'\n').repeat(7));
 const expected=fs.readFileSync(path.join(work,'expected.jsonl'),'utf8').trim().split(/\r?\n/).map(line=>JSON.parse(line));assert.equal(expected.length,56);
 report.inputs=Object.fromEntries(['bundle.js','content.json','requests.jsonl','expected.jsonl'].map(file=>[file,sha256(fs.readFileSync(path.join(work,file)))]));
 for(const mode of ['none','configured','every-release']){
  const replyFile=path.join(work,'replies.jsonl'),result=spawnSync(binary,[path.join(runtime,'hwe_embedded.dll'),path.join(work,'bundle.js'),path.join(work,'content.json'),requestFile,replyFile,mode],
   {cwd:work,env,windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:1024*1024});
  raw[mode]={stdout:result.stdout,stderr:result.stderr,status:result.status,signal:result.signal,error:result.error?.message??null};
  assert.equal(result.status,0,result.stderr);assert(!result.error&&!result.signal);
  const replies=fs.readFileSync(replyFile,'utf8'),rows=replies.trim().split(/\r?\n/).map(line=>JSON.parse(line));assert.equal(rows.length,450);
  assert(rows[0].ok&&rows[1].ok);
  for(let index=2;index<rows.length;index++)assert.deepEqual(rows[index],expected[(index-2)%56],mode+' reply '+index);
  if(mode==='none')raw.replies=replies;
  const stats=JSON.parse(result.stdout);assert(stats.passed&&stats.contracts&&stats.requests===450&&stats.closedBytes===0&&stats.closedBlocks===0);
  assert.equal(stats.collections,mode==='none'?0:mode==='configured'?1:450);assert(stats.peakBytes<=32*1024*1024);
  report.rows.push({mode,...stats,replySha256:sha256(replies)});console.log({mode,...stats});
 }
 assert.equal(new Set(report.rows.map(row=>row.replySha256)).size,1);
 assert(report.rows[1].afterBytes<report.rows[1].beforeBytes);verifyQualifiedRuntime(runtime);report.passed=true;
}catch(error){report.failure=String(error);throw error;}
finally{
 try{
  report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(fs.readFileSync(path.join(root,file)))===hash);
  const packed=gzipSync(JSON.stringify(raw),{level:9});fs.writeFileSync(output+'.raw.json.gz',packed,{flag:'wx'});report.rawSha256=sha256(packed);
 }finally{
  assert.equal(path.dirname(fs.realpathSync(work)),artifacts);fs.rmSync(work,{recursive:true,force:true});report.cleaned=true;report.passed=report.passed&&report.inputsUnchanged;
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 }
}
