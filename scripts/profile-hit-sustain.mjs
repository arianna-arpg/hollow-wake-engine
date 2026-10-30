import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {root,listFiles,sha256,writeJSON,verifyReference} from './reference-utils.mjs';
import {checkSustainBenchmark} from './hit-sustain-benchmark-checks.mjs';

const args=process.argv.slice(2);
assert(args.length===4&&args[0]==='--previous'&&args[2]==='--location');
const read=f=>JSON.parse(fs.readFileSync(f));
const games=Object.fromEntries([['previous',args[1]],['current',args[3]]].map(([lane,file])=>[lane,fs.realpathSync(read(path.resolve(root,file)).game)]));
const snapshot=d=>Object.fromEntries(listFiles(d).map(f=>[f,sha256(fs.readFileSync(path.join(d,f)))]));
const snapshots=()=>Object.fromEntries(Object.entries(games).map(([lane,game])=>[lane,{source:snapshot(path.join(game,'src')),package:snapshot(fs.realpathSync(path.join(game,'node_modules/@hollow-wake/engine')))}]));
const helperPath=path.join(root,'reference/benchmark-hit-sustain-worker.ts'),checksPath=path.join(root,'scripts/hit-sustain-benchmark-checks.mjs');
const helper=fs.readFileSync(helperPath,'utf8'),checks=fs.readFileSync(checksPath),script=fs.readFileSync(import.meta.filename),before=snapshots();
verifyReference(path.join(root,'.reference'),read(path.join(root,'baseline/source-lock.json')));
assert.deepEqual(snapshot(path.join(games.current,'node_modules/@hollow-wake/engine/dist')),snapshot(path.join(root,'dist')));
const directory=fs.mkdtempSync(path.join(root,'.artifacts/hit-sustain-profile-'));
const plan={seed:0x51a8,population:256,workloads:['trees','combined'],warmup:5000,hits:50000,auditHits:3,samplingIntervalUs:1000,orders:[['previous','current'],['current','previous']],
  scope:'Diagnostic CPU sampling in eight fresh processes, one selected workload per process. Equal native hits and resets with outcome checks. Sampling covers the hit loop, excluding audit, warmup, explicit collection, snapshots and file writes. This is a different JIT history from the 21-case throughput run, and is not an adoption gate, allocation measurement or device result.'};
writeJSON(path.join(directory,'plan.json'),plan);writeJSON('.artifacts/hit-sustain-profile-latest.json',{directory});
assert.equal(helper.split('type Message=').length,2);
let body=helper.split('type Message=')[0];
const marker='    finish(){assert(begun);';assert.equal(body.split(marker).length,2);
body="import {Session} from 'node:inspector/promises';\nimport fs from 'node:fs';\n"+body.replace(marker,`    async profile(count:number,interval:number){
      assert(begun);clearCounters();const session=new Session();session.connect();
      try{
        await session.post('Profiler.enable');await session.post('Profiler.setSamplingInterval',{interval});
        await session.post('Profiler.start');
        for(let i=0;i<count;i++)one();
        const {profile}=await session.post('Profiler.stop');
        return {profile,check:check()};
      }finally{session.disconnect();}
    },
`+marker);
body+=`\nasync function main(){
  const spec=JSON.parse(process.argv[2]),run=course(spec.workload,spec.population,spec.seed);
  try{
    const audit=run.audit(spec.auditHits);run.warmup(spec.warmup);run.begin();
    const {profile,check}=await run.profile(spec.hits,spec.samplingIntervalUs);
    fs.writeFileSync(spec.profilePath,JSON.stringify(profile));
    fs.writeFileSync(spec.resultPath,JSON.stringify({audit,check,retained:run.finish(),node:process.version}));
  }finally{run.restore();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});\n`;

