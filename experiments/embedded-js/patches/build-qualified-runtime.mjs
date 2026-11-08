import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {gzipSync,gunzipSync} from 'node:zlib';
import {root,sha256} from '../../../scripts/reference-utils.mjs';
import {buildEmbeddedLibrary,buildEmbeddedManagedConsumer} from '../../../scripts/embedded-native-tools.mjs';
import {prepareCStringCleanup} from './cstring-cleanup.mjs';
import {qualifiedRuntimeSources} from './verify-qualified-runtime.mjs';
const args=process.argv.slice(2);assert.equal(args.length,6,'--amalgam-dir SOURCE --python PYTHON --output FRESH_DIRECTORY');
assert.deepEqual([args[0],args[2],args[4]],['--amalgam-dir','--python','--output']);
assert.equal(process.platform,'win32');assert.equal(process.arch,'x64');
const original=fs.realpathSync(args[1]),pythonExecutable=fs.realpathSync(args[3]),destination=path.resolve(args[5]);
assert(!fs.existsSync(destination),'Use a fresh output directory');assert(fs.statSync(path.dirname(destination)).isDirectory());
const output=path.join(destination,'runtime-receipt.json');
assert(!fs.existsSync(output));const artifacts=fs.realpathSync(path.join(root,'.artifacts'));
const enumValues=Object.fromEntries([...fs.readFileSync('experiments/embedded-js/native/hwe_embedded.h','utf8').matchAll(/#define (HWE_JS_\w+) INT32_C\((\d+)\)/g)].map(match=>[match[1],Number(match[2])]));
const report={schemaVersion:1,profile:'quickjs-ng-0.17.0-cstring-cleanup/v1',passed:false,engineQualified:false,deviceQualified:false,platform:process.platform,arch:process.arch,
 scope:'Source-pinned Windows native runtime with optional explicit idle collection and CString cleanup; package/engine qualification is separate.',rows:[]},raw={};
report.sources=Object.fromEntries(qualifiedRuntimeSources.map(file=>[file,sha256(fs.readFileSync(path.join(root,file)))]));
const evidence=path.join(root,'evidence/native-cstring-cleanup/native-followthrough');
const prior=JSON.parse(gunzipSync(fs.readFileSync(path.join(evidence,'r2.json.gz'))));
const capsule=fs.readFileSync(path.join(evidence,'inputs.json.gz'));
assert.equal(sha256(capsule),prior.capsuleSha256);report.capsuleSha256=sha256(capsule);
report.inputReceiptSha256=sha256(fs.readFileSync(path.join(evidence,'r2.json.gz')));
const archived=JSON.parse(gunzipSync(capsule));
assert.deepEqual(Object.keys(archived).sort(),['bundle.js','content.json','courses.json','entry.mjs']);
fs.mkdirSync(destination);
const work=fs.mkdtempSync(path.join(artifacts,'qualified-runtime-'));
try{
 for(const[file,body]of Object.entries(archived)){assert(!file.includes('/')&&!file.includes('\\'));fs.writeFileSync(path.join(work,file),body);}
 const course=JSON.parse(archived['courses.json']).flatMap(course=>course.rows);assert.equal(course.length,579);
 fs.writeFileSync(path.join(work,'requests.jsonl'),course.map(step=>JSON.stringify(step.request)).join('\n')+'\n');
 const prepared=prepareCStringCleanup(original,path.join(work,'patched'));report.patch=prepared;
 const managed=buildEmbeddedManagedConsumer(work);report.dotnetSdk=managed.sdk;
 raw.managedBuild=fs.readFileSync(managed.log,'utf8');
 for(const variant of ['original','patched']){
  const directory=path.join(work,variant+'-build');fs.mkdirSync(directory);
  const built=buildEmbeddedLibrary(directory,variant==='original'?original:prepared.directory);
  const record={variant,librarySha256:sha256(fs.readFileSync(built.library)),commands:built.commands,compiler:built.compilerBanner,consumers:[]};report.rows.push(record);
  raw[variant]={build:fs.readFileSync(path.join(directory,'build.txt'),'utf8')};
  for(const [name,command,prefix,env] of [['cpp',built.native,[],built.env],['dotnet','dotnet',[managed.dll],managed.env]]){
   const outfile=path.join(work,variant+'-'+name+'.jsonl');
   const result=spawnSync(command,[...prefix,built.library,path.join(work,'bundle.js'),path.join(work,'content.json'),path.join(work,'requests.jsonl'),outfile],
    {cwd:work,env:{...env,TEMP:work,TMP:work,TMPDIR:work},encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:8*1024*1024});
   raw[variant][name]={stdout:result.stdout,stderr:result.stderr,process:{status:result.status,signal:result.signal,error:result.error?.message??null}};
   assert.equal(result.status,0,result.stderr);assert(!result.error&&!result.signal);
   const stats=JSON.parse(result.stdout);assert(stats.passed&&stats.requests===579&&stats.liveBytesAfterDispose===0&&stats.liveBlocksAfterDispose===0);
   const replies=fs.readFileSync(outfile,'utf8');assert.deepEqual(replies.trim().split(/\r?\n/).map(line=>JSON.parse(line)),course.map(row=>row.reply));
   raw[variant][name].replies=replies;record.consumers.push({name,stats});console.log({variant,consumer:name,...stats});
  }
  const directoryProbe=path.join(work,variant+'-probe');fs.mkdirSync(directoryProbe);
  for(const[file,body]of Object.entries(archived))fs.writeFileSync(path.join(directoryProbe,file),body);
  const base=fs.readFileSync('scripts/probe-shared-account-native.py','utf8');
  let python="import ctypes as c,json,pathlib,sys\n"+"directory=pathlib.Path(sys.argv[1]);cfg=json.loads((directory/'input.json').read_text(encoding='utf-8'));dll=c.CDLL(cfg['dll'])\n"+base.slice(base.indexOf('class Options'));
  const needle="        row['failedMetrics']=metrics(host)";assert.equal(python.split(needle).length,2);
  python=python.replace(needle,needle+"\n        length=c.c_uint64(42)\n        row['retryStatus']=dll.hwe_js_submit_v1(host,b'{}',2,c.byref(length));row['retryLength']=length.value\n        written=c.c_uint64(42)\n        row['copyStatus']=dll.hwe_js_copy_response_v1(host,None,0,c.byref(written));row['copyWritten']=written.value\n        row['afterRejectedRetry']=metrics(host)");
  fs.writeFileSync(path.join(directoryProbe,'probe.py'),python);fs.writeFileSync(path.join(directoryProbe,'input.json'),JSON.stringify({dll:built.library}));
  const probe=spawnSync(pythonExecutable,['-I',path.join(directoryProbe,'probe.py'),directoryProbe],
   {cwd:work,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work},encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:8*1024*1024});
  raw[variant].lowMemory={python,stdout:probe.stdout,stderr:probe.stderr,status:probe.status,error:probe.error?.message??null,signal:probe.signal};
  assert.equal(probe.status,0,probe.stderr);assert(!probe.error&&!probe.signal);
  record.memory=JSON.parse(fs.readFileSync(path.join(directoryProbe,'result.json')));
  const [low,roomy]=record.memory.rows;assert.equal(low.heapMiB,32);assert.equal(roomy.heapMiB,48);
  assert.equal(low.error,"AssertionError(('submit', 4))");assert.equal(low.failedMetrics.poisoned,1);assert.equal(low.failedMetrics.pending,0);
  assert.equal(low.retryStatus,enumValues.HWE_JS_POISONED);assert.equal(low.retryLength,0);assert.equal(low.copyStatus,enumValues.HWE_JS_NO_RESPONSE);assert.equal(low.copyWritten,0);
  assert.deepEqual(low.afterRejectedRetry,low.failedMetrics);
  assert(roomy.coursePassed&&roomy.commands===579&&roomy.destroyStatus===0&&roomy.remainingBytes===0);
  if(variant==='original'){assert.equal(low.destroyStatus,11);assert(low.remainingBytes>0);}
  else{assert.equal(low.destroyStatus,0);assert.equal(low.remainingBytes,0);}
  console.log({variant,memory:record.memory.rows.map(row=>({heapMiB:row.heapMiB,passed:row.coursePassed??false,poisoned:row.failedMetrics?.poisoned,retryStatus:row.retryStatus,destroyStatus:row.destroyStatus,remainingBytes:row.remainingBytes}))});
  if(variant==='patched'){
   fs.copyFileSync(built.library,path.join(destination,'hwe_embedded.dll'));
   fs.copyFileSync(path.join(root,'experiments/embedded-js/native/hwe_embedded.h'),path.join(destination,'hwe_embedded.h'));
   report.files=Object.fromEntries(['hwe_embedded.dll','hwe_embedded.h'].map(file=>[file,sha256(fs.readFileSync(path.join(destination,file)))]));
   report.exports=built.exportedFunctions;
  }
 }
 report.passed=true;
}catch(error){report.failure=String(error);throw error;}
finally{
 try{
  report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(fs.readFileSync(path.join(root,file)))===hash);
  report.upstreamUnchanged=report.patch!==undefined&&Object.entries(report.patch.original).every(([file,hash])=>sha256(fs.readFileSync(path.join(original,file)))===hash);
  report.preparedUnchanged=report.patch!==undefined&&Object.entries(report.patch.files).every(([file,hash])=>sha256(fs.readFileSync(path.join(report.patch.directory,file)))===hash);
  raw.runner=fs.readFileSync(path.join(root,'experiments/embedded-js/patches/build-qualified-runtime.mjs'),'utf8');
  const packed=gzipSync(JSON.stringify(raw),{level:9});fs.writeFileSync(output+'.raw.json.gz',packed,{flag:'wx'});report.rawSha256=sha256(packed);
 }finally{
  assert.equal(path.dirname(fs.realpathSync(work)),artifacts);fs.rmSync(work,{recursive:true,force:true});report.cleaned=true;
  report.passed=report.passed&&report.inputsUnchanged&&report.upstreamUnchanged&&report.preparedUnchanged;
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 }
}
console.log({passed:report.passed,cleaned:report.cleaned});
