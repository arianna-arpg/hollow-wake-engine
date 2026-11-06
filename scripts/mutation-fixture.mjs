import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {buildSync} from 'esbuild';
import {root,sha256} from './reference-utils.mjs';

export function readMutationSource(relative){
  return fs.readFileSync(path.join(root,relative),'utf8');
}
/** Discover static dependencies, then run the actual unbundled Node tests.
 * Every fault gets a fresh process. A single private fixture is reused and
 * removed on either outcome. Only the compact evidence file survives. */
export function runMutationFixture({suite,testFile,hashField='mutationSha256',metadata={}},exercise){
  assert(/^[a-z][a-z0-9-]*$/.test(suite));
  const base=fs.realpathSync(os.tmpdir()),results=[],logs=[];
  const graph=buildSync({absWorkingDir:root,entryPoints:[testFile],bundle:true,write:false,metafile:true,platform:'node',format:'esm'});
  const inputs=Object.keys(graph.metafile.inputs);
  assert(inputs.includes(testFile));
  const original=new Map();
  for(const relative of inputs){
    assert(/^(dist|test|examples)\/[\w./-]+$/.test(relative)&&!relative.split('/').includes('..'),relative);
    const file=path.join(root,relative);assert(fs.statSync(file).isFile());
    original.set(relative,fs.readFileSync(file));
  }
  const output=path.join(root,'.artifacts');fs.mkdirSync(output,{recursive:true});
  const dir=fs.mkdtempSync(path.join(base,'hwe-mutations-'));
  let passed=false;
  function run(){
    const r=spawnSync(process.execPath,['--test',testFile],{cwd:dir,encoding:'utf8',windowsHide:true,timeout:30000,
      env:{...process.env,NODE_PATH:'',NODE_DISABLE_COMPILE_CACHE:'1'}});
    if(r.error)throw r.error;
    assert.equal(r.signal,null);return {status:r.status,log:(r.stdout??'')+(r.stderr??'')};
  }
  try{
    const manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
    fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({name:manifest.name,type:'module',exports:manifest.exports}));
    for(const [relative,bytes] of original){
      const file=path.join(dir,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes,{flag:'wx'});
    }
    const clean=run();assert.equal(clean.status,0,'Pristine fixture failed: '+clean.log);
    exercise((name,target,changed)=>{
      const bytes=original.get(target);assert(bytes,'Fault target outside test graph: '+target);
      assert(!bytes.equals(Buffer.from(changed)),'Fault did not change '+target);
      const file=path.join(dir,target);
      fs.writeFileSync(file,changed);
      try{
        const {status,log}=run();logs.push({name,log});
        assert.equal(status,1,name+' survived');
        assert(!/SyntaxError|ReferenceError|TypeError|ERR_MODULE_NOT_FOUND/.test(log),name+' failed for an unrelated reason: '+log);
        // Several contracts throw an explicit sentinel when a forbidden host
        // port is read. Those failures are just as observable as assert calls.
        assert(/(?:ℹ |# )fail [1-9]/.test(log),name+' did not fail a test: '+log);
        results.push({name,detected:true,logSha256:sha256(log),[hashField]:sha256(changed)});
      }finally{fs.writeFileSync(file,bytes);}
    });
    for(const [relative,bytes] of original)assert(fs.readFileSync(path.join(root,relative)).equals(bytes),'Concurrent source change: '+relative);
    passed=true;
  }finally{
    try{
      const receipt={passed,...metadata,fixtureFiles:inputs.length+1,inputs,results,
        logs:{format:'gzip-json-utf8',base64:gzipSync(Buffer.from(JSON.stringify(logs))).toString('base64')}};
      const file=path.join(output,suite+(passed?'-mutations.json':'-mutation-failure.json'));
      const temp=file+'.'+randomUUID()+'.tmp';
      try{fs.writeFileSync(temp,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});fs.renameSync(temp,file);}
      finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
    }finally{
      assert.equal(path.dirname(fs.realpathSync(dir)),base);fs.rmSync(dir,{recursive:true,maxRetries:3,retryDelay:100});
    }
  }
  console.log({passed,faults:results.length,fixtureFiles:inputs.length+1});
}
