import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {root,listFiles,verifyReference,sha256,writeJSON} from './reference-utils.mjs';
import {recoveryPaths,renderLifeRecoverySource} from '../adapters/hollow-wake/integrate-life-recovery.mjs';
const argument=name=>{const at=process.argv.indexOf(name);assert(at<0||process.argv[at+1],'Missing '+name);return at<0?undefined:path.resolve(process.argv[at+1]);};
const artifacts=path.join(root,'.artifacts'),location=JSON.parse(fs.readFileSync(argument('--location')??path.join(artifacts,'adapter-location.json')));
const previous=argument('--previous-adapter'),comparison=argument('--comparison-adapter'),current=location.game,validationOnly=process.argv.includes('--validate-only');
assert(previous,'Supply the published v0.36 game as --previous-adapter');assert.equal(location.lifeRecoveryAdapterDecision,'life-recovery-adapter/v1');
const games={previous,current,...(comparison?{comparison}:{})},names=Object.keys(games),orderAt=process.argv.indexOf('--order');
assert(orderAt<0||process.argv[orderAt+1],'Missing --order');const order=orderAt<0?names:process.argv[orderAt+1].split(',');assert.deepEqual([...order].sort(),names.slice().sort());
const hashFiles=dir=>Object.fromEntries(listFiles(dir).map(f=>[f,sha256(fs.readFileSync(path.join(dir,f)))]));
const packagePath=game=>path.join(game,'node_modules/@hollow-wake/engine');
const snapshot=game=>({source:hashFiles(path.join(game,'src')),package:hashFiles(packagePath(game)),runtime:hashFiles(path.join(packagePath(game),'dist'))});
const before=Object.fromEntries(Object.entries(games).map(([key,game])=>[key,snapshot(game)]));
const identity=p=>{const real=fs.realpathSync(p);return process.platform==='win32'?real.toLowerCase():real;};
assert.equal(new Set(Object.values(games).map(g=>identity(path.join(g,'src')))).size,names.length);
assert.equal(new Set(Object.values(games).map(g=>identity(packagePath(g)))).size,names.length);
assert.equal(identity(packagePath(current)),identity(path.join(location.tooling,'node_modules/@hollow-wake/engine')));
const version=g=>JSON.parse(fs.readFileSync(path.join(packagePath(g),'package.json'))).version;assert.equal(version(previous),'0.36.0');
const oldFiles=Object.keys(before.previous.runtime),added=['life-recovery-content','life-recovery'].flatMap(base=>['d.ts','js','js.map'].map(ext=>base+'.'+ext)).sort();
for(const key of names.filter(k=>k!=='previous')){
  for(const f of oldFiles)assert.equal(before[key].runtime[f],before.previous.runtime[f],'Predecessor runtime changed: '+f);
  assert.deepEqual(Object.keys(before[key].runtime).filter(f=>!Object.hasOwn(before.previous.runtime,f)),added);
  assert.deepEqual(Object.keys(before[key].source).filter(f=>f!=='engine/lifeRecoveryAdapter.ts'),Object.keys(before.previous.source));
  for(const[f,h]of Object.entries(before.previous.source))if(!['engine/actor.ts','engine/world.ts'].includes(f))assert.equal(before[key].source[f],h,'Unrelated source changed: '+f);
}
for(const kind of ['actor','world'])assert.equal(fs.readFileSync(path.join(current,recoveryPaths[kind]),'utf8').replaceAll('\r\n','\n'),renderLifeRecoverySource(fs.readFileSync(path.join(previous,recoveryPaths[kind]),'utf8').replaceAll('\r\n','\n'),kind));
assert(fs.readFileSync(path.join(current,'src/engine/lifeRecoveryAdapter.ts')).equals(fs.readFileSync(path.join(root,'adapters/hollow-wake/lifeRecoveryAdapter.ts'))));
const archive=fs.readFileSync(location.archive);assert.equal('sha512-'+createHash('sha512').update(archive).digest('base64'),location.integrity);
const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
const planFile=argument('--plan')??path.join(root,'baseline/milestone-forty-two/performance-plan.json'),planBytes=fs.readFileSync(planFile),plan=JSON.parse(planBytes);
assert.equal(plan.decision,'life-recovery-performance/v1');assert(validationOnly?['proposed-before-validation','accepted-before-timing'].includes(plan.status):plan.status==='accepted-before-timing');
const helperSource=fs.readFileSync(path.join(root,'reference/benchmark-life-recovery.ts'),'utf8');assert.equal(sha256(helperSource),plan.helperSha256);
const verify=()=>{verifyReference(reference,lock);assert.deepEqual(hashFiles(path.join(root,'dist')),before.current.runtime);for(const[key,game]of Object.entries(games))assert.deepEqual(snapshot(game),before[key],'Changed graph: '+key);
  assert(fs.readFileSync(location.archive).equals(archive));assert(fs.readFileSync(planFile).equals(planBytes));assert.equal(fs.readFileSync(path.join(root,'reference/benchmark-life-recovery.ts'),'utf8'),helperSource);};
