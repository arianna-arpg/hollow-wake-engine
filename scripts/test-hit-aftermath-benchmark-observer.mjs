import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fork} from 'node:child_process';import {pathToFileURL} from 'node:url';import ts from 'typescript';
import {root,sha256,writeJSON,verifyReference} from './reference-utils.mjs';
import {aftermathBenchmarkPlan as plan,checkAftermathBenchmark} from './hit-aftermath-benchmark-checks.mjs';
const args=process.argv.slice(2);assert(args.length===0||args.length===2&&args[0]==='--verification');
const proofFile=path.resolve(root,args[1]??'.artifacts/hit-aftermath-benchmark-verification.json'),proofBytes=fs.readFileSync(proofFile),proof=JSON.parse(proofBytes);
assert(proof.passed&&!proof.control&&proof.results.length===12);
const game=fs.realpathSync(proof.games.original);assert.equal(game,fs.realpathSync(path.join(root,'.reference')));
const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(game,lock);
const helperFile=path.join(root,'reference/benchmark-hit-aftermath-worker.ts'),helper=fs.readFileSync(helperFile,'utf8'),checksFile=path.join(root,'scripts/hit-aftermath-benchmark-checks.mjs'),checks=fs.readFileSync(checksFile),runner=fs.readFileSync(import.meta.filename);
assert.equal(sha256(helper),proof.helperSha256);assert.equal(sha256(checks),proof.checksSha256);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/hit-aftermath-benchmark-observer-')),results=[];
const row=proof.results.find(r=>r.workload==='combined'&&r.population===8);assert(row);
const auditFile=path.join(proof.directory,'combined-8-audit.json'),auditBytes=fs.readFileSync(auditFile);assert.equal(sha256(auditBytes),row.auditSha256);
const expected=JSON.parse(auditBytes).original;checkAftermathBenchmark(expected,'combined',8,plan.auditHits,true);
const faults=[
 ['inactive-sharing','i===1&&sharing?.5:0','0'],
 ['inactive-spread','spreadOnHit:{chance:1','spreadOnHit:{chance:0'],
 ['inactive-splash','i===0&&splash?60:0','0'],
 ['false-root-count',"w['resolveHit'](p,inst,target,1,0);roots++;","w['resolveHit'](p,inst,target,1,0);roots+=2;"],
 ['skipped-hit',"w['resolveHit'](p,inst,target,1,0);roots++;",'roots++;'],
 ['missing-status-reset','if(i>=2)actors[i].statuses.length=0;',''],
];
const variants=[{name:'control',source:helper},...faults.map(([name,needle,replacement])=>{assert.equal(helper.split(needle).length-1,1,name+' selector');return{name,source:helper.replace(needle,replacement)};})];
for(const {name,source}of variants)assert.equal(ts.createSourceFile(name+'.ts',source,ts.ScriptTarget.Latest,true).parseDiagnostics.length,0,name);

async function observe(name,runtime) {
 const log=path.join(directory,name+'.txt'),fd=fs.openSync(log,'wx');
 const child=fork(runtime,[],{cwd:game,execArgv:['--expose-gc','--import',pathToFileURL(path.join(game,'node_modules/tsx/dist/loader.mjs')).href],stdio:['ignore',fd,fd,'ipc'],windowsHide:true});fs.closeSync(fd);
 let next=1,readyResolve,readyReject;const pending=new Map(),ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
 const startup=setTimeout(()=>{readyReject(Error(name+' startup timeout'));child.kill();},180000);
 const fail=error=>{clearTimeout(startup);readyReject(error);for(const waiter of pending.values()){clearTimeout(waiter.timer);waiter.reject(error);}pending.clear();};
 child.on('error',fail);child.on('exit',(code,signal)=>fail(Error(name+' exited ('+code+', '+signal+')')));
 child.on('message',m=>{if(m.ready){clearTimeout(startup);readyResolve(m);return;}const waiter=pending.get(m.id);if(!waiter)return;pending.delete(m.id);clearTimeout(waiter.timer);m.ok?waiter.resolve(m.value):waiter.reject(Error(name+': '+m.error));});
 const request=(command,extra={})=>new Promise((resolve,reject)=>{const id=next++,timer=setTimeout(()=>{pending.delete(id);reject(Error(name+'/'+command+' timeout'));child.kill();},180000);pending.set(id,{resolve,reject,timer});child.send({id,command,...extra},error=>{if(error){pending.delete(id);clearTimeout(timer);reject(error);}});});
 try{await ready;await request('setup',{workload:'combined',population:8,seed:plan.seed});const value=await request('audit',{count:plan.auditHits});await request('stop');return value;}
 finally{if(child.exitCode===null)child.kill();}
}
let passed=false;
try {
 for(const {name,source}of variants) {
  const runtime=path.join(directory,name+'.ts');fs.writeFileSync(runtime,source.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,(_a,_q,f)=>JSON.stringify(pathToFileURL(path.join(game,'src',f+'.ts')).href)),{flag:'wx'});
  // A worker error or timeout is a failed control, never evidence of detection.
  const actual=await observe(name,runtime);writeJSON(path.join(directory,name+'.json'),actual);
  if(name==='control'){assert.deepEqual(actual,expected);checkAftermathBenchmark(actual,'combined',8,plan.auditHits,true);}
  else {assert.notDeepEqual(actual,expected);assert.throws(()=>checkAftermathBenchmark(actual,'combined',8,plan.auditHits,true),e=>e.code==='ERR_ASSERTION',name);}
  results.push({name,detected:name!=='control',helperSha256:sha256(source),observationsSha256:sha256(JSON.stringify(actual)),logSha256:sha256(fs.readFileSync(path.join(directory,name+'.txt')))});
  writeJSON(path.join(directory,'progress.json'),{directory,results});console.log({name,passed:true});
 }
 passed=true;
}finally {
 assert.equal(fs.readFileSync(helperFile,'utf8'),helper);assert(fs.readFileSync(checksFile).equals(checks));assert(fs.readFileSync(import.meta.filename).equals(runner));assert(fs.readFileSync(proofFile).equals(proofBytes));verifyReference(game,lock);
 const report={passed,directory,game,sourceUnchanged:true,benchmarkVerification:proofFile,benchmarkVerificationSha256:sha256(proofBytes),helperSha256:sha256(helper),checksSha256:sha256(checks),runnerSha256:sha256(runner),faults:results.filter(r=>r.detected).length,results};
 writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/hit-aftermath-benchmark-observer-verification.json',report);console.log({passed,directory,faults:report.faults});
}
