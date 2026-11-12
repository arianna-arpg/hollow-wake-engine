import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {gzipSync,gunzipSync} from 'node:zlib';
import {build} from 'esbuild';import {root,sha256,verifyReference} from './reference-utils.mjs';
const owned=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(owned,'character-build-reference-owned-'));
const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),report={passed:false,originalOnly:true,runs:[],sources:{}},logs={};
try{
  verifyReference(path.join(root,'.reference'),lock);
  report.observations=0;
  for(const course of ['character-builds','character-build-classes']){
  const base='baseline/'+course,accepted=JSON.parse(fs.readFileSync(path.join(root,base,'acceptance.json'))),source=fs.readFileSync(path.join(root,accepted.source),'utf8');
  assert.equal(sha256(source),accepted.sourceSha256);const expected=gunzipSync(fs.readFileSync(path.join(root,base,'observations.json.gz')));assert.equal(sha256(expected),accepted.sha256);
  const entry=path.join(work,course+'.cjs'),result=await build({stdin:{contents:source,loader:'ts',resolveDir:path.join(root,'.reference/balance')},bundle:true,platform:'node',format:'cjs',target:'es2022',outfile:entry,metafile:true});
  for(const file of Object.keys(result.metafile.inputs))if(file!=='<stdin>'){
    assert(file.startsWith('.reference/'),file);assert.equal(sha256(fs.readFileSync(path.join(root,file))),lock.files[file.slice('.reference/'.length)],file);report.sources[file]=lock.files[file.slice('.reference/'.length)];
  }
  for(const file of [accepted.source,'baseline/source-lock.json',base+'/acceptance.json',base+'/observations.json.gz','scripts/reference-character-builds.mjs'])report.sources[file]=sha256(fs.readFileSync(path.join(root,file)));
  for(let n=0;n<2;n++){
    const output=path.join(work,course+'-'+n+'.json'),child=spawnSync(process.execPath,[entry,output],{cwd:work,windowsHide:true,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024,
      env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_COMPILE_CACHE:path.join(work,'compile-cache')}});
    logs[course+n]={stdout:child.stdout,stderr:child.stderr};assert(!child.error&&!child.signal&&child.status===0,JSON.stringify(logs[course+n]).slice(-8000));
    const bytes=fs.readFileSync(output);assert(bytes.equals(expected),'Original character build observations changed');report.runs.push({course,sha256:sha256(bytes)});
  }
  report.observations+=accepted.observations;
  }
  report.passed=true;
}catch(error){report.error=String(error);process.exitCode=1;}
finally{
  try{verifyReference(path.join(root,'.reference'),lock);report.inputsUnchanged=Object.entries(report.sources).every(([f,h])=>sha256(fs.readFileSync(path.join(root,f)))===h);assert(report.inputsUnchanged);}
  catch(error){report.error=String(error);report.passed=false;process.exitCode=1;}
  assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;
  const bytes=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(bytes);fs.writeFileSync(path.join(owned,'character-build-reference.logs.json.gz'),bytes);
  fs.writeFileSync(path.join(owned,'character-build-reference.json'),JSON.stringify(report,null,2)+'\n');
}
console.log({passed:report.passed,originalOnly:report.originalOnly,observations:report.observations,runs:report.runs,cleaned:report.cleaned,error:report.error});
