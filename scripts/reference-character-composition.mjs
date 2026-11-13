import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gzipSync,gunzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';import {build} from 'esbuild';import {root,sha256,verifyReference} from './reference-utils.mjs';
const owned=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(owned,'character-composition-original-owned-'));
const read=file=>fs.readFileSync(path.join(root,file)),report={passed:false,originalOnly:true,expectedObservationsRegenerated:false,sources:{},fixtures:[]},logs={};
const capture=file=>{const bytes=read(file);report.sources[file]=sha256(bytes);return bytes;};
try{
 capture('scripts/reference-character-composition.mjs');const acceptance=JSON.parse(capture('baseline/character-composition/acceptance.json'));
 const lockBytes=capture('baseline/source-lock.json'),lock=JSON.parse(lockBytes);assert.equal(sha256(lockBytes),acceptance.sourceLockSha256);assert.equal(lock.commit,acceptance.sourceCommit);
 const load=(name,kind)=>{
  const compressed=capture('baseline/character-composition/'+name+'.json.gz'),metadata=acceptance.archives[kind];
  assert.equal(sha256(compressed),metadata.archiveSha256);const plain=gunzipSync(compressed);assert.equal(sha256(plain),metadata.sha256);return JSON.parse(plain);
 };
 const fixtures=load('original-fixtures','fixtures').fixtures,generators=load('original-generators','generators').generators;
 assert.deepEqual(Object.keys(fixtures),Object.keys(generators));assert.equal(Object.keys(fixtures).length,11);
 verifyReference(path.join(root,'.reference'),lock);
 for(const[name,fixture]of Object.entries(fixtures)){
  const generator=generators[name];assert.equal(sha256(generator.utf8),generator.sha256);assert.equal(sha256(fixture.utf8),fixture.sha256);
  const entry=path.join(work,'original.cjs'),result=await build({stdin:{contents:generator.utf8,loader:'ts',resolveDir:path.join(root,'.reference/balance')},
   bundle:true,platform:'node',format:'cjs',target:'es2022',outfile:entry,metafile:true,logLevel:'silent'});
  for(const file of Object.keys(result.metafile.inputs))if(file!=='<stdin>'){
   assert(file.startsWith('.reference/'),'Non-original source: '+file);assert.equal(sha256(capture(file)),lock.files[file.slice(11)]);
  }
  const runs=[];
  for(let n=0;n<2;n++){
   const output=path.join(work,'actual.json'),child=spawnSync(process.execPath,[entry,output],{cwd:work,windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024,
    env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_COMPILE_CACHE:path.join(work,'compile-cache')}});
   logs[name+'-'+n]={stdout:child.stdout,stderr:child.stderr};assert(!child.error&&!child.signal&&child.status===0,child.stderr??String(child.error));
   const actual=fs.readFileSync(output);assert(actual.equals(Buffer.from(fixture.utf8)),name+' differs from frozen original observations');runs.push(sha256(actual));fs.unlinkSync(output);
  }
  const observations=JSON.parse(fixture.utf8).original.length;assert.equal(observations,acceptance.archives.fixtures.entries[name].observations);
  report.fixtures.push({name,observations,runs,generatorSha256:generator.sha256});console.log({verified:name,observations});
 }
 verifyReference(path.join(root,'.reference'),lock);report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(read(file))===hash);report.passed&&=report.inputsUnchanged;
 assert.equal(path.dirname(fs.realpathSync(work)),owned);fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;
 const bytes=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(bytes);fs.writeFileSync(path.join(owned,'character-composition-original.logs.json.gz'),bytes);
 fs.writeFileSync(path.join(owned,'character-composition-original.json'),JSON.stringify(report,null,2)+'\n');
}
assert(report.passed,report.failure);console.log({passed:true,fixtures:report.fixtures.length,originalOnly:true,unchanged:report.inputsUnchanged,cleaned:true});
