import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {root} from '../scripts/reference-utils.mjs';import {downloadPinned,installReferenceElectron} from '../scripts/tool-download.mjs';
const artifact=path.join(root,'.artifacts');fs.mkdirSync(artifact,{recursive:true});
const sha=value=>createHash('sha256').update(value).digest('hex'),body=Buffer.from('pinned archive bytes');
const pin={url:'https://downloads.invalid/pinned.zip',bytes:body.length,sha256:sha(body)};
async function fixture(run){const dir=fs.mkdtempSync(path.join(artifact,'tool-download-test-'));
 try{return await run(dir);}finally{assert.equal(path.dirname(fs.realpathSync(dir)),fs.realpathSync(artifact));fs.rmSync(dir,{recursive:true});}}
const quiet={onRetry:()=>{}};

test('transient HTTP failures retry with bounded delays and retain only exact pinned bytes',()=>fixture(async dir=>{
 const waits=[],observed=[],signals=[];let calls=0;const file=path.join(dir,'archive.zip');
 const result=await downloadPinned(pin,file,{fetchImpl:async(url,options)=>{assert.equal(url,pin.url);signals.push(options.signal);return ++calls<3?new Response('gateway',{status:calls===1?504:503}):new Response(body);},
  wait:async ms=>{assert(!fs.existsSync(file));waits.push(ms);},onRetry:row=>observed.push(row)});
 assert.equal(calls,3);assert.deepEqual(waits,[1000,2000]);assert.equal(new Set(signals).size,1,'one total download deadline');
 assert.deepEqual(result,{bytes:body.length,sha256:pin.sha256,attempts:3});assert.deepEqual(fs.readFileSync(file),body);
 assert.deepEqual(observed.map(row=>row.status),[504,503]);
}));

test('rate-limit retry dates and seconds are capped at thirty seconds per wait',()=>fixture(async dir=>{
 for(const header of ['120',new Date(Date.now()+120000).toUTCString()]){
  let calls=0;const waits=[];await downloadPinned(pin,path.join(dir,'archive-'+fs.readdirSync(dir).length),{...quiet,
   fetchImpl:async()=>++calls===1?new Response('',{status:429,headers:{'retry-after':header}}):new Response(body),wait:async ms=>waits.push(ms)});
  assert.deepEqual(waits,[30000]);assert.equal(calls,2);
 }
}));

test('permanent HTTP errors cancel the response and do not retry or create a file',()=>fixture(async dir=>{
 let calls=0,cancelled=false;const stream=new ReadableStream({cancel(){cancelled=true;}});
 await assert.rejects(downloadPinned(pin,path.join(dir,'archive'),{...quiet,fetchImpl:async()=>{calls++;return new Response(stream,{status:404});},wait:async()=>assert.fail('unexpected retry')}),/HTTP 404/);
 assert.equal(calls,1);assert(cancelled);assert.deepEqual(fs.readdirSync(dir),[]);
}));

test('exhausted transient failures stop after three attempts without partial files',()=>fixture(async dir=>{
 let calls=0;const waits=[];
 await assert.rejects(downloadPinned(pin,path.join(dir,'archive'),{...quiet,fetchImpl:async()=>{calls++;return new Response('',{status:504});},wait:async ms=>waits.push(ms)}),/HTTP 504/);
 assert.equal(calls,3);assert.deepEqual(waits,[1000,2000]);assert.deepEqual(fs.readdirSync(dir),[]);
}));

test('short, oversized and checksum-invalid archives fail once and remove their partial files',()=>fixture(async dir=>{
 for(const [payload,expected]of [[body.subarray(1),/pinned size/],[Buffer.concat([body,body]),/pinned size/],[Buffer.alloc(body.length),/pinned checksum/]]){
  let calls=0;await assert.rejects(downloadPinned(pin,path.join(dir,'archive'),{...quiet,fetchImpl:async()=>{calls++;return new Response(payload);},wait:async()=>assert.fail('corruption must not retry')}),expected);
  assert.equal(calls,1);assert.deepEqual(fs.readdirSync(dir),[]);
 }
}));

test('a broken response stream closes and removes the partial file without hiding the error',()=>fixture(async dir=>{
 let pulls=0;const stream=new ReadableStream({pull(controller){if(pulls++===0)controller.enqueue(body.subarray(0,3));else controller.error(Error('connection lost'));}});
 await assert.rejects(downloadPinned(pin,path.join(dir,'archive'),{...quiet,fetchImpl:async()=>new Response(stream),wait:async()=>assert.fail('unexpected retry')}),/connection lost/);
 assert.deepEqual(fs.readdirSync(dir),[]);
}));

test('existing files and a destination created during the request are never overwritten or deleted',()=>fixture(async dir=>{
 const file=path.join(dir,'archive');fs.writeFileSync(file,'existing work');
 await assert.rejects(downloadPinned(pin,file,{fetchImpl:async()=>assert.fail('must refuse before network')}),/already exists/);
 assert.equal(fs.readFileSync(file,'utf8'),'existing work');fs.unlinkSync(file);
 await assert.rejects(downloadPinned(pin,file,{fetchImpl:async()=>{fs.writeFileSync(file,'concurrent work');return new Response(body);}}),/EEXIST/);
 assert(fs.existsSync(file),'The concurrent file must survive the failed exclusive open');
 assert.equal(fs.readFileSync(file,'utf8'),'concurrent work');
}));

