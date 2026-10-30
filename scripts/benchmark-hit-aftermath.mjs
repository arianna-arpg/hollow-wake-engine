import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {fork,execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {root,listFiles,sha256,writeJSON,verifyReference} from './reference-utils.mjs';
import {aftermathBenchmarkPlan as plan,checkAftermathBenchmark,aftermathBatchSize} from './hit-aftermath-benchmark-checks.mjs';

const args=process.argv.slice(2);
assert(args.length>=4&&args[0]==='--previous'&&args[2]==='--location');
const flags=new Set(args.slice(4));assert.equal(flags.size,args.length-4);
assert([...flags].every(f=>['--control','--verify-only'].includes(f)));
const control=flags.has('--control'),verifyOnly=flags.has('--verify-only');
const read=f=>JSON.parse(fs.readFileSync(f));
const current=read(path.resolve(root,args[3])),previous=read(path.resolve(root,args[1]));
const games=Object.fromEntries(Object.entries({original:control?current.game:path.join(root,'.reference'),previous:control?current.game:previous.game,current:current.game}).map(([name,p])=>[name,fs.realpathSync(p)]));
verifyReference(path.join(root,'.reference'),read(path.join(root,'baseline/source-lock.json')));
const snapshot=d=>Object.fromEntries(listFiles(d).map(f=>[f,sha256(fs.readFileSync(path.join(d,f)))]));
const snapshots=()=>Object.fromEntries(Object.entries(games).map(([name,game])=>[name,{source:snapshot(path.join(game,'src')),package:name==='original'&&!control?null:snapshot(fs.realpathSync(path.join(game,'node_modules/@hollow-wake/engine')))}]));
assert.deepEqual(snapshot(path.join(games.current,'node_modules/@hollow-wake/engine/dist')),snapshot(path.join(root,'dist')));
const before=snapshots(),helperPath=path.join(root,'reference/benchmark-hit-aftermath-worker.ts'),helper=fs.readFileSync(helperPath,'utf8');
const runnerBefore=fs.readFileSync(import.meta.filename),checksPath=path.join(root,'scripts/hit-aftermath-benchmark-checks.mjs'),checksBefore=fs.readFileSync(checksPath);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/hit-aftermath-benchmark-'));
writeJSON(path.join(directory,'plan.json'),{...plan,control,verifyOnly});
writeJSON('.artifacts/hit-aftermath-benchmark-latest.json',{directory});
const workers={},results=[],typedGames=new Set();let passed=false;

function worker(name,game,runtime) {
  const fd=fs.openSync(path.join(directory,name+'.txt'),'wx');
  const child=fork(runtime,[],{cwd:game,execArgv:['--expose-gc','--import',pathToFileURL(path.join(game,'node_modules/tsx/dist/loader.mjs')).href],stdio:['ignore',fd,fd,'ipc'],windowsHide:true});fs.closeSync(fd);
  let next=1,readyResolve,readyReject;const pending=new Map(),ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  const timer=setTimeout(()=>{readyReject(Error(name+' startup timed out'));child.kill();},180000);
  child.on('message',message=>{
    if(message.ready){clearTimeout(timer);readyResolve(message);return;}
    const waiter=pending.get(message.id);if(!waiter)return;pending.delete(message.id);clearTimeout(waiter.timer);
    message.ok?waiter.resolve(message.value):waiter.reject(Error(name+': '+message.error));
  });
  const fail=e=>{clearTimeout(timer);readyReject(e);for(const w of pending.values()){clearTimeout(w.timer);w.reject(e);}pending.clear();};
  child.on('error',fail);child.on('exit',(code,signal)=>fail(Error(`Worker ${name} exited (${code}, ${signal})`)));
  return {child,ready,request(command,extra={}){return new Promise((resolve,reject)=>{
    const id=next++,timer=setTimeout(()=>{pending.delete(id);reject(Error(name+'/'+command+' timed out'));child.kill();},180000);
    pending.set(id,{resolve,reject,timer});child.send({id,command,...extra},e=>{if(e){pending.delete(id);clearTimeout(timer);reject(e);}});
  });}};
}
const median=values=>{const v=[...values].sort((a,b)=>a-b),i=Math.floor(v.length/2);return v.length%2?v[i]:(v[i-1]+v[i])/2;};
try {
  for(const[name,game]of Object.entries(games)) {
    const runtime=path.join(directory,name+'.ts'),typed=path.join(directory,name+'.typed.ts');
    fs.writeFileSync(runtime,helper.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,(_a,_q,f)=>JSON.stringify(pathToFileURL(path.join(game,'src',f+'.ts')).href)));
    fs.writeFileSync(typed,helper.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,(_a,_q,f)=>JSON.stringify(path.relative(directory,path.join(game,'src',f)).replaceAll('\\','/'))));
    const config=path.join(directory,name+'-types.json');writeJSON(config,{extends:path.join(game,'tsconfig.sim.json'),compilerOptions:{typeRoots:[path.join(game,'node_modules/@types')]},include:[typed],exclude:[]});
    if(!typedGames.has(game)) {
      const fd=fs.openSync(path.join(directory,name+'-types.txt'),'wx');
      try{execFileSync(process.execPath,[path.join(game,'node_modules/typescript/bin/tsc'),'-p',config],{cwd:game,stdio:['ignore',fd,fd],timeout:180000,windowsHide:true});}finally{fs.closeSync(fd);}
      typedGames.add(game);
    }
    workers[name]=worker(name,game,runtime);await workers[name].ready;
  }
  for(const population of plan.populations)for(const workload of plan.workloads) {
    const batchSize=aftermathBatchSize(workload,population),warmup=Math.max(200,batchSize);
    const spec={workload,population,seed:plan.seed},audit={};
    for(const[name,w]of Object.entries(workers)) {
      await w.request('setup',spec);audit[name]=await w.request('audit',{count:plan.auditHits});
      checkAftermathBenchmark(audit[name],workload,population,plan.auditHits,true);
    }
    assert.deepEqual(audit.previous,audit.original,'Predecessor audit '+workload+'/'+population);
    assert.deepEqual(audit.current,audit.original,'Current audit '+workload+'/'+population);
    const auditPath=path.join(directory,workload+'-'+population+'-audit.json');writeJSON(auditPath,audit);
    const rounds=[],retained={};
    if(!verifyOnly) {
      for(const w of Object.values(workers)){await w.request('setup',spec);await w.request('warmup',{count:warmup});await w.request('begin');}
      for(let round=0;round<plan.rounds;round++) {
        const order=plan.order[round%plan.order.length],observed={},row={round,order};
        for(const name of order) {
          const value=await workers[name].request('batch',{count:batchSize});
          assert(Number.isFinite(value.elapsedMs)&&value.elapsedMs>0,'Invalid measured interval');
          checkAftermathBenchmark(value.check,workload,population,batchSize);
          assert.equal(value.check.draws,audit[name].draws/plan.auditHits*batchSize,'batch random schedule differs from audit');
          observed[name]=value.check;
          row[name]={elapsedMs:value.elapsedMs,count:value.count,checkSha256:sha256(JSON.stringify(value.check)),roots:value.check.roots,draws:value.check.draws,hits:value.check.hits.reduce((n,h)=>n+h.count,0),damage:value.check.hits.reduce((n,h)=>n+h.damage,0)};
        }
        assert.deepEqual(observed.previous,observed.original,'Predecessor batch '+workload+'/'+population+'/'+round);
        assert.deepEqual(observed.current,observed.original,'Current batch '+workload+'/'+population+'/'+round);
        row.currentOverPrevious=row.current.elapsedMs/row.previous.elapsedMs;row.currentOverOriginal=row.current.elapsedMs/row.original.elapsedMs;rounds.push(row);
        if(round===plan.rounds-1)writeJSON(path.join(directory,workload+'-'+population+'-last.json'),observed);
      }
      for(const[name,w]of Object.entries(workers))retained[name]=await w.request('finish');
    }
    const result={workload,population,batchSize,warmup,auditSha256:sha256(fs.readFileSync(auditPath)),rounds,retained,
      ...(rounds.length?{medianCurrentOverPrevious:median(rounds.map(r=>r.currentOverPrevious)),medianCurrentOverOriginal:median(rounds.map(r=>r.currentOverOriginal)),currentLowerThanPrevious:rounds.filter(r=>r.currentOverPrevious<1).length,medianMs:Object.fromEntries(Object.keys(workers).map(name=>[name,median(rounds.map(r=>r[name].elapsedMs))]))}:{})};
    results.push(result);writeJSON(path.join(directory,'progress.json'),{directory,results});
    console.log({workload,population,verified:true,...(rounds.length?{currentOverPrevious:result.medianCurrentOverPrevious,currentOverOriginal:result.medianCurrentOverOriginal}:{})});
  }
  for(const w of Object.values(workers))await w.request('stop');
  passed=true;
}finally {
  for(const w of Object.values(workers))if(w.child.exitCode===null)w.child.kill();
  assert.deepEqual(snapshots(),before);assert.equal(fs.readFileSync(helperPath,'utf8'),helper);
  assert(fs.readFileSync(import.meta.filename).equals(runnerBefore),'runner changed during measurement');
  assert(fs.readFileSync(checksPath).equals(checksBefore),'checks changed during measurement');
  verifyReference(path.join(root,'.reference'),read(path.join(root,'baseline/source-lock.json')));
  const report={passed,directory,games,control,verifyOnly,plan,helperSha256:sha256(helper),checksSha256:sha256(checksBefore),runnerSha256:sha256(runnerBefore),typedGames:[...typedGames],
    inputs:Object.fromEntries(Object.entries(before).map(([name,s])=>[name,{source:sha256(JSON.stringify(s.source)),package:s.package?sha256(JSON.stringify(s.package)):null}])),inputsUnchanged:true,
    hardware:{node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length},results,performanceAcceptance:false};
  writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/hit-aftermath-benchmark-verification.json',report);console.log({passed,directory,cases:results.length});
}
