import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {nativeEnvironment} from './native-tools.mjs';

const [output,...extra]=process.argv.slice(2);
assert(output && (extra.length===0 || (extra.length===1 && extra[0]==='--mutations')) && !fs.existsSync(output),'Choose a fresh output receipt');
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const dir=fs.mkdtempSync(path.join(root,'.artifacts/save-worker-'));
const priorTemp=Object.fromEntries(['TEMP','TMP','TMPDIR'].map(key=>[key,process.env[key]]));
for(const key of Object.keys(priorTemp))process.env[key]=dir;
try {
  const env={...nativeEnvironment(dir),TEMP:dir,TMP:dir,TMPDIR:dir};
  const source=path.join(root,'test/local-save-worker.cpp');
  const executable=path.join(dir,process.platform==='win32'?'worker.exe':'worker');
  const args=process.platform==='win32'
    ? ['/nologo','/std:c++17','/EHsc','/O2','/W4','/WX','/MT',source,'/Fe:'+executable,'/Fo:'+path.join(dir,'worker.obj')]
    : ['-std=c++17','-O2','-Wall','-Wextra','-Werror','-pthread',source,'-o',executable];
  const compiler=process.platform==='win32'?'cl.exe':process.env.CXX??'c++';
  const build=execFileSync(compiler,args,{cwd:dir,env,encoding:'utf8',windowsHide:true,timeout:120000});
  const checks=JSON.parse(execFileSync(executable,[],{cwd:dir,env,encoding:'utf8',windowsHide:true,timeout:30000}));
  assert(checks.passed);
  const mutations=[];
  if(extra.length){
    const header='adapters/godot/local-save/write-worker.hpp';
    const original=fs.readFileSync(path.join(root,header),'utf8');
    const cases=[
      ['overlap','if (stopping || phase != Phase::idle) return {"unavailable"};','if (stopping) return {"unavailable"};','reason(worker.submit({}), "unavailable")'],
      ['ticket','if (!expected || expected != ticket || phase == Phase::idle) return {};','if (!expected || phase == Phase::idle) return {};','!worker.poll(queued.token + 1).valid'],
      ['late-cancel','if (phase == Phase::committing || phase == Phase::done)','if (phase == Phase::done)','reason(worker.cancel(queued.token), "too-late")'],
      ['lost-cancel','cancelled = true;\n        return {};','cancelled = false;\n        return {};','reason(finish(worker, queued.token).result, "cancelled")'],
      ['rollback','reply = backend.cancel(reply.token);','reply = {};','backend.stages == 1 && backend.cancels == 1 && backend.commits == 0'],
      ['consume','if (!reply.pending) {\n            phase = Phase::idle;','if (!reply.pending) {\n            phase = Phase::done;','!worker.poll(queued.token).valid'],
      ['reopen-alias','stopping = false;\n    }','stopping = false; sequence = 0;\n    }','reopened.ok() && reopened.token > next.token'],
      ['commit-failure','reply = backend.commit(reply.token);','backend.commit(reply.token); reply = {};','reason(p.result, stage_failure ? "stale-revision" : "busy")']
    ];
    for(const [name,from,to,expected] of cases){
      assert.equal(original.split(from).length,2,name+' mutation anchor');
      const folder=path.join(dir,name),copy=path.join(folder,'test/local-save-worker.cpp');
      fs.mkdirSync(path.dirname(copy),{recursive:true});
      fs.mkdirSync(path.dirname(path.join(folder,header)),{recursive:true});
      fs.copyFileSync(source,copy);
      fs.writeFileSync(path.join(folder,header),original.replace(from,to));
      execFileSync(compiler,args.map(a=>a===source?copy:a),{cwd:dir,env,encoding:'utf8',windowsHide:true,timeout:120000});
      let detected=false;
      try{execFileSync(executable,[],{cwd:dir,env,encoding:'utf8',windowsHide:true,timeout:30000,stdio:'pipe'});}
      catch(error){
        const stderr=String(error.stderr??'');
        assert.equal(error.status,1,name+': '+stderr);
        assert(stderr.includes('Failed: '+expected),name+': '+stderr);
        detected=true;
      }
      assert(detected,name+' escaped');
      mutations.push({name,detected});
    }
  }
  const files=['adapters/godot/local-save/write-worker.hpp','test/local-save-worker.cpp','scripts/test-save-worker.mjs'];
  writeJSON(path.resolve(output),{platform:process.platform,arch:process.arch,...checks,mutations,
    sources:Object.fromEntries(files.map(f=>[f,sha256(fs.readFileSync(path.join(root,f)))])),buildSha256:sha256(build)});
  console.log(checks);
} finally {
  for(const [key,value] of Object.entries(priorTemp)){
    if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
  assert(path.dirname(dir)===path.join(root,'.artifacts'));
  fs.rmSync(dir,{recursive:true,force:true});
}