verify();
const directory=fs.mkdtempSync(path.join(artifacts,'recovery-benchmark-')),helper=path.join(directory,'helper.ts'),typed=path.join(directory,'helper.typed.ts'),imports=/(['"])\.\.\/src\/([^'"]+)\1/g;
fs.writeFileSync(helper,helperSource.replace(imports,(_a,_q,p)=>JSON.stringify(pathToFileURL(path.join(reference,'src',p+'.ts')).href)));
fs.writeFileSync(typed,helperSource.replace(imports,(_a,_q,p)=>JSON.stringify(path.relative(directory,path.join(reference,'src',p)).replaceAll('\\','/'))));
const config=path.join(directory,'types.json');writeJSON(config,{extends:path.join(reference,'tsconfig.sim.json'),compilerOptions:{typeRoots:[path.join(reference,'node_modules/@types')]},include:[path.join(reference,'src'),typed],exclude:[]});
const fd=fs.openSync(path.join(directory,'types.txt'),'wx');
try{execFileSync(process.execPath,[path.join(reference,'node_modules/typescript/bin/tsc'),'-p',config],{cwd:directory,windowsHide:true,stdio:['ignore',fd,fd]});}finally{fs.closeSync(fd);verify();}
const inputs={location,games,before,archiveSha256:sha256(archive)};writeJSON(path.join(directory,'inputs.json'),inputs);
const graphs={};let expected;
try{for(const key of order){
  const output=path.join(directory,key+'.json');
  execFileSync(process.execPath,['--expose-gc','--import','tsx',helper,games[key],output,planFile,...(validationOnly?['--validate-only']:[])],{cwd:reference,windowsHide:true,stdio:'inherit'});
  const r=JSON.parse(fs.readFileSync(output));assert.equal(r.validationOnly,validationOnly);assert.equal(r.planSha256,sha256(planBytes));
  assert.deepEqual(r.results.map(x=>x.name),plan.workloads.map(x=>x.name));assert.deepEqual(r.memory.map(x=>[x.mode,x.count]),plan.memory.states.flatMap(mode=>plan.memory.actorCounts.map(count=>[mode,count])));
  const outcomes={results:r.results.map(({name,receipt,receiptSha256})=>({name,receipt,receiptSha256})),memory:r.memory.map(({mode,count,receiptSha256,witnessesReleased})=>({mode,count,receiptSha256,witnessesReleased}))};
  if(expected)assert.deepEqual(outcomes,expected,'Recovery benchmark graph outcomes differ');else expected=outcomes;
  graphs[key]={output,sha256:sha256(fs.readFileSync(output)),version:version(games[key])};
}}finally{verify();}
const outcomeSha256=sha256(JSON.stringify(expected));if(plan.status==='accepted-before-timing')assert.equal(outcomeSha256,plan.validatedOutcomeSha256,'Validated workloads changed');
const summary={schemaVersion:1,validationOnly,graphOrder:order,graphs,helperSha256:sha256(helperSource),planSha256:sha256(planBytes),outcomeSha256,
  helperTypesPassed:true,workloads:plan.workloads.length,memoryCases:expected.memory.length,installedRuntimeFilesMatchBuild:Object.keys(before.current.runtime).length,
  unchangedPreviousRuntimeFiles:oldFiles.length,unrelatedHostFilesUnchanged:Object.keys(before.previous.source).length-2,sourceCapsuleUnchanged:true,controlsUnchanged:true,
  scope:'Fresh independent Node processes; native Actor/World paths with scalar call-through healing observers and retained Actor-graph heap measurements. All graph inputs preserved. No physical device, renderer, FPS, allocation-volume or peak-memory claim.'};
writeJSON(path.join(directory,'summary.json'),summary);writeJSON(path.join(artifacts,'recovery-benchmark'+(validationOnly?'-validation':'')+'-location.json'),{output:path.join(directory,'summary.json')});console.log('Recovery comparison saved: '+directory);
