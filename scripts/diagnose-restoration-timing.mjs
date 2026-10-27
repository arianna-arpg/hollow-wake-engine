import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {root,listFiles,sha256,writeJSON,verifyReference} from './reference-utils.mjs';

const argument = name => { const at=process.argv.indexOf(name); assert(at>=0&&process.argv[at+1],name+' required'); return path.resolve(process.argv[at+1]); };
const read = file => JSON.parse(fs.readFileSync(file));
const planFile=path.join(root,'baseline/milestone-forty-three/measurement-diagnosis-plan.json'),planBytes=fs.readFileSync(planFile),plan=JSON.parse(planBytes);
assert.equal(plan.status,'diagnostic-only-frozen-before-collection');
assert.equal(plan.decision,'restoration-measurement-diagnosis/v1');
assert(!process.env.NODE_OPTIONS&&!process.env.NODE_V8_COVERAGE,'Use a process without inherited Node instrumentation');
const calibrationFile=argument('--calibration'),calibrationBytes=fs.readFileSync(calibrationFile),calibration=JSON.parse(calibrationBytes);
assert(calibration.passed);assert.equal(calibration.planSha256,sha256(planBytes));assert.equal(calibration.node,process.version);assert.equal(calibration.platform,process.platform);
const locations={A:read(argument('--a')),B:read(argument('--b'))};
const hashFiles=dir=>Object.fromEntries(listFiles(dir).map(f=>[f,sha256(fs.readFileSync(path.join(dir,f)))]));
const packagePath=loc=>path.join(loc.game,'node_modules/@hollow-wake/engine');
const snapshot=loc=>({source:hashFiles(path.join(loc.game,'src')),package:hashFiles(packagePath(loc)),runtime:hashFiles(path.join(packagePath(loc),'dist'))});
const before=Object.fromEntries(Object.entries(locations).map(([k,l])=>[k,snapshot(l)]));
assert.deepEqual(before.A,before.B,'Identical-code controls differ');assert.deepEqual(before.A.runtime,hashFiles(path.join(root,'dist')));
assert.equal(Object.keys(before.A.runtime).length,201);assert.equal(Object.keys(before.A.source).length,997);
const identity=p=>fs.realpathSync(p).toLowerCase();
assert.notEqual(identity(locations.A.game),identity(locations.B.game));assert.notEqual(identity(packagePath(locations.A)),identity(packagePath(locations.B)));
const archives=Object.fromEntries(Object.entries(locations).map(([k,l])=>{const bytes=fs.readFileSync(l.archive);assert.equal('sha512-'+createHash('sha512').update(bytes).digest('base64'),l.integrity);return[k,sha256(bytes)];}));assert.equal(archives.A,archives.B);
const acceptedFile=path.join(root,'baseline/milestone-forty-three/performance-workloads.json'),acceptedBytes=fs.readFileSync(acceptedFile),accepted=JSON.parse(acceptedBytes);
assert.equal(sha256(acceptedBytes),plan.acceptedPlanSha256);
const sourceFile=path.join(root,'reference/benchmark-restoration.ts'),source=fs.readFileSync(sourceFile,'utf8');assert.equal(sha256(source),plan.acceptedHelperSha256);
const expectedFile=path.join(root,'evidence/milestone-forty-three/restoration-initial-run-1-current.json'),expectedBytes=fs.readFileSync(expectedFile),expected=JSON.parse(expectedBytes).results;
const project=rows=>rows.map(({name,actors,receipt,receiptSha256})=>({name,actors,receipt,receiptSha256}));
const reference=path.join(root,'.reference'),lock=read(path.join(root,'baseline/source-lock.json'));
const directory=fs.mkdtempSync(path.join(root,'.artifacts/restoration-timing-diagnosis-')),stateFile=path.join(directory,'state.json');
console.log('Restoration timing diagnosis: '+directory);writeJSON(path.join(root,'.artifacts/restoration-timing-diagnosis-location.json'),{directory,state:stateFile});
const helperPlan=path.join(directory,'helper-plan.json');writeJSON(helperPlan,{warmups:plan.warmups,samples:plan.samples,memorySamples:0,memory:{states:[],actorCounts:[]},workloads:plan.workloadIndices.map(i=>accepted.workloads[i])});
const replaceOnce=(text,before,after)=>{assert.equal(text.split(before).length,2,'Diagnostic derivation anchor changed');return text.replace(before,after);};
let instrumented=replaceOnce(source,"const results:unknown[]=[];",`const threadCounters=process as typeof process&{threadCpuUsage(previous?:{user:number;system:number}):{user:number;system:number}};
const results:unknown[]=[];`);
instrumented=replaceOnce(instrumented,"const samples:number[]=[];let expected='';","const samples:number[]=[];const cpuSamples:unknown[]=[];let expected='';");
instrumented=replaceOnce(instrumented,
  'try{collect();const start=validationOnly?0:performance.now();prepared.run();const elapsed=validationOnly?0:performance.now()-start;',
  `try{collect();const cpuProcessStart=process.cpuUsage(),cpuThreadStart=threadCounters.threadCpuUsage();
      const start=validationOnly?0:performance.now();prepared.run();const elapsed=validationOnly?0:performance.now()-start;
      const threadCpuMicroseconds=threadCounters.threadCpuUsage(cpuThreadStart),processCpuMicroseconds=process.cpuUsage(cpuProcessStart);
      cpuSamples.push({trial,elapsedMs:elapsed,threadCpuMicroseconds,processCpuMicroseconds});`);
