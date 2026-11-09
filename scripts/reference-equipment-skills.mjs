import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {randomUUID} from 'node:crypto';import {gzipSync,gunzipSync} from 'node:zlib';
import {root,verifyReference,sha256} from './reference-utils.mjs';
import {renderEquipmentSkillProbe} from './equipment-skill-reference.mjs';
const capture=process.argv[2]==='--initial-capture';assert(process.argv.length===(capture?3:2));
const ref=path.join(root,'.reference'),dir=path.join(root,'baseline/equipment-skills');
if(capture)assert(!fs.existsSync(dir),'Initial capture refuses existing expected observations');
const lockBytes=fs.readFileSync(path.join(root,'baseline/source-lock.json')),lock=JSON.parse(lockBytes);
verifyReference(ref,lock);fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const work=fs.mkdtempSync(path.join(root,'.artifacts/equipment-skills-reference-owned-'));
const helperPath='reference/equipment-skill-observer.ts',helper=fs.readFileSync(path.join(root,helperPath));
const helperFile=path.join(ref,'balance','hwe-equipment-skills-helper-'+randomUUID()+'.ts'),created=[];
const results={},receipt={passed:false,capture,sourceLockSha256:sha256(lockBytes),helper:helperPath,helperSha256:sha256(helper)};
try{
 fs.writeFileSync(helperFile,helper,{flag:'wx'});created.push(helperFile);
 for(const [name,count] of [['legends',60],['slotgraft',36]]){
  const sourcePath='balance/probe_'+name+'.ts',source=fs.readFileSync(path.join(ref,sourcePath),'utf8');
  assert.equal(sha256(source),lock.files[sourcePath]);
  const file=path.join(ref,'balance','hwe-equipment-skills-probe-'+randomUUID()+'.ts');created.push(file);
  fs.writeFileSync(file,renderEquipmentSkillProbe(source,'./'+path.basename(helperFile)),{flag:'wx'});
  const run=n=>{const output=path.join(work,name+'-'+n+'.json');execFileSync(process.execPath,['--import','tsx',file,output],{cwd:ref,windowsHide:true,stdio:'pipe',maxBuffer:4*1024*1024,timeout:180000});return fs.readFileSync(output);};
  const first=run(1),second=run(2);assert.deepEqual(second,first,name+' fresh processes differ');const data=JSON.parse(first);assert.equal(data.rows.length,count);
  const packed=gzipSync(first,{level:9});results[name]={source:sourcePath,sourceSha256:sha256(source),cases:count,worlds:data.worlds,sha256:sha256(first),gzipSha256:sha256(packed)};
  if(capture){fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,name+'.json.gz'),packed,{flag:'wx'});}
  else{const expected=fs.readFileSync(path.join(dir,name+'.json.gz'));assert.deepEqual(first,gunzipSync(expected));}
  console.log({name,cases:count,passed:true});
 }
 const manifest={schemaVersion:1,scope:'Original skill-grant and worn-support lifecycle probes with complete observed owner state',sourceLockSha256:sha256(lockBytes),helper:helperPath,helperSha256:sha256(helper),rendererSha256:sha256(fs.readFileSync(path.join(root,'scripts/equipment-skill-reference.mjs'))),freshProcessesPerProbe:2,results};
 if(capture)fs.writeFileSync(path.join(dir,'acceptance.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 else assert.deepEqual(manifest,JSON.parse(fs.readFileSync(path.join(dir,'acceptance.json'))));
 receipt.passed=true;receipt.results=results;
}finally{
 try{verifyReference(ref,lock);assert.equal(sha256(fs.readFileSync(path.join(root,helperPath))),sha256(helper));receipt.inputsUnchanged=true;}
 finally{for(const file of created)if(fs.existsSync(file))fs.unlinkSync(file);const actual=fs.realpathSync(work);assert.equal(path.dirname(actual),fs.realpathSync(path.join(root,'.artifacts')));assert(path.basename(actual).startsWith('equipment-skills-reference-owned-'));fs.rmSync(actual,{recursive:true});receipt.cleaned=!fs.existsSync(actual)&&created.every(f=>!fs.existsSync(f));fs.writeFileSync(path.join(root,'.artifacts/equipment-skills-reference-'+randomUUID()+'.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});}
}
