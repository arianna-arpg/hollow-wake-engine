import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {gzipSync,gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {root,verifyReference,sha256,writeJSON} from './reference-utils.mjs';

const args=process.argv.slice(2),capture=args[0]==='--capture';
assert(args.length===0||(capture&&args.length===2&&['skill-rack','skill-rack-resume'].includes(args[1])));
const ref=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
function counts(name,data){
  if(name==='skill-rack-resume'){
    assert.equal(data.length,6);
    assert(data.some(r=>r.inputBar.length===0)&&data.some(r=>r.inputBar.length>r.capacity));
    return {cases:data.length};
  }
  const {courses,all}=data,steps=courses.flatMap(c=>c.steps);
  assert.equal(all.length,954);assert.equal(new Set(all.map(s=>s.id)).size,all.length);
  assert.equal(new Set(steps.map(s=>s.label)).size,steps.length);
  return {skills:all.length,courses:courses.length,steps:steps.length,refusals:steps.filter(s=>s.result===false).length,
    refusedAfterMint:steps.filter(s=>s.result===false&&s.allocated>0).map(s=>s.label)};
}
function replay(name){
  const accepted=path.join(root,'baseline',name);
  if(capture)assert(!fs.existsSync(accepted),'Original observations already frozen: '+name);
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'hwe-rack-reference-'));
  const source=fs.readFileSync(path.join(root,'reference','export-'+name+'.ts'));
  const file=path.join(ref,'balance',path.basename(work)+'.ts');
  let created=false,stage;
  function run(label){
    const out=path.join(work,label+'.json');
    execFileSync(process.execPath,['--import','tsx',file,out],{cwd:ref,stdio:'inherit',windowsHide:true});
    return fs.readFileSync(out);
  }
  try{
    fs.writeFileSync(file,source,{flag:'wx'});created=true;
    const bytes=run('first');
    if(capture)assert(bytes.equals(run('repeat')),'Original replay differed');
    const manifest={schemaVersion:1,sourceCommit:lock.commit,bytes:bytes.length,sha256:sha256(bytes),...counts(name,JSON.parse(bytes))};
    verifyReference(ref,lock);
    if(capture){
      stage=fs.mkdtempSync(path.join(root,'baseline','.capture-rack-'));
      fs.writeFileSync(path.join(stage,'observations.json.gz'),gzipSync(bytes,{level:9}));
      writeJSON(path.join(stage,'acceptance.json'),manifest);
      fs.renameSync(stage,accepted);stage=undefined;
    }else{
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(accepted,'acceptance.json'))),manifest);
      assert(bytes.equals(gunzipSync(fs.readFileSync(path.join(accepted,'observations.json.gz')))));
    }
    console.log(name,manifest);
  }finally{
    if(created&&fs.existsSync(file)&&fs.readFileSync(file).equals(source))fs.unlinkSync(file);
    if(stage){
      assert.equal(path.dirname(fs.realpathSync(stage)),fs.realpathSync(path.join(root,'baseline')));
      fs.rmSync(stage,{recursive:true});
    }
    assert.equal(path.dirname(fs.realpathSync(work)),fs.realpathSync(os.tmpdir()));
    fs.rmSync(work,{recursive:true});
  }
}
verifyReference(ref,lock);
for(const name of capture?[args[1]]:['skill-rack','skill-rack-resume'])replay(name);
