import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {root,sha256,verifyReference,writeJSON} from './reference-utils.mjs';
import {readLifeRecoveryExpectations} from './check-life-recovery-contract.mjs';
const {acceptance,boundaries,fixtures,helpers:captureHelpers,rows,courses}=readLifeRecoveryExpectations(),game=path.join(root,'.reference'),
  lock=JSON.parse(fs.readFileSync(path.join(root,acceptance.sourceLock))),output=fs.mkdtempSync(path.join(root,'.artifacts/reference-life-recovery-'));
verifyReference(game,lock);
assert.equal(sha256(fs.readFileSync(path.join(game,boundaries.actor.path))),boundaries.actor.sha256);
assert.equal(sha256(fs.readFileSync(path.join(game,boundaries.proc.path))),boundaries.proc.fileSha256);
const typed=[],helpers=new Map();
for(const row of captureHelpers){
  const source=fs.readFileSync(path.join(root,row.file),'utf8'),name=path.basename(row.file),
    runtime=path.join(output,name),type=path.join(output,name.replace('.ts','.typed.ts')),imports=/(['"])\.\.\/src\/([^'"]+)\1/g;
  fs.writeFileSync(runtime,source.replace(imports,(_a,_q,p)=>JSON.stringify(pathToFileURL(path.join(game,'src',p+'.ts')).href)),{flag:'wx'});
  fs.writeFileSync(type,source.replace(imports,(_a,_q,p)=>JSON.stringify(path.relative(output,path.join(game,'src',p)).replaceAll('\\','/'))),{flag:'wx'});
  typed.push(type);helpers.set(row.file,runtime);
}
const config=path.join(output,'tsconfig.json');writeJSON(config,{extends:path.join(game,'tsconfig.sim.json'),compilerOptions:{typeRoots:[path.join(game,'node_modules/@types')]},include:typed,exclude:[]});
function run(name,args){const fd=fs.openSync(path.join(output,name+'.txt'),'wx');try{
  execFileSync(process.execPath,args,{cwd:game,stdio:['ignore',fd,fd],windowsHide:true,timeout:180000});
}finally{fs.closeSync(fd);verifyReference(game,lock);readLifeRecoveryExpectations();}}
run('types',[path.join(game,'node_modules/typescript/bin/tsc'),'-p',config]);
const results=[];
for(const row of rows){
  const destination=path.join(output,row.name+'.json');run(row.name,['--import',pathToFileURL(path.join(game,'node_modules/tsx/dist/loader.mjs')).href,helpers.get(row.helper),destination]);
  const actual=fs.readFileSync(destination);assert(actual.equals(fixtures.get(row.name).bytes),'Original recovery changed: '+row.name);
  results.push({name:row.name,courses:row.courses,sha256:sha256(actual),byteEqual:true});console.log('PASS original '+row.name+' ('+row.courses+')');
}
writeJSON(path.join(root,'.artifacts/life-recovery-reference-verification.json'),{source:lock.commit,output,courses,fixtures:results,typesPassed:true,sourceUnchanged:true,
  acceptanceSha256:sha256(fs.readFileSync(path.join(root,'baseline/milestone-forty-two/acceptance.json'))),
  methodResolutionAddendumSha256:sha256(fs.readFileSync(path.join(root,'baseline/milestone-forty-two/method-resolution-addendum.json'))),
  scope:'Original recovery baseline reproduced; implementation, adapter, performance, renderer and device acceptance are separate gates.'});
