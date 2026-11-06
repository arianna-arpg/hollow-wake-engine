import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {gzipSync,gunzipSync} from 'node:zlib';
import {root,sha256,verifyReference,writeJSON} from './reference-utils.mjs';

const ref=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
const dir=path.join(root,'baseline/workshop-supports'),capture=process.argv[2]==='--capture';
if(capture)assert(!fs.existsSync(dir),'Capture requires a new baseline');
verifyReference(ref,lock);
const parent=fs.realpathSync(path.join(root,'.artifacts')),scratch=fs.mkdtempSync(path.join(parent,'support-reference-'));
const source=fs.readFileSync(path.join(root,'reference/export-workshop-supports.ts'));
const script=path.join(ref,'balance',path.basename(scratch)+'.ts');
let owned=false;
try{
  fs.writeFileSync(script,source,{flag:'wx'});owned=true;
  function run(name){
    const output=path.join(scratch,name);
    execFileSync(process.execPath,['--import','tsx',script,output],{cwd:ref,env:{...process.env,TMP:scratch,TEMP:scratch,TMPDIR:scratch},
      windowsHide:true,stdio:['ignore','ignore','pipe'],timeout:180000});
    return fs.readFileSync(output);
  }
  const raw=run('first.json'),rows=JSON.parse(raw);
  const evidence={sourceCommit:lock.commit,sha256:sha256(raw),bytes:raw.length,skills:rows.courses.length,
    pairs:rows.courses.reduce((n,r)=>n+r.verdicts.length,0),monsters:Object.keys(rows.monsters).length};
  verifyReference(ref,lock);
  if(capture){
    assert(raw.equals(run('repeat.json')));
    const stage=path.join(scratch,'accepted');fs.mkdirSync(stage);
    fs.writeFileSync(path.join(stage,'observations.json.gz'),gzipSync(raw,{level:9}));writeJSON(path.join(stage,'acceptance.json'),evidence);
    fs.renameSync(stage,dir);
  }else{
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'acceptance.json'))),evidence);
    assert(raw.equals(gunzipSync(fs.readFileSync(path.join(dir,'observations.json.gz')))));
  }
  console.log(evidence);
}finally{
  if(owned&&fs.readFileSync(script).equals(source))fs.unlinkSync(script);
  assert.equal(path.dirname(fs.realpathSync(scratch)),parent);fs.rmSync(scratch,{recursive:true,force:true});
}
