import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fork} from 'node:child_process';import {pathToFileURL} from 'node:url';import ts from 'typescript';
import {root,sha256,writeJSON,verifyReference} from './reference-utils.mjs';
import {statusDeliveryBenchmarkPlan as plan,checkStatusDeliveryBenchmark} from './status-delivery-benchmark-checks.mjs';
const args=process.argv.slice(2);assert(args.length===0||args.length===2&&args[0]==='--verification');
const proofFile=path.resolve(root,args[1]??'.artifacts/status-delivery-benchmark-verification.json'),proofBytes=fs.readFileSync(proofFile),proof=JSON.parse(proofBytes);
assert(proof.passed&&!proof.control&&proof.results.length===9);
const game=fs.realpathSync(proof.games.original);assert.equal(game,fs.realpathSync(path.join(root,'.reference')));
const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(game,lock);
const helperFile=path.join(root,'reference/benchmark-status-delivery-worker.ts'),helper=fs.readFileSync(helperFile,'utf8'),checksFile=path.join(root,'scripts/status-delivery-benchmark-checks.mjs'),checks=fs.readFileSync(checksFile),runner=fs.readFileSync(import.meta.filename);
assert.equal(sha256(helper),proof.helperSha256);assert.equal(sha256(checks),proof.checksSha256);
const expected={};
for(const workload of plan.workloads){const row=proof.results.find(r=>r.workload===workload&&r.population===8);assert(row);const bytes=fs.readFileSync(path.join(proof.directory,workload+'-8-audit.json'));assert.equal(sha256(bytes),row.auditSha256);expected[workload]=JSON.parse(bytes).original;checkStatusDeliveryBenchmark(expected[workload],workload,8,plan.auditCasts);}
const directory=fs.mkdtempSync(path.join(root,'.artifacts/status-delivery-benchmark-observer-')),results=[];
const faults=[
 ['no-native-status','siphon',"for(let i=1;i<actors.length;i++)actors[i].applyStatus(siphon?'burn':'impaled',12,1,'benchmark source',\n      {casterId:p.id,rupture:siphon?undefined:100,ruptureType:'physical'});",''],
 ['skipped-cast','siphon','w.executeSkill(p,inst,aim,options);roots++;','roots++;'],
 ['false-root-count','siphon','w.executeSkill(p,inst,aim,options);roots++;','w.executeSkill(p,inst,aim,options);roots+=2;'],
 ['missing-life-reset','siphon','actor.statuses.length=0;actor.life=9000;','actor.statuses.length=0;'],
 ['wrong-bank','recall-cached','rupture:siphon?undefined:100','rupture:siphon?undefined:50'],
 ['false-launch-count','recall-cached','launches+=lastSpears.length','launches+=1'],
 ['missing-tree','recall-tree',"if(tree)inst.treeNodes=['rending_extraction'];",''],
 ['missing-retirement','recall-tree',"if(!siphon){w['clearTreeFields'](p,inst);retired+=lastSpears.length-w.projectiles.length;}",''],
];
const variants=[...plan.workloads.map(workload=>({name:'control-'+workload,workload,source:helper,control:true})),...faults.map(([name,workload,needle,replacement])=>{assert.equal(helper.split(needle).length-1,1,name+' selector');return{name,workload,source:helper.replace(needle,replacement),control:false};})];
for(const{name,source}of variants)assert.equal(ts.createSourceFile(name+'.ts',source,ts.ScriptTarget.Latest,true).parseDiagnostics.length,0,name);

async function observe(name,workload,runtime){
 const log=path.join(directory,name+'.txt'),fd=fs.openSync(log,'wx');
 const child=fork(runtime,[],{cwd:game,execArgv:['--expose-gc','--import',pathToFileURL(path.join(game,'node_modules/tsx/dist/loader.mjs')).href],stdio:['ignore',fd,fd,'ipc'],windowsHide:true});fs.closeSync(fd);
 let next=1,readyResolve,readyReject;const pending=new Map(),ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
 const startup=setTimeout(()=>{readyReject(Error(name+' startup timeout'));child.kill();},180000);
 const fail=error=>{clearTimeout(startup);readyReject(error);for(const waiter of pending.values()){clearTimeout(waiter.timer);waiter.reject(error);}pending.clear();};
 child.on('error',fail);child.on('exit',(code,signal)=>fail(Error(name+' exited ('+code+', '+signal+')')));
 child.on('message',message=>{if(message.ready){clearTimeout(startup);readyResolve(message);return;}const waiter=pending.get(message.id);if(!waiter)return;pending.delete(message.id);clearTimeout(waiter.timer);message.ok?waiter.resolve(message.value):waiter.reject(Error(name+': '+message.error));});
 const request=(command,extra={})=>new Promise((resolve,reject)=>{const id=next++,timer=setTimeout(()=>{pending.delete(id);reject(Error(name+'/'+command+' timeout'));child.kill();},180000);pending.set(id,{resolve,reject,timer});child.send({id,command,...extra},error=>{if(error){pending.delete(id);clearTimeout(timer);reject(error);}});});
 try{await ready;await request('setup',{workload,population:8,seed:plan.seed});const value=await request('audit',{count:plan.auditCasts});await request('stop');return value;}
 finally{if(child.exitCode===null)child.kill();}
}
let passed=false;
try{
 for(const{name,workload,source,control}of variants){
  const runtime=path.join(directory,name+'.ts');fs.writeFileSync(runtime,source.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,(_all,_quote,file)=>JSON.stringify(pathToFileURL(path.join(game,'src',file+'.ts')).href)),{flag:'wx'});
  // Worker failures are failed controls, never successful fault detection.
  const actual=await observe(name,workload,runtime);writeJSON(path.join(directory,name+'.json'),actual);
  if(control){assert.deepEqual(actual,expected[workload]);checkStatusDeliveryBenchmark(actual,workload,8,plan.auditCasts);}
  else{assert.notDeepEqual(actual,expected[workload]);assert.throws(()=>checkStatusDeliveryBenchmark(actual,workload,8,plan.auditCasts),error=>error.code==='ERR_ASSERTION',name);}
  results.push({name,workload,detected:!control,helperSha256:sha256(source),observationsSha256:sha256(JSON.stringify(actual)),logSha256:sha256(fs.readFileSync(path.join(directory,name+'.txt')))});
  writeJSON(path.join(directory,'progress.json'),{directory,results});console.log({name,passed:true});
 }passed=true;
}finally{
 assert.equal(fs.readFileSync(helperFile,'utf8'),helper);assert(fs.readFileSync(checksFile).equals(checks));assert(fs.readFileSync(import.meta.filename).equals(runner));assert(fs.readFileSync(proofFile).equals(proofBytes));verifyReference(game,lock);
 const report={passed,directory,game,sourceUnchanged:true,benchmarkVerification:proofFile,benchmarkVerificationSha256:sha256(proofBytes),helperSha256:sha256(helper),checksSha256:sha256(checks),runnerSha256:sha256(runner),faults:results.filter(r=>r.detected).length,results};
 writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/status-delivery-benchmark-observer-verification.json',report);console.log({passed,directory,faults:report.faults});
}
