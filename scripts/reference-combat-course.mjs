import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {gzipSync,gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {root,sha256,verifyReference,writeJSON} from './reference-utils.mjs';

/** New original-only courses share a compiler, never an SDK implementation.
 * Sources are pinned, observations must repeat in fresh processes, and capture
 * refuses an existing baseline. Verification cannot update expectations. */
export async function observeCombatCourse(name,work){
  assert(/^[a-z][a-z0-9-]+$/.test(name),'Invalid course name');
  const lockFile=path.join(root,'baseline/source-lock.json'),lock=JSON.parse(fs.readFileSync(lockFile));
  verifyReference(path.join(root,'.reference'),lock);
  const observerFile='reference/'+name+'.ts',observer=fs.readFileSync(path.join(root,observerFile),'utf8'),entry=path.join(work,'original.cjs');
  const compiled=await build({absWorkingDir:root,stdin:{contents:observer,loader:'ts',resolveDir:path.join(root,'.reference/balance')},
    bundle:true,platform:'node',format:'cjs',target:'es2022',outfile:entry,metafile:true,logLevel:'silent'});
  const sources={};
  for(const file of Object.keys(compiled.metafile.inputs))if(file!=='<stdin>'){
    assert(file.startsWith('.reference/'),'Observer imported nonoriginal code: '+file);
    sources[file]=sha256(fs.readFileSync(path.join(root,file)));assert.equal(sources[file],lock.files[file.slice(11)],file);
  }
  const observations=[];
  for(let i=0;i<2;i++){
    const output=path.join(work,'original-'+i+'.json');
    const result=spawnSync(process.execPath,[entry,output],{cwd:work,windowsHide:true,encoding:'utf8',timeout:240000,maxBuffer:8*1024*1024,
      env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_COMPILE_CACHE:path.join(work,'compile-cache')}});
    assert(!result.error&&!result.signal&&result.status===0,'Original course failed: '+(result.stderr??result.error));
    observations.push(fs.readFileSync(output));
  }
  assert(observations[0].equals(observations[1]),'Original observations changed across fresh processes');
  return {bytes:observations[0],sources,observerFile,observerSha256:sha256(observer),sourceLockSha256:sha256(fs.readFileSync(lockFile)),sourceCommit:lock.commit};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [name,mode]=process.argv.slice(2);assert(/^[a-z][a-z0-9-]+$/.test(name));
  assert(mode===undefined||mode==='--probe'||mode==='--capture-new');
  const owned=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(owned,'m3-original-owned-'));
  try {
    const result=await observeCombatCourse(name,work),base=path.join(root,'baseline',name);
    const {bytes,...provenance}=result,compressed=gzipSync(bytes,{level:9});
    if(mode==='--capture-new'){
      assert(!fs.existsSync(base),'Refusing to overwrite accepted original observations');fs.mkdirSync(base);
      fs.writeFileSync(path.join(base,'observations.json.gz'),compressed);
      writeJSON(path.join(base,'acceptance.json'),{schemaVersion:1,originalOnly:true,...provenance,sha256:sha256(bytes),compressedSha256:sha256(compressed)});
    }else if(mode==='--probe')fs.writeFileSync(path.join(owned,'m3-'+name+'-probe.json.gz'),compressed);
    else {
      const accepted=JSON.parse(fs.readFileSync(path.join(base,'acceptance.json'))),archive=fs.readFileSync(path.join(base,'observations.json.gz'));
      for(const key of ['sourceCommit','sourceLockSha256','observerSha256'])assert.equal(result[key],accepted[key],key);
      assert.deepEqual(result.sources,accepted.sources);assert.equal(sha256(archive),accepted.compressedSha256);
      assert.equal(sha256(bytes),accepted.sha256);assert(bytes.equals(gunzipSync(archive)));
    }
    const data=JSON.parse(bytes);writeJSON(path.join(owned,'m3-'+name+'-reference.json'),{passed:true,originalOnly:true,mode:mode??'verify',sha256:sha256(bytes),courses:data.courses.length});
    console.log({passed:true,originalOnly:true,name,courses:data.courses.length,mode:mode??'verify'});
  } finally {
    assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));
    fs.rmSync(work,{recursive:true,maxRetries:3});
  }
}
