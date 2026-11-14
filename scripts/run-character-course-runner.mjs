import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';import {gzipSync} from 'node:zlib';import {build} from 'esbuild';
import {root,sha256} from './reference-utils.mjs';
import {characterBuildPack} from './compile-character-builds.mjs';import {passivePack} from './compile-passive-content.mjs';import {craftingPack} from './compile-crafting-content.mjs';import {equipmentPack} from './compile-item-content.mjs';import {progressionPack} from './compile-progression-content.mjs';
import {unlockContentPack} from './compile-unlock-content.mjs';import {memoryRewardPack} from './compile-memory-rewards.mjs';import {progressionGatePack} from './compile-progression-gates.mjs';
import {experienceFaults,ownerFaults,worldFaults} from '../test/run-character/faults.mjs';
const runtime=['account-prepared-step','complete-character-contracts','account-workshop-core','account-workshop-complete','character-workshop-boundary','complete-account-commands','character-workshop-commands','character-experience-plan','run-character-session','relic-custody','relic-experience','durable-run-owner'];

/** Shared qualification over maintained sources. Faults change only an in-memory
 * compilation; every child and SQLite file lives in one guarded owned folder. */
export async function runCharacterCourse(mode){
 assert(['experience','owner','world','sqlite','sqlite-world'].includes(mode));
 const world=mode==='world'||mode==='sqlite-world',experience=mode==='experience',disk=mode==='sqlite',stem='run-character-'+mode;
 fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
 const owned=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(owned,stem+'-owned-')),report={passed:false,mode,sources:{},runs:[],faults:[]},logs={};
 const capture=f=>{const bytes=fs.readFileSync(path.join(root,f));report.sources[f]=sha256(bytes);return bytes.toString();};
 try{
  const sources=new Map(runtime.map(name=>[name+'.ts',capture('src/'+name+'.ts')]));report.runtimeSources=Object.fromEntries([...sources].map(([f,s])=>[f,sha256(s)]));
  const files=experience?['experience-cases.mjs']:['owner-cases.mjs',...(world?['world-awards.mjs']:[]),...(disk?['checkpoint-sqlite.mjs']:['relic-policy-cases.mjs','checkpoint-cases.mjs']),...(world?['world-checkpoints.mjs','world-canonical.mjs']:[]),'earned-points-cases.mjs',...(disk?['earned-checkpoint-sqlite.mjs']:['earned-checkpoint-cases.mjs'])];
  const course=files.map(f=>capture('test/run-character/'+f)).join('\n');report.courses=files;
  for(const f of ['scripts/test-run-character.mjs','scripts/run-character-course-runner.mjs','test/run-character/faults.mjs','baseline/source-lock.json','package.json'])capture(f);
  for(const name of ['character-builds','passive-content','crafting-content','item-content','progression-content','unlock-content','memory-rewards','progression-gates'])capture('scripts/compile-'+name+'.mjs');
  const data=path.join(work,'data.json');
  if(!experience){fs.writeFileSync(data,JSON.stringify({builds:characterBuildPack(),passives:passivePack(),crafting:craftingPack(),equipment:equipmentPack(),experience:progressionPack(),account:{unlocks:unlockContentPack(),memories:memoryRewardPack(),gates:progressionGatePack()}}));report.contentSha256=sha256(fs.readFileSync(data));}
  else for(const f of ['src/character-progression.ts','dist/character-progression.js','dist/validation.js','scripts/catalogue-tools.mjs','baseline/milestone-three/catalogue.json.gz','baseline/milestone-eighteen/character-progression.json.gz'])capture(f);
  const lock=JSON.parse(capture('baseline/source-lock.json')),originalHarnesses=new Set(['test/character-passive/live-world.ts','test/run-character/world.ts','test/run-character/world-canonical.ts'].map(f=>path.join(root,f)));
  const aliases={
   'candidate/run-character-session':path.join(root,'src/run-character-session.ts'),'candidate/experience-plan':path.join(root,'src/character-experience-plan.ts'),
   'candidate/live-run-world':path.join(root,'test/run-character/world.ts'),'candidate/live-passive-world':path.join(root,'test/character-passive/live-world.ts'),
   'candidate/data':data,'candidate/durable-run-owner':path.join(root,'src/durable-run-owner.ts'),
   'candidate/live-run-publication':path.join(root,'test/run-character/world-publication.ts'),'candidate/relic-run-world':path.join(root,'test/run-character/world-canonical.ts'),
   'candidate/relic-original':path.join(root,'.reference/src/engine/accountReliquary.ts'),
   'hollow-wake-source/skills':path.join(root,'.reference/src/engine/skills.ts'),'hollow-wake-source/minion-families':path.join(root,'.reference/src/data/minionFamilies.ts')
  };
  for(const[k,v]of Object.entries(JSON.parse(capture('package.json')).exports)){const f=typeof v==='string'?v:v.import;if(f?.endsWith('.js'))aliases['@hollow-wake/engine'+k.slice(1)]=path.join(root,f);}
  if(world)sources.set('world-publication.ts',capture('test/run-character/world-publication.ts'));
  const run=async(name,edits=[],phase)=>{
   const variant=new Map(sources);for(const[file,from,to]of edits){const text=variant.get(file);assert.equal(text?.split(from).length,2,name+': '+file);variant.set(file,text.replace(from,to));}
   const outfile=path.join(work,name+'.mjs'),result=await build({stdin:{contents:course,loader:'js',resolveDir:path.join(root,'test/run-character')},bundle:true,platform:'node',format:'esm',target:'es2022',outfile,metafile:true,logLevel:'silent',plugins:[{name:'maintained-run-character',setup(b){
    b.onResolve({filter:/.*/},a=>{
     if(aliases[a.path])return{path:aliases[a.path]};
     if(a.path.startsWith('.')&&/\.[cm]?js$/.test(a.path)){
      const full=path.resolve(a.resolveDir,a.path),key=path.basename(full).replace(/\.js$/,'.ts');
      if(variant.has(key)&&(path.dirname(full)===path.join(root,'src')||path.dirname(full)===path.join(root,'dist')))return{path:path.join(root,'src',key)};
      if(experience&&(full.startsWith(path.join(root,'dist')+path.sep)||full.startsWith(path.join(root,'scripts')+path.sep)))return{path:pathToFileURL(full).href,external:true};
     }
    });
    b.onLoad({filter:/\.[jt]s$/},a=>{
     if(originalHarnesses.has(a.path))return{contents:capture(path.relative(root,a.path)),loader:'ts',resolveDir:path.join(root,'.reference/balance')};
     const key=path.basename(a.path),text=variant.get(key);if(text!==undefined)return{contents:text,loader:'ts',resolveDir:key==='world-publication.ts'?path.join(root,'test/run-character'):path.join(root,'dist')};
    });
   }}]});
   for(const f of Object.keys(result.metafile.inputs))if(f!=='<stdin>'&&!path.resolve(root,f).startsWith(work+path.sep)&&fs.existsSync(path.join(root,f))){const text=capture(f);if(f.startsWith('.reference/'))assert.equal(sha256(text),lock.files[f.slice(11)],f);}
   const args=disk?[path.join(work,'checkpoint.sqlite'),phase]:[experience?root:work,mode];
   const child=spawnSync(process.execPath,[outfile,...args],{cwd:root,windowsHide:true,encoding:'utf8',timeout:360000,maxBuffer:8*1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_COMPILE_CACHE:path.join(work,'cache')}});
   logs[name]={stdout:child.stdout,stderr:child.stderr};assert(!child.error&&!child.signal,String(child.error));return child;
  };
  if(disk){for(const phase of ['create','recover','rollback','inspect']){const child=await run(phase,[],phase);assert.equal(child.status,0,child.stderr);report.runs.push({phase,output:child.stdout});}report.freshDatabaseProcesses=4;}
  else{
   let expected;for(const name of ['control','fresh-control']){const child=await run(name);assert.equal(child.status,0,child.stderr);expected??=child.stdout;assert.equal(child.stdout,expected);report.runs.push({name,output:child.stdout});}
   const faults=experience?experienceFaults:mode==='owner'?ownerFaults:mode==='world'?worldFaults:[];
   for(const[name,edits,message]of faults){const child=await run(name,edits);assert.equal(child.status,1,name+' escaped');assert(child.stderr.includes(message),name+': '+child.stderr);report.faults.push({name,detected:true});}
   const restored=await run('restored');assert.equal(restored.status,0,restored.stderr);assert.equal(restored.stdout,expected);report.restored=true;
  }
  report.passed=true;report.originalWorldPublication=world;report.physicalStorageQualified=experience?false:'Node SQLite';report.devicePerformanceQualified=false;
 }catch(error){report.failure=String(error);process.exitCode=1;}
 finally{
  try{report.inputsUnchanged=Object.entries(report.sources).every(([f,h])=>fs.existsSync(path.join(root,f))&&sha256(fs.readFileSync(path.join(root,f)))===h);report.passed&&=report.inputsUnchanged;}
  finally{assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;}
  const bytes=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(bytes);fs.writeFileSync(path.join(owned,stem+'.logs.json.gz'),bytes);fs.writeFileSync(path.join(owned,stem+'.json'),JSON.stringify(report,null,2)+'\n');
 }
 assert(report.passed,report.failure);console.log({passed:true,mode,faults:report.faults.length,freshProcesses:report.runs.length,cleaned:report.cleaned,physicalStorageQualified:report.physicalStorageQualified,devicePerformanceQualified:false});
}
