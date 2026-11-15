import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import {gzipSync,gunzipSync} from 'node:zlib';import {pathToFileURL} from 'node:url';import {build} from 'esbuild';
import {root,sha256,verifyReference,writeJSON} from './reference-utils.mjs';
export async function observeCharacterSession(work){
  const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(path.join(root,'.reference'),lock);
  const entry=path.join(work,'original.cjs'),observer=fs.readFileSync(path.join(root,'reference/character-session.ts'),'utf8');
  const compiled=await build({stdin:{contents:observer,loader:'ts',resolveDir:path.join(root,'.reference/balance')},bundle:true,platform:'node',format:'cjs',target:'es2022',outfile:entry,metafile:true});
  const sources={};for(const file of Object.keys(compiled.metafile.inputs))if(file!=='<stdin>'){
    assert(file.startsWith('.reference/'),'Observer imported nonoriginal code: '+file);sources[file]=sha256(fs.readFileSync(path.join(root,file)));assert.equal(sources[file],lock.files[file.slice(11)],file);
  }
  const observations=[];for(let i=0;i<2;i++){
    const output=path.join(work,'original-'+i+'.json'),run=spawnSync(process.execPath,[entry,output],{cwd:work,encoding:'utf8',windowsHide:true,timeout:240000,maxBuffer:16*1024*1024,
      env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_COMPILE_CACHE:path.join(work,'compile-cache')}});
    assert(!run.error&&!run.signal&&run.status===0,'Original course: '+(run.stderr??run.error));observations.push(fs.readFileSync(output));
  }
  assert(observations[0].equals(observations[1]),'Original course is not reproducible');
  return{bytes:observations[0],sources,observerSha256:sha256(observer),sourceLockSha256:sha256(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),sourceCommit:lock.commit};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const owned=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(owned,'m2-reference-owned-')),mode=process.argv[2];
  assert(mode===undefined||mode==='--probe'||mode==='--capture-new');let passed=false;
  try{
    const result=await observeCharacterSession(work),base=path.join(root,'baseline/character-session');
    if(mode==='--capture-new'){
      assert(!fs.existsSync(base),'Refusing to overwrite frozen observations');fs.mkdirSync(base);
      const compressed=gzipSync(result.bytes,{level:9});fs.writeFileSync(path.join(base,'observations.json.gz'),compressed);
      writeJSON(path.join(base,'acceptance.json'),{schemaVersion:1,originalOnly:true,expectedObservationsRegenerated:false,sourceCommit:result.sourceCommit,
        sourceLockSha256:result.sourceLockSha256,observerSha256:result.observerSha256,sha256:sha256(result.bytes),compressedSha256:sha256(compressed),sources:result.sources});
    }else if(mode!=='--probe'){
      const accepted=JSON.parse(fs.readFileSync(path.join(base,'acceptance.json'))),archive=fs.readFileSync(path.join(base,'observations.json.gz'));
      assert.equal(result.observerSha256,accepted.observerSha256);assert.equal(result.sourceLockSha256,accepted.sourceLockSha256);assert.equal(sha256(archive),accepted.compressedSha256);
      assert.equal(sha256(result.bytes),accepted.sha256);assert(result.bytes.equals(gunzipSync(archive)));assert.deepEqual(result.sources,accepted.sources);
    }
    if(mode==='--probe')fs.writeFileSync(path.join(owned,'m2-original-probe.json.gz'),gzipSync(result.bytes));
    const courses=JSON.parse(result.bytes).courses;writeJSON(path.join(owned,'m2-reference.json'),{passed:true,originalOnly:true,mode:mode??'verify',sha256:sha256(result.bytes),courses:courses.map(c=>({id:c.spec.id,steps:c.steps.length,damage:c.hit.result.total}))});passed=true;
    console.log({passed:true,courses:courses.length,observations:courses.reduce((n,c)=>n+c.steps.length+1,0),originalOnly:true});
  }finally{assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});if(!passed)console.error('Original course failed; owned temporary files removed.');}
}