function summarize(profile){
  assert(profile.samples?.length>100);assert.equal(profile.samples.length,profile.timeDeltas.length);
  const nodes=new Map(profile.nodes.map(n=>[n.id,n])),parents=new Map(),rows=new Map();
  for(const n of profile.nodes)for(const id of n.children??[]){assert(!parents.has(id));parents.set(id,n.id);}
  const key=n=>JSON.stringify([n.callFrame.functionName,n.callFrame.url,n.callFrame.lineNumber,n.callFrame.columnNumber]);
  const row=n=>{const k=key(n);if(!rows.has(k))rows.set(k,{...n.callFrame,selfUs:0,inclusiveUs:0,selfSamples:0});return rows.get(k);};
  let sampledUs=0;
  for(let i=0;i<profile.samples.length;i++){
    const us=profile.timeDeltas[i];assert(Number.isFinite(us)&&us>=0);sampledUs+=us;
    let id=profile.samples[i];assert(nodes.has(id));const leaf=row(nodes.get(id));leaf.selfUs+=us;leaf.selfSamples++;
    const seen=new Set(),ids=new Set();while(id!==undefined){assert(!ids.has(id));ids.add(id);const node=nodes.get(id);assert(node);const k=key(node);if(!seen.has(k)){row(node).inclusiveUs+=us;seen.add(k);}id=parents.get(id);}
  }
  const frames=[...rows.values()].sort((a,b)=>b.selfUs-a.selfUs);
  assert.equal(frames.reduce((n,r)=>n+r.selfSamples,0),profile.samples.length);
  assert.equal(frames.reduce((n,r)=>n+r.selfUs,0),sampledUs);
  return {samples:profile.samples.length,sampledUs,durationUs:profile.endTime-profile.startTime,frames};
}
const results=[],programs={};let passed=false;
try{
  for(const[lane,game]of Object.entries(games)){
    const runtime=path.join(directory,lane+'.ts'),typed=path.join(directory,lane+'.typed.ts'),config=path.join(directory,lane+'-types.json');
    fs.writeFileSync(runtime,body.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,(_a,_q,f)=>JSON.stringify(pathToFileURL(path.join(game,'src',f+'.ts')).href)),{flag:'wx'});
    fs.writeFileSync(typed,body.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,(_a,_q,f)=>JSON.stringify(path.relative(directory,path.join(game,'src',f)).replaceAll('\\','/'))),{flag:'wx'});
    writeJSON(config,{extends:path.join(game,'tsconfig.sim.json'),compilerOptions:{typeRoots:[path.join(game,'node_modules/@types')]},include:[typed],exclude:[]});
    const fd=fs.openSync(path.join(directory,lane+'-types.txt'),'wx');try{execFileSync(process.execPath,[path.join(game,'node_modules/typescript/bin/tsc'),'-p',config],{cwd:game,windowsHide:true,timeout:180000,stdio:['ignore',fd,fd]});}finally{fs.closeSync(fd);}
    programs[lane]=runtime;
  }
  for(const workload of plan.workloads)for(let round=0;round<plan.orders.length;round++){
    const observed={};for(const lane of plan.orders[round]){
      const game=games[lane],name=workload+'-'+round+'-'+lane,profilePath=path.join(directory,name+'.cpuprofile'),resultPath=path.join(directory,name+'.json'),log=path.join(directory,name+'.txt');
      const fd=fs.openSync(log,'wx');try{execFileSync(process.execPath,['--expose-gc','--import',pathToFileURL(path.join(game,'node_modules/tsx/dist/loader.mjs')).href,programs[lane],JSON.stringify({...plan,workload,profilePath,resultPath})],{cwd:game,windowsHide:true,timeout:180000,stdio:['ignore',fd,fd]});}finally{fs.closeSync(fd);}
      const value=read(resultPath);checkSustainBenchmark(value.audit,workload,plan.population,plan.auditHits,true);checkSustainBenchmark(value.check,workload,plan.population,plan.hits);
      assert.equal(value.check.draws,value.audit.draws/plan.auditHits*plan.hits);observed[lane]=value;
      const summary=summarize(read(profilePath));writeJSON(path.join(directory,name+'-summary.json'),summary);
      results.push({workload,round,lane,profilePath,resultPath,log,profileSha256:sha256(fs.readFileSync(profilePath)),resultSha256:sha256(fs.readFileSync(resultPath)),samples:summary.samples,sampledUs:summary.sampledUs});
      writeJSON(path.join(directory,'progress.json'),{results});console.log({workload,round,lane,samples:summary.samples});
    }
    assert.deepEqual(observed.current.audit,observed.previous.audit);assert.deepEqual(observed.current.check,observed.previous.check);
  }
  passed=true;
}finally{
  assert.deepEqual(snapshots(),before);assert.equal(fs.readFileSync(helperPath,'utf8'),helper);assert(fs.readFileSync(checksPath).equals(checks));assert(fs.readFileSync(import.meta.filename).equals(script));
  const report={passed,directory,plan,games,results,inputsUnchanged:true,helperSha256:sha256(helper),checksSha256:sha256(checks),scriptSha256:sha256(script),
    inputs:Object.fromEntries(Object.entries(before).map(([k,v])=>[k,{source:sha256(JSON.stringify(v.source)),package:sha256(JSON.stringify(v.package))}])),
    hardware:{node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length},performanceAcceptance:false};
  writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/hit-sustain-profile-verification.json',report);console.log({passed,directory,profiles:results.length});
}
