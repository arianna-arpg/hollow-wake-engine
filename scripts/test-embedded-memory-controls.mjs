import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync,spawnSync} from 'node:child_process';
import {root,listFiles,sha256,writeJSON} from './reference-utils.mjs';import {nativeEnvironment} from './native-tools.mjs';
import {verifyEmbeddedHostCase} from './embedded-host-case.mjs';
const latest=JSON.parse(fs.readFileSync('.artifacts/embedded-host-latest.json')),control=JSON.parse(fs.readFileSync(latest.receipt)),controlDirectory=fs.realpathSync(latest.directory);assert(control.passed&&control.runtimeCycles===24);
assert(controlDirectory.startsWith(path.join(root,'.artifacts')+path.sep));assert.equal(path.resolve(latest.receipt),path.join(controlDirectory,'verification.json'));
const sourceFile=path.join(root,'experiments/embedded-js/host.c'),source=fs.readFileSync(sourceFile,'utf8');assert.equal(sha256(source),control.hostSourceSha256);
const snapshot=()=>Object.fromEntries(listFiles('dist').map(f=>[f,sha256(fs.readFileSync(path.join('dist',f)))])),before=snapshot();assert.equal(sha256(JSON.stringify(before)),control.runtimeMapSha256);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/memory-probe-faults-')),env=nativeEnvironment(directory),suffix=process.platform==='win32'?'.obj':'.o',binarySuffix=process.platform==='win32'?'.exe':'';
const oldOwn=path.join(controlDirectory,'host'+suffix),oldBinary=path.join(controlDirectory,'host'+binarySuffix),upstreamObject=path.join(controlDirectory,'quickjs-amalgam'+suffix),upstreamBefore=sha256(fs.readFileSync(upstreamObject));
const evaluation='evaluated = JS_Eval(context, bundle, bundle_size, "sdk-bundle.js", JS_EVAL_TYPE_GLOBAL);';
const results=[];
for(const[name,needle,replacement,mode]of [
 ['disabled-limit','heap.limit = 1024 * 1024;','heap.limit = 256 * 1024 * 1024;','memory'],
 ['wrong-exception','void *probe = js_malloc(context, allocation_probe_bytes);','void *probe = NULL; JS_ThrowSyntaxError(context, "deliberate non-memory failure");','memory'],
 ['wrong-stage',evaluation,'if (strcmp(mode, "load-memory")) '+evaluation,'load-memory'],
]){
 assert.equal(source.split(needle).length-1,1,name);const dir=path.join(directory,name);fs.mkdirSync(dir);const file=path.join(dir,'host.c'),own=path.join(dir,'host'+suffix),binary=path.join(dir,'host'+binarySuffix);
 const mutated=source.replace(needle,replacement).replace('#include "host-support.h"','#include '+JSON.stringify(path.join(root,'experiments/embedded-js/host-support.h').replaceAll('\\','/')));fs.writeFileSync(file,mutated,{flag:'wx'});
 const commands=[control.buildCommands[0],control.buildCommands[2]].map(c=>({command:c.command,args:c.args.map(a=>a===sourceFile?file:a.replaceAll(oldOwn,own).replaceAll(oldBinary,binary))}));
 const buildLog=fs.openSync(path.join(dir,'build.txt'),'wx');try{for(const c of commands)execFileSync(c.command,c.args,{cwd:dir,env,stdio:['ignore',buildLog,buildLog],timeout:180000,windowsHide:true});}finally{fs.closeSync(buildLog);}writeJSON(path.join(dir,'commands.json'),commands);
 const run=spawnSync(binary,[path.join(controlDirectory,'bundle.js'),path.join(controlDirectory,'input.json'),mode],{cwd:dir,env,encoding:'utf8',timeout:60000,windowsHide:true});assert(!run.error);assert.equal(run.signal,null);assert.equal(run.stdout,'');fs.writeFileSync(path.join(dir,'stderr.txt'),run.stderr);
 const stats=run.stderr.trim().split(/\r?\n/).filter(x=>x.startsWith('{')).map(JSON.parse);assert(stats.length>0);assert(stats.every(s=>s.liveRequestedBytesAfterDispose===0&&s.liveBlocksAfterDispose===0));
 if(name==='disabled-limit'){assert.equal(run.status,4);assert.equal(stats.length,1);}
 else if(name==='wrong-exception'){assert.equal(run.status,2);assert.equal(stats.length,3);assert.match(run.stderr,/SyntaxError: deliberate non-memory failure/);}
 else {assert.equal(run.status,2);assert.equal(stats.length,3);assert(stats.every(s=>s.phase==='input'));}
 assert.throws(()=>verifyEmbeddedHostCase({mode,exitCode:run.status,stderr:run.stderr,stdout:run.stdout}),{code:'ERR_ASSERTION'});
 results.push({name,detected:true,exitCode:run.status,stats,mutatedSourceSha256:sha256(mutated)});
}
assert.equal(fs.readFileSync(sourceFile,'utf8'),source);assert.deepEqual(snapshot(),before);assert.equal(sha256(fs.readFileSync(upstreamObject)),upstreamBefore);
const report={passed:true,directory,control:latest.receipt,hostSourceSha256:sha256(source),verifierSha256:sha256(fs.readFileSync(path.join(root,'scripts/embedded-host-case.mjs'))),runtimeMapSha256:control.runtimeMapSha256,results,inputsUnchanged:true};writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/memory-probe-fault-verification.json',report);console.log({passed:true,directory,faults:results.length});
