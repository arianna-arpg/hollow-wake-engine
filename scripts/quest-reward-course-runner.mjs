import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {gzipSync} from 'node:zlib';import {build} from 'esbuild';
import {root,sha256} from './reference-utils.mjs';
import {characterBuildPack} from './compile-character-builds.mjs';import {passivePack} from './compile-passive-content.mjs';import {craftingPack} from './compile-crafting-content.mjs';import {equipmentPack} from './compile-item-content.mjs';import {progressionPack} from './compile-progression-content.mjs';
import {unlockContentPack} from './compile-unlock-content.mjs';import {memoryRewardPack} from './compile-memory-rewards.mjs';import {progressionGatePack} from './compile-progression-gates.mjs';
import {originalPouchData} from './compile-pouch-recall.mjs';import {memoryRollRowsPack} from './compile-memory-roll-rows.mjs';import {vocationQuestRewardPack} from './compile-vocation-quest-rewards.mjs';
import {questRewardCourses,questRewardRuntime,questRewardAliases,questRewardGameFixtures} from '../test/quest-rewards/courses.mjs';

/** Source comparisons and storage courses share one bounded execution harness.
 * Overrides let an integration preview qualify its exact future file bodies;
 * ordinary repository commands always read the maintained files from disk. */
export async function runQuestRewards(mode,options={}){
 assert(Object.hasOwn(questRewardCourses,mode),'Unknown quest course');const spec=questRewardCourses[mode],stem=options.stem??'quest-rewards-'+mode;assert(/^[a-z0-9-]+$/.test(stem));
 fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
 const read=options.read??(file=>fs.readFileSync(path.join(root,file))),owned=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(owned,stem+'-owned-'));
 const report={passed:false,mode,sources:{},runs:[],faults:[],reference:!!spec.reference,devicePerformanceQualified:false},logs={};
 const capture=file=>{file=file.replaceAll('\\','/');const bytes=read(file);report.sources[file]=sha256(bytes);return bytes.toString();};
 try{
  for(const f of ['scripts/quest-reward-course-runner.mjs','scripts/test-quest-rewards.mjs','test/quest-rewards/courses.mjs','baseline/source-lock.json','package.json'])capture(f);
  const sources=new Map(questRewardRuntime.map(file=>[file,capture('src/'+file)]));report.runtimeSources=Object.fromEntries([...sources].map(([file,code])=>[file,sha256(code)]));
  const fixture='test/quest-rewards/'+spec.fixture;let course=capture(fixture);
  if(spec.owner){const base=capture('test/run-character/owner-cases.mjs');assert.equal(base.split('const character={workshop,').length,2);course="import {MEMORY_KINDS} from 'host/quest-content';\n"+base.replace('const character={workshop,','const character={memoryDelivery:MEMORY_KINDS,workshop,')+'\n'+course;}
  const aliases=Object.fromEntries(Object.entries(questRewardAliases).map(([key,file])=>[key,path.join(root,file)]));
  // One source module identity for fixtures, public factory imports and the
  // candidate graph. Mixing dist classes with source classes breaks admission.
  for(const[subpath,entry]of Object.entries(JSON.parse(capture('package.json')).exports)){
   const file=typeof entry==='string'?entry:entry.import;
   if(file?.startsWith('./dist/')&&file.endsWith('.js'))aliases['@hollow-wake/engine'+subpath.slice(1)]=path.join(root,'src',file.slice(7).replace(/\.js$/,'.ts'));
  }
  const data=(alias,name,value)=>{const file=path.join(work,name+'.json'),bytes=JSON.stringify(value);fs.writeFileSync(file,bytes);aliases[alias]=file;report[name+'Sha256']=sha256(bytes);};
  if(spec.owner){
   for(const name of ['character-builds','passive-content','crafting-content','item-content','progression-content','unlock-content','memory-rewards','progression-gates','vocation-quest-rewards','pouch-recall'])capture('scripts/compile-'+name+'.mjs');
   for(const f of ['scripts/vocation-reference.mjs','baseline/vocation-progression/acceptance.json','baseline/vocation-progression/survey.json.gz','baseline/pouch-recall/acceptance.json','baseline/pouch-recall/observations.json.gz'])capture(f);
   data('candidate/data','character-content',{builds:characterBuildPack(),passives:passivePack(),crafting:craftingPack(),equipment:equipmentPack(),experience:progressionPack(),account:{unlocks:unlockContentPack(),memories:memoryRewardPack(),gates:progressionGatePack()}});
   data('candidate/quest-reward-data','quest-rewards',vocationQuestRewardPack());data('candidate/memory-kind-data','memory-kinds',JSON.parse(originalPouchData()).kinds);
  }
  if(spec.rows){for(const f of ['scripts/compile-memory-roll-rows.mjs','scripts/compile-pouch-recall.mjs','baseline/pouch-recall/acceptance.json','baseline/pouch-recall/observations.json.gz'])capture(f);data('candidate/roll-rows','roll-rows',memoryRollRowsPack());}
  const lock=JSON.parse(capture('baseline/source-lock.json')),gameFixtures=new Set(questRewardGameFixtures.map(f=>path.join(root,f))),sourceDir=path.join(root,'src'),testDir=path.join(root,'test/quest-rewards');
  const run=async(name,edits=[])=>{
   const variant=new Map(sources);for(const[file,from,to]of edits){const code=variant.get(file);assert.equal(code?.split(from).length,2,name+': '+file);variant.set(file,code.replace(from,to));}
   const outfile=path.join(work,name+'.mjs'),result=await build({stdin:{contents:course,loader:spec.fixture.endsWith('.ts')?'ts':'js',resolveDir:gameFixtures.has(path.join(root,fixture))?path.join(root,'.reference/balance'):testDir},outfile,bundle:true,platform:'node',format:'esm',target:'es2022',metafile:true,logLevel:'silent',plugins:[{name:'maintained-quest-rewards',setup(b){
    b.onResolve({filter:/.*/},a=>{
     if(aliases[a.path])return{path:aliases[a.path]};
     if(a.path.startsWith('.')&&/\.[cm]?js$/.test(a.path)){
      const full=path.resolve(a.resolveDir,a.path),key=path.basename(full).replace(/\.js$/,'.ts');
      if(variant.has(key)&&(path.dirname(full)===sourceDir||path.dirname(full)===path.join(root,'dist')))return{path:path.join(sourceDir,key)};
      if(path.dirname(full)===path.join(root,'dist')&&a.path.endsWith('.js')&&fs.existsSync(path.join(sourceDir,key)))return{path:path.join(sourceDir,key)};
      if(fs.existsSync(full)&&fs.statSync(full).isFile())return{path:full};
      // A preflight fixture directory is virtual. Resolve its existing source
      // imports explicitly instead of relying on an on-disk importer directory.
      if(path.dirname(full)===sourceDir&&a.path.endsWith('.js')&&fs.existsSync(path.join(sourceDir,key)))return{path:path.join(sourceDir,key)};
     }
    });
    b.onLoad({filter:/\.(?:mjs|ts)$/},a=>{
     if(gameFixtures.has(a.path))return{contents:capture(path.relative(root,a.path)),loader:'ts',resolveDir:path.join(root,'.reference/balance')};
     if(path.dirname(a.path)===sourceDir&&variant.has(path.basename(a.path)))return{contents:variant.get(path.basename(a.path)),loader:'ts',resolveDir:sourceDir};
     if(a.path.startsWith(testDir+path.sep))return{contents:capture(path.relative(root,a.path)),loader:a.path.endsWith('.ts')?'ts':'js',resolveDir:testDir};
    });
   }}]});
   for(const f of Object.keys(result.metafile.inputs)){
    assert(!path.resolve(root,f).startsWith(path.join(root,'dist')+path.sep),'Source course mixed in compiled runtime: '+f);
    if(f!=='<stdin>'&&!path.resolve(root,f).startsWith(work+path.sep)&&fs.existsSync(path.join(root,f))){const code=capture(f);if(f.startsWith('.reference/'))assert.equal(sha256(code),lock.files[f.slice(11)],f);}
   }
   const args=spec.singleArgument?[name]:[work,name],child=spawnSync(process.execPath,[outfile,...args],{cwd:root,windowsHide:true,encoding:'utf8',timeout:360000,maxBuffer:12*1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_COMPILE_CACHE:path.join(work,'cache')}});
   logs[name]={stdout:child.stdout,stderr:child.stderr};assert(!child.error&&!child.signal,String(child.error));return child;
  };
  const result=child=>JSON.parse(child.stdout.trim().split('\n').at(-1)),coverage=value=>{for(const[field,expected]of Object.entries(spec.expected??{}))assert.equal(value[field],expected,mode+': '+field);};
  if(spec.stages){
   for(const stage of spec.stages){const child=await run(stage);assert.equal(child.status,0,child.stderr);report.runs.push({stage,result:result(child)});}report.freshDatabaseProcesses=spec.stages.length;
  }else{
   let oracle,expected;if(spec.reference){const child=await run('original');assert.equal(child.status,0,child.stderr);oracle=result(child);coverage(oracle);report.originalSha256=sha256(JSON.stringify(oracle.results));}
   for(const name of ['control','fresh-control']){const child=await run(name);assert.equal(child.status,0,child.stderr);const actual=result(child);coverage(actual);if(oracle)assert.deepEqual(actual.results,oracle.results,name+' differs from original');else{expected??=child.stdout;assert.equal(child.stdout,expected,name+' is not repeatable');}report.result=actual;report.runs.push({name});}
   for(const fault of spec.faults){const child=await run(fault.name,fault.edits);if(fault.kind==='mismatch'){assert(oracle);assert.equal(child.status,0,child.stderr);assert.notDeepEqual(result(child).results,oracle.results,fault.name+' escaped');}else{assert.equal(child.status,1,fault.name+' escaped');assert(child.stderr.includes(fault.message),fault.name+': '+child.stderr);if(spec.owner)assert(child.stderr.includes('ERR_ASSERTION'),fault.name+' missed behavior assertion');}report.faults.push({name:fault.name,detected:true});}
   const restored=await run('restored');assert.equal(restored.status,0,restored.stderr);if(oracle)assert.deepEqual(result(restored).results,oracle.results);else assert.equal(restored.stdout,expected);report.restored=true;
  }
  report.passed=true;report.physicalStorageQualified=spec.owner?'Node SQLite':false;report.wholeWorldSave=false;report.originalSharedRandomInterleaving=false;
 }catch(error){report.failure=String(error);}
 finally{
  try{report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(read(file))===hash);report.passed&&=report.inputsUnchanged;}catch(error){report.passed=false;report.failure??=String(error);}
  try{assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;}catch(error){report.passed=false;report.cleanupFailure=String(error);}
  const bytes=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(bytes);fs.writeFileSync(path.join(owned,stem+'.logs.json.gz'),bytes);fs.writeFileSync(path.join(owned,stem+'.json'),JSON.stringify(report,null,2)+'\n');
 }
 assert(report.passed,report.failure??report.cleanupFailure);console.log({passed:true,mode,faults:report.faults.length,processes:report.runs.length,cleaned:report.cleaned});return report;
}
