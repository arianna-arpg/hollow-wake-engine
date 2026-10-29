import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {root,listFiles,sha256,writeJSON} from './reference-utils.mjs';
const args=process.argv.slice(2);assert(args.length===4&&args[0]==='--previous'&&args[2]==='--location');
const previous=JSON.parse(fs.readFileSync(path.resolve(root,args[1]))),current=JSON.parse(fs.readFileSync(path.resolve(root,args[3])));
const games={previous:fs.realpathSync(previous.game),current:fs.realpathSync(current.game)};assert.notEqual(games.previous,games.current);
const snapshot=d=>Object.fromEntries(listFiles(d).map(f=>[f,sha256(fs.readFileSync(path.join(d,f)))]));
const snapshots=()=>Object.fromEntries(Object.entries(games).map(([name,game])=>[name,{source:snapshot(path.join(game,'src')),package:snapshot(fs.realpathSync(path.join(game,'node_modules/@hollow-wake/engine')))}]));
const before=snapshots(),directory=fs.mkdtempSync(path.join(root,'.artifacts/hit-status-benchmark-'));
const plan={schemaVersion:1,seed:0x51a8,workloads:['plain','authored','stat','rider','impale'],warmup:1500,batch:1000,samples:9,order:['previous','current','current','previous'],scope:'Warm whole resolveHit including equal per-hit reset and rider setup; excludes loading, rendering and world timers. Retained heap after forced GC is not total allocation. Desktop measurements are not device acceptance.'};
const planFile=path.join(directory,'plan.json');writeJSON(planFile,plan);
const helper=fs.readFileSync(path.join(root,'reference/benchmark-hit-status.ts'),'utf8'),runs=[];
let passed=false;
try{
 for(const [index,name]of plan.order.entries()){
  const game=games[name],runtime=path.join(directory,index+'-'+name+'.ts'),typed=path.join(directory,index+'-'+name+'.typed.ts'),out=path.join(directory,index+'-'+name+'.json');
  fs.writeFileSync(runtime,helper.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,(_a,_q,f)=>JSON.stringify(pathToFileURL(path.join(game,'src',f+'.ts')).href)));
  fs.writeFileSync(typed,helper.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,(_a,_q,f)=>JSON.stringify(path.relative(directory,path.join(game,'src',f)).replaceAll('\\','/'))));
  const config=path.join(directory,index+'-types.json');writeJSON(config,{extends:path.join(game,'tsconfig.sim.json'),compilerOptions:{typeRoots:[path.join(game,'node_modules/@types')]},include:[typed],exclude:[]});
  const fd=fs.openSync(path.join(directory,index+'-'+name+'.txt'),'wx');
  try{execFileSync(process.execPath,[path.join(game,'node_modules/typescript/bin/tsc'),'-p',config],{cwd:game,stdio:['ignore',fd,fd],timeout:180000});execFileSync(process.execPath,['--expose-gc','--import',pathToFileURL(path.join(game,'node_modules/tsx/dist/loader.mjs')).href,runtime,out,planFile],{cwd:game,stdio:['ignore',fd,fd],timeout:180000});}finally{fs.closeSync(fd);}
  runs.push({name,result:JSON.parse(fs.readFileSync(out))});
 }
 const median=xs=>{const sorted=[...xs].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;};
 const summary=plan.workloads.map(name=>{
  const samples=runs.map(run=>({graph:run.name,...run.result.results.find(r=>r.name===name)}));
  for(const sample of samples)assert.deepEqual(sample.check,samples[0].check,'Behavior changed in benchmark '+name);
  const byGraph=Object.fromEntries(Object.keys(games).map(graph=>[graph,samples.filter(s=>s.graph===graph).map(s=>({medianMsPerHit:median(s.samplesMsPerHit),retainedHeapDelta:s.retainedHeapDelta}))]));
  return {name,byGraph,currentToPreviousMedian:median(byGraph.current.map(s=>s.medianMsPerHit))/median(byGraph.previous.map(s=>s.medianMsPerHit))};
 });
 writeJSON(path.join(directory,'measurements.json'),{plan,hardware:{platform:process.platform,arch:process.arch,cpus:os.cpus().map(c=>c.model),totalMemory:os.totalmem()},runs,summary});passed=true;
}finally{assert.deepEqual(snapshots(),before);assert.equal(fs.readFileSync(path.join(root,'reference/benchmark-hit-status.ts'),'utf8'),helper);
 const report={passed,directory,plan,helperSha256:sha256(helper),inputHashes:Object.fromEntries(Object.entries(before).map(([name,state])=>[name,{source:sha256(JSON.stringify(state.source)),package:sha256(JSON.stringify(state.package))}])),inputsUnchanged:true};writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/hit-status-benchmark-verification.json'),report);console.log(report);}
