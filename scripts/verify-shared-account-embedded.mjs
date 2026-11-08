import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync,spawnSync} from 'node:child_process';
import vm from 'node:vm';import {gzipSync,gunzipSync} from 'node:zlib';import {build} from 'esbuild';
import {root,sha256,listFiles} from './reference-utils.mjs';import {verifyQualifiedRuntime} from '../experiments/embedded-js/patches/verify-qualified-runtime.mjs';
import {preparedCourse} from '../test/shared-account/prepared-course.mjs';
const args=process.argv.slice(2);assert.deepEqual([args[0],args[2],args[4]],['--runtime','--python','--output']);assert.equal(args.length,6);
const runtime=fs.realpathSync(args[1]),python=fs.realpathSync(args[3]),out=path.resolve(args[5]);assert(!fs.existsSync(out));
const native=verifyQualifiedRuntime(runtime),artifacts=fs.realpathSync(path.join(root,'.artifacts'));
const work=fs.mkdtempSync(path.join(artifacts,'shared-embedded-')),report={passed:false,engineQualified:false,deviceQualified:false,nativeSha256:native.files['hwe_embedded.dll']},raw={};
const sources=['scripts/verify-shared-account-embedded.mjs','test/shared-account/native-course.py','test/shared-account/prepared-course.mjs','adapters/embedded/account-workshop-session.mjs',
 'package.json','package-lock.json','tsconfig.json',...listFiles(path.join(root,'src')).map(file=>'src/'+file)];
report.sources=Object.fromEntries(sources.map(file=>[file,sha256(fs.readFileSync(path.join(root,file)))]));
fs.mkdirSync(out);
try{
 const buildDir=path.join(work,'source');fs.mkdirSync(buildDir);
 for(const file of ['src','package.json','tsconfig.json'])fs.cpSync(path.join(root,file),path.join(buildDir,file),{recursive:true});
 const env={...process.env,TEMP:work,TMP:work,TMPDIR:work};
 execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(buildDir,'tsconfig.json')],{cwd:work,env,windowsHide:true,stdio:'pipe',timeout:120000});
 const manifest=JSON.parse(fs.readFileSync(path.join(buildDir,'package.json'))),alias={};
 for(const[key,value]of Object.entries(manifest.exports)){const file=typeof value==='string'?value:value.import;if(file?.endsWith('.js'))alias['@hollow-wake/engine'+key.slice(1)]=path.join(buildDir,file);}
 const compiled=await build({entryPoints:[path.join(root,'adapters/embedded/account-workshop-session.mjs')],bundle:true,format:'iife',globalName:'HollowWakeSession',
  platform:'neutral',target:'es2022',minify:true,write:false,metafile:true,tsconfigRaw:{},alias});
 assert(Object.values(compiled.metafile.outputs).every(row=>!row.imports.length));
 const capsule=fs.readFileSync(path.join(root,'evidence/native-cstring-cleanup/native-followthrough/inputs.json.gz'));
 assert.equal(sha256(capsule),'fc87b365317f8ec26d6d3cfd5c69a9f8731fbe64d4f0bb3f4692be9c6fb6d6b7');
 const frozen=JSON.parse(gunzipSync(capsule));report.frozenCapsuleSha256=sha256(capsule);
 const command=(bundle)=>{
  const context=vm.createContext({input:frozen['content.json']});
  vm.runInContext(bundle,context,{timeout:30000});vm.runInContext('var owner=HollowWakeSession.create(JSON.parse(input));',context,{timeout:30000});
  const script=new vm.Script('JSON.stringify(HollowWakeSession.dispatch(owner,JSON.parse(input)))');
  return request=>{context.input=JSON.stringify(request);return JSON.parse(script.runInContext(context,{timeout:30000}));};
 };
 const opening=JSON.parse(frozen['courses.json'])[0].rows.slice(0,2);
 const candidate=command(compiled.outputFiles[0].text),serial=command(frozen['bundle.js']);
 const prepared=[false,true].map((text,index)=>preparedCourse(candidate,serial,opening,text,1+index*2));
 fs.writeFileSync(path.join(work,'prepared.json'),JSON.stringify(prepared));
 // Keep the six authored packs and 579 original commands identical. Only the
 // entry factory/binding changes. The consumed table remains in this capsule.
 fs.writeFileSync(path.join(work,'bundle.js'),compiled.outputFiles[0].contents);
 for(const name of ['content.json','courses.json'])fs.writeFileSync(path.join(work,name),frozen[name]);
 const inputs=Object.fromEntries(['bundle.js','content.json','courses.json','prepared.json'].map(file=>[file,fs.readFileSync(path.join(work,file),'utf8')]));
 report.inputs=Object.fromEntries(Object.entries(inputs).map(([file,text])=>[file,{sha256:sha256(text),bytes:Buffer.byteLength(text)}]));
 const packed=gzipSync(JSON.stringify(inputs),{level:9});fs.writeFileSync(path.join(out,'inputs.json.gz'),packed,{flag:'wx'});report.inputsSha256=sha256(packed);
 fs.writeFileSync(path.join(work,'input.json'),JSON.stringify({library:path.join(runtime,'hwe_embedded.dll'),nativeSha256:report.nativeSha256}));
 const result=spawnSync(python,['-I','-B',path.join(root,'test/shared-account/native-course.py'),work],{cwd:root,env,windowsHide:true,encoding:'utf8',timeout:600000,maxBuffer:1024*1024});
 raw.process={status:result.status,signal:result.signal,error:result.error?.message??null};raw.stdout=result.stdout;raw.stderr=result.stderr;
 if(fs.existsSync(path.join(work,'native-result.json')))report.observed=JSON.parse(fs.readFileSync(path.join(work,'native-result.json')));
 assert.equal(result.status,0,result.stderr);assert(!result.error&&!result.signal);
 assert.equal(report.observed.steps,579);assert(report.observed.rows.every(row=>!row.created||row.disposed));
 assert(report.observed.rows.find(row=>row.heapMiB===48).coursePassed,'Roomy control must complete');
 assert.equal(report.observed.preparedSteps,prepared.reduce((sum,course)=>sum+course.rows.length,0));
 assert(report.observed.rows.find(row=>row.heapMiB===48).preparedPassed,'Roomy prepared control must complete');
 verifyQualifiedRuntime(runtime);report.passed=true;
}catch(error){report.failure=String(error);throw error;}
finally{
 try{
  report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(fs.readFileSync(path.join(root,file)))===hash);
  const bytes=gzipSync(JSON.stringify(raw),{level:9});fs.writeFileSync(path.join(out,'raw.json.gz'),bytes,{flag:'wx'});report.rawSha256=sha256(bytes);
 }finally{
  assert.equal(path.dirname(fs.realpathSync(work)),artifacts);fs.rmSync(work,{recursive:true,force:true,maxRetries:40,retryDelay:250});report.cleaned=true;
  report.passed=report.passed&&report.inputsUnchanged;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 }
}
console.log({passed:report.passed,scope:'Native memory/correctness investigation; engine and device qualification are separate',rows:report.observed.rows.map(row=>({heapMiB:row.heapMiB,policy:row.policy,loops:row.loops,commands:row.commands,passed:row.coursePassed,peak:row.tracked?.peak_bytes,remaining:row.remainingBytes}))});