test('invalid pin metadata refuses before opening files or calling the network',()=>fixture(async dir=>{
 for(const item of [{...pin,url:'http://downloads.invalid/a'},{...pin,bytes:-1},{...pin,sha256:'wrong'}])
  await assert.rejects(downloadPinned(item,path.join(dir,'archive'),{fetchImpl:async()=>assert.fail('invalid pin reached network')}),/Invalid pinned download/);
 assert.deepEqual(fs.readdirSync(dir),[]);
}));

test('Electron retains its installer and retries only explicit transient HTTP failures',()=>fixture(async dir=>{
 const file=path.join(dir,'install.js');fs.writeFileSync(file,'// existing installer');let calls=0;const waits=[],output=[];
 const result=await installReferenceElectron(file,{...quiet,run:actual=>{assert.equal(actual,file);return ++calls===1?{status:1,stderr:'HTTPError: Response code 504 (Gateway Time-out)\n'}:{status:0,stdout:'installed\n'};},wait:async ms=>waits.push(ms),write:chunk=>output.push(chunk)});
 assert.deepEqual(result,{passed:true,attempts:2});assert.deepEqual(waits,[1000]);assert.equal(output.length,2);assert.equal(fs.readFileSync(file,'utf8'),'// existing installer');
}));

test('Electron checksum errors, process errors and signals fail immediately',()=>fixture(async dir=>{
 const file=path.join(dir,'install.js');fs.writeFileSync(file,'// retained');
 for(const result of [{status:7,stderr:'Checksum mismatch\n'},{status:null,error:Error('cannot spawn')},{status:null,signal:'SIGTERM'}]){
  let calls=0;await assert.rejects(installReferenceElectron(file,{...quiet,run:()=>{calls++;return result;},write:()=>{},wait:async()=>assert.fail('non-HTTP failure retried')}),error=>{
   assert.equal(error.message,result.error?.message??(result.signal?'Electron installer terminated by SIGTERM':'Electron installer failed'));
   if(result.status===7)assert.equal(error.exitCode,7);return true;
  });assert.equal(calls,1);
 }
}));

test('Electron CLI preserves installer exit status and actually reruns the existing child',()=>fixture(async dir=>{
 const installer=path.join(dir,'install.cjs'),counter=path.join(dir,'count.json');
 fs.writeFileSync(installer,"const fs=require('node:fs'),p=require('node:path').join(__dirname,'count.json');const n=fs.existsSync(p)?JSON.parse(fs.readFileSync(p))+1:1;fs.writeFileSync(p,JSON.stringify(n));if(n===1){console.error('HTTPError: Response code 504 (Gateway Time-out)');process.exitCode=1;}");
 const run=()=>spawnSync(process.execPath,[path.join(root,'scripts/install-reference-electron.mjs'),installer],{encoding:'utf8',windowsHide:true,timeout:15000,env:{...process.env,TEMP:dir,TMP:dir,TMPDIR:dir}});
 const passed=run();assert.equal(passed.status,0,passed.stderr);assert.equal(JSON.parse(fs.readFileSync(counter)),2);
 fs.writeFileSync(installer,"console.error('Checksum mismatch');process.exitCode=7;");
 const failed=run();assert.equal(failed.status,7);assert(!failed.stderr.includes('Retrying'));
}));

test('Godot preparation uses bounded retries and retains only its failure receipt',
 {skip:!['win32','linux'].includes(process.platform)||process.arch!=='x64'},()=>fixture(async dir=>{
 for(const name of ['scripts','experiments/godot-native','.artifacts'])fs.mkdirSync(path.join(dir,name),{recursive:true});
 for(const file of ['scripts/prepare-godot-tools.mjs','scripts/tool-download.mjs','scripts/reference-utils.mjs','experiments/godot-native/toolchain-lock.json'])fs.copyFileSync(path.join(root,file),path.join(dir,file));
 fs.writeFileSync(path.join(dir,'.artifacts/sentinel'),'unrelated work');
 fs.writeFileSync(path.join(dir,'mock.mjs'),"import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';let n=0;globalThis.fetch=async()=>{"+
  "fs.writeFileSync(new URL('./count.json',import.meta.url),JSON.stringify(++n));const base=fileURLToPath(new URL('./.artifacts/',import.meta.url));"+
  "const owned=path.join(base,fs.readdirSync(base).find(name=>name.startsWith('godot-tools-')&&!name.endsWith('.json')));"+
  "fs.writeFileSync(path.join(owned,'failed.zip'),'partial archive');fs.mkdirSync(path.join(owned,'extracted'),{recursive:true});"+
  "fs.writeFileSync(path.join(owned,'extracted/failed.tmp'),'partial extraction');return new Response('gateway',{status:504});};");
 const child=spawnSync(process.execPath,['--import',pathToFileURL(path.join(dir,'mock.mjs')).href,path.join(dir,'scripts/prepare-godot-tools.mjs'),
  '--cmake',process.execPath,'--ninja',process.execPath,'--python',process.execPath],{cwd:dir,encoding:'utf8',windowsHide:true,timeout:20000,env:{...process.env,TEMP:dir,TMP:dir,TMPDIR:dir}});
 assert.equal(child.status,1,child.stderr);assert.match(child.stderr,/HTTP 504/);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'count.json'))),3);
 const pointer=JSON.parse(fs.readFileSync(path.join(dir,'.artifacts/godot-tools-latest.json'))),report=JSON.parse(fs.readFileSync(pointer.receipt));
 assert.equal(report.passed,false);assert.equal(report.failedFilesCleaned,true);assert.match(report.error,/HTTP 504/);
 assert.deepEqual(fs.readdirSync(pointer.directory),['preparation.json']);assert.equal(fs.readFileSync(path.join(dir,'.artifacts/sentinel'),'utf8'),'unrelated work');
}));
