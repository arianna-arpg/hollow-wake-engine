import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {fork,execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {root,listFiles,sha256,writeJSON} from './reference-utils.mjs';
const args=process.argv.slice(2);assert(args.length===4&&args[0]==='--previous'&&args[2]==='--location');
const locations=Object.fromEntries([['previous',args[1]],['current',args[3]]].map(([name,file])=>[name,JSON.parse(fs.readFileSync(path.resolve(root,file)))]));
const games=Object.fromEntries(Object.entries(locations).map(([name,location])=>[name,fs.realpathSync(location.game)]));
const snapshot=d=>Object.fromEntries(listFiles(d).map(f=>[f,sha256(fs.readFileSync(path.join(d,f)))]));
const snapshots=()=>Object.fromEntries(Object.entries(games).map(([name,game])=>[name,{source:snapshot(path.join(game,'src')),package:snapshot(fs.realpathSync(path.join(game,'node_modules/@hollow-wake/engine')))}]));
const before=snapshots(),directory=fs.mkdtempSync(path.join(root,'.artifacts/hit-paired-benchmark-')),helper=fs.readFileSync(path.join(root,'reference/benchmark-hit-worker.ts'),'utf8');
const plan={schemaVersion:1,seed:0x51a8,workloads:['plain','authored','stat','rider','impale'],warmup:1500,batch:1000,pairs:12,order:'Previous/current on even pairs, current/previous on odd pairs; workers idle between commands.',scope:'Warm whole resolver with equal resets and rider setup. Each worker has its own process, world and random state. Timing excludes IPC, cross-worker comparisons and forced GC; the existing per-hit alive assertion remains inside both paths. Retained heap is not allocation volume. Desktop observations are not device acceptance.'};
writeJSON(path.join(directory,'plan.json'),plan);
const workers={},results=[],controls=[];let passed=false;
function worker(name,game,runtime){
  const fd=fs.openSync(path.join(directory,name+'.txt'),'wx'),child=fork(runtime,[],{cwd:game,execArgv:['--expose-gc','--import',pathToFileURL(path.join(game,'node_modules/tsx/dist/loader.mjs')).href],stdio:['ignore',fd,fd,'ipc'],windowsHide:true});fs.closeSync(fd);
  let next=1;const pending=new Map();let readyResolve,readyReject;const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  const timer=setTimeout(()=>{readyReject(Error('Worker startup timed out: '+name));child.kill();},180000);
  child.on('message',message=>{if(message.ready){clearTimeout(timer);readyResolve(message);return;}const waiter=pending.get(message.id);if(!waiter)return;pending.delete(message.id);clearTimeout(waiter.timer);message.ok?waiter.resolve(message.value):waiter.reject(Error(name+': '+message.error));});
  const fail=error=>{clearTimeout(timer);readyReject(error);for(const waiter of pending.values()){clearTimeout(waiter.timer);waiter.reject(error);}pending.clear();};
  child.on('error',fail);child.on('exit',(code,signal)=>fail(Error(`Worker ${name} exited (${code}, ${signal})`)));
  return {child,ready,request(command,extra={}){return new Promise((resolve,reject)=>{const id=next++,timer=setTimeout(()=>{pending.delete(id);reject(Error('Worker command timed out: '+name+'/'+command));child.kill();},180000);pending.set(id,{resolve,reject,timer});child.send({id,command,...extra},error=>{if(error){pending.delete(id);clearTimeout(timer);reject(error);}});});}};
}
try {
  for(const[name,game]of Object.entries(games)){
    const runtime=path.join(directory,name+'.ts'),typed=path.join(directory,name+'.typed.ts');
    fs.writeFileSync(runtime,helper.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,(_a,_q,f)=>JSON.stringify(pathToFileURL(path.join(game,'src',f+'.ts')).href)));
    fs.writeFileSync(typed,helper.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,(_a,_q,f)=>JSON.stringify(path.relative(directory,path.join(game,'src',f)).replaceAll('\\','/'))));
    const config=path.join(directory,name+'-types.json');writeJSON(config,{extends:path.join(game,'tsconfig.sim.json'),compilerOptions:{typeRoots:[path.join(game,'node_modules/@types')]},include:[typed],exclude:[]});
    const fd=fs.openSync(path.join(directory,name+'-types.txt'),'wx');try{execFileSync(process.execPath,[path.join(game,'node_modules/typescript/bin/tsc'),'-p',config],{cwd:game,stdio:['ignore',fd,fd],timeout:180000,windowsHide:true});}finally{fs.closeSync(fd);}
    workers[name]=worker(name,game,runtime);await workers[name].ready;
  }
  for(const workload of plan.workloads){
    for(const w of Object.values(workers))await w.request('setup',{workload,seed:plan.seed});
    for(const w of Object.values(workers))await w.request('warmup',{count:plan.warmup});
    for(const w of Object.values(workers))await w.request('begin');
    const pairs=[];
    for(let round=0;round<plan.pairs;round++){
      const order=round%2?['current','previous']:['previous','current'],pair={round,order};
      for(const name of order)pair[name]=await workers[name].request('batch',{count:plan.batch});
      assert.deepEqual(pair.current.check,pair.previous.check,'Behavior changed: '+workload+'/'+round);pair.ratio=pair.current.elapsedMs/pair.previous.elapsedMs;pairs.push(pair);
    }
    const retained={};for(const[name,w]of Object.entries(workers))retained[name]=await w.request('finish');
    const sorted=pairs.map(p=>p.ratio).sort((a,b)=>a-b),median=(sorted[5]+sorted[6])/2;
    results.push({workload,pairs,retained,medianPairedRatio:median,range:[sorted[0],sorted.at(-1)],currentLower:pairs.filter(p=>p.ratio<1).length});
    writeJSON(path.join(directory,'progress.json'),{directory,results});console.log({workload,medianPairedRatio:median,currentLower:results.at(-1).currentLower,pairs:plan.pairs});
  }
  for(const w of Object.values(workers))await w.request('stop');
  // Independent harness check after timing: the established whole-hit helper
  // must reach the same damage, draw count and final state at the same hit count.
  const legacyHelper=fs.readFileSync(path.join(root,'reference/benchmark-hit-status.ts'),'utf8'),legacyPlan=path.join(directory,'legacy-plan.json');
  writeJSON(legacyPlan,{...plan,samples:plan.pairs});
  for(const[name,game]of Object.entries(games)){
    const runtime=path.join(directory,'legacy-'+name+'.ts'),out=path.join(directory,'legacy-'+name+'.json');
    fs.writeFileSync(runtime,legacyHelper.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,(_a,_q,f)=>JSON.stringify(pathToFileURL(path.join(game,'src',f+'.ts')).href)));
    const fd=fs.openSync(path.join(directory,'legacy-'+name+'.txt'),'wx');try{execFileSync(process.execPath,['--expose-gc','--import',pathToFileURL(path.join(game,'node_modules/tsx/dist/loader.mjs')).href,runtime,out,legacyPlan],{cwd:game,stdio:['ignore',fd,fd],timeout:180000,windowsHide:true});}finally{fs.closeSync(fd);}
    const legacy=JSON.parse(fs.readFileSync(out));for(const result of results){const expected=legacy.results.find(r=>r.name===result.workload).check,actual=result.pairs.at(-1)[name].check;
      const summed=result.pairs.reduce((sum,p)=>sum+p[name].check.damageSum,0);assert(Math.abs(summed-expected.damageSum)<=1e-9*Math.max(1,Math.abs(expected.damageSum)),name+'/'+result.workload+' damage');
      const{damageSum:_expected,...expectedState}=expected,{damageSum:_actual,...actualState}=actual;assert.deepEqual(actualState,expectedState,name+'/'+result.workload+' state');}
    controls.push({name,passed:true,helperSha256:sha256(legacyHelper),outputSha256:sha256(fs.readFileSync(out))});
  }
  passed=true;
}finally{
  for(const w of Object.values(workers))if(w.child.exitCode===null)w.child.kill();
  assert.deepEqual(snapshots(),before);assert.equal(fs.readFileSync(path.join(root,'reference/benchmark-hit-worker.ts'),'utf8'),helper);
  const report={passed,directory,games,plan,helperSha256:sha256(helper),inputHashes:Object.fromEntries(Object.entries(before).map(([name,state])=>[name,{source:sha256(JSON.stringify(state.source)),package:sha256(JSON.stringify(state.package))}])),identicalInputs:JSON.stringify(before.previous)===JSON.stringify(before.current),inputsUnchanged:true,hardware:{platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length},results,controls,performanceAcceptance:false};
  writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/hit-paired-benchmark-verification.json',report);console.log({passed,directory});
}