instrumented=replaceOnce(instrumented,'{samplesMs:samples,medianMs:median(samples),p95Ms:sorted[Math.floor(sorted.length*.95)]}',
  '{samplesMs:samples,medianMs:median(samples),p95Ms:sorted[Math.floor(sorted.length*.95)],cpuSamples}');
const helpers={},imports=/(['"])\.\.\/src\/([^'"]+)\1/g;
for(const[mode,text]of Object.entries({plain:source,cpu:instrumented})){
  const file=path.join(directory,mode+'.ts'),typed=path.join(directory,mode+'.typed.ts');
  fs.writeFileSync(file,text.replace(imports,(_a,_q,p)=>JSON.stringify(pathToFileURL(path.join(reference,'src',p+'.ts')).href)),{flag:'wx'});
  fs.writeFileSync(typed,text.replace(imports,(_a,_q,p)=>JSON.stringify(path.relative(directory,path.join(reference,'src',p)).replaceAll('\\','/'))),{flag:'wx'});
  helpers[mode]={file,typed,sha256:sha256(fs.readFileSync(file)),derivedSourceSha256:sha256(text)};
}
const config=path.join(directory,'types.json');writeJSON(config,{extends:path.join(reference,'tsconfig.sim.json'),compilerOptions:{typeRoots:[path.join(reference,'node_modules/@types')]},include:[path.join(reference,'src'),...Object.values(helpers).map(h=>h.typed)],exclude:[]});
const driverFile=new URL(import.meta.url),driverBytes=fs.readFileSync(driverFile),helperPlanBytes=fs.readFileSync(helperPlan);
const verify=()=>{verifyReference(reference,lock);assert(fs.readFileSync(planFile).equals(planBytes));assert(fs.readFileSync(acceptedFile).equals(acceptedBytes));assert(fs.readFileSync(expectedFile).equals(expectedBytes));assert(fs.readFileSync(calibrationFile).equals(calibrationBytes));assert(fs.readFileSync(driverFile).equals(driverBytes));assert(fs.readFileSync(helperPlan).equals(helperPlanBytes));assert.equal(fs.readFileSync(sourceFile,'utf8'),source);assert.deepEqual(hashFiles(path.join(root,'dist')),before.A.runtime);for(const[k,l]of Object.entries(locations)){assert.deepEqual(snapshot(l),before[k]);assert.equal(sha256(fs.readFileSync(l.archive)),archives[k]);}for(const h of Object.values(helpers))assert.equal(sha256(fs.readFileSync(h.file)),h.sha256);};
verify();writeJSON(path.join(directory,'inputs.json'),{locations,before,archives,driverSha256:sha256(driverBytes),planSha256:sha256(planBytes),acceptedPlanSha256:sha256(acceptedBytes),helperSha256:sha256(source),expectedSha256:sha256(expectedBytes),calibrationSha256:sha256(calibrationBytes),helpers});
const run=(label,args)=>{const log=path.join(directory,label+'.txt'),fd=fs.openSync(log,'wx');try{execFileSync(process.execPath,args,{cwd:reference,windowsHide:true,stdio:['ignore',fd,fd],timeout:900000});}finally{fs.closeSync(fd);verify();}return{log,logSha256:sha256(fs.readFileSync(log))};};
let passed=false;const runs=[];
try{
  writeJSON(stateFile,{status:'running',phase:'types',pid:process.pid});run('types',[path.join(reference,'node_modules/typescript/bin/tsc'),'-p',config]);
  for(const[i,entry]of plan.processOrder.entries()){
    const name=`${i+1}-${entry.mode}-${entry.graph}`,output=path.join(directory,name+'.json');writeJSON(stateFile,{status:'running',phase:name,pid:process.pid});console.log('Starting '+name);
    const logs=run(name,['--expose-gc','--import','tsx',helpers[entry.mode].file,locations[entry.graph].game,output,helperPlan]),r=read(output);
    assert.deepEqual(project(r.results),project(plan.workloadIndices.map(j=>expected[j])));assert.deepEqual(r.memory,[]);assert.equal(r.validationOnly,false);
    for(const row of r.results){assert.equal(row.samplesMs.length,plan.samples);if(entry.mode==='cpu'){assert.equal(row.cpuSamples.length,plan.samples+plan.warmups);for(const[j,s]of row.cpuSamples.entries()){assert.equal(s.trial,j-plan.warmups);if(s.trial>=0)assert.equal(s.elapsedMs,row.samplesMs[s.trial]);for(const c of [s.threadCpuMicroseconds,s.processCpuMicroseconds])for(const v of [c.user,c.system])assert(Number.isInteger(v)&&v>=0);}}else assert(!Object.hasOwn(row,'cpuSamples'));}
    runs.push({...entry,number:i+1,output,sha256:sha256(fs.readFileSync(output)),...logs});console.log(name+': outcomes matched');
  }passed=true;
}finally{verify();const summary=path.join(directory,'summary.json');writeJSON(summary,{schemaVersion:1,passed,runs,driverSha256:sha256(driverBytes),planSha256:sha256(planBytes),helpers,calibrationSha256:sha256(calibrationBytes),identicalSourceAndPackage:true,inputsUnchanged:true,acceptedOutcomesMatched:passed,measuredSamples:runs.length*plan.workloadIndices.length*plan.samples,scope:plan.interpretation});writeJSON(stateFile,{status:passed?'completed':'failed',summary});console.log({directory,passed});}
