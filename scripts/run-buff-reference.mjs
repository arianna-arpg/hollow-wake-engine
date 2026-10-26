import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {root,sha256,verifyReference,writeJSON} from './reference-utils.mjs';
import {readBuffExpectations} from './check-buff-contract.mjs';
const {acceptance,proof}=readBuffExpectations(),game=path.join(root,'.reference'),artifacts=path.join(root,'.artifacts'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
verifyReference(game,lock);const output=fs.mkdtempSync(path.join(artifacts,'reference-buffs-')),helpers=new Map(),typed=[];
for(const row of acceptance.helpers){
 const source=fs.readFileSync(path.join(root,row.file),'utf8'),name=path.basename(row.file,'.ts'),runtimeFile=path.join(output,name+'.ts'),typedFile=path.join(output,name+'.typed.ts'),imports=/(['"])\.\.\/src\/([^'"]+)\1/g;
 fs.writeFileSync(runtimeFile,source.replace(imports,(_all,_q,file)=>JSON.stringify(pathToFileURL(path.join(game,'src',file+'.ts')).href)),{flag:'wx'});
 fs.writeFileSync(typedFile,source.replace(imports,(_all,_q,file)=>JSON.stringify(path.relative(output,path.join(game,'src',file)).replaceAll('\\','/'))),{flag:'wx'});
 assert(!helpers.has(row.file));helpers.set(row.file,runtimeFile);typed.push(typedFile);
}
const config=path.join(output,'tsconfig.json');writeJSON(config,{extends:path.join(game,'tsconfig.sim.json'),compilerOptions:{typeRoots:[path.join(game,'node_modules/@types')]},include:[path.join(game,'src'),...typed],exclude:[]});
function run(name,args){const fd=fs.openSync(path.join(output,name+'.txt'),'wx');try{execFileSync(process.execPath,args,{cwd:game,stdio:['ignore',fd,fd]});}finally{fs.closeSync(fd);verifyReference(game,lock);}}
run('types',[path.join(game,'node_modules/typescript/bin/tsc'),'-p',config]);
const results=[];for(const row of acceptance.fixtures){
 const destination=path.join(output,row.name+'.json');run(row.name,['--import',pathToFileURL(path.join(game,'node_modules/tsx/dist/loader.mjs')).href,helpers.get(row.helper),destination]);
 const actual=fs.readFileSync(destination),expected=gunzipSync(fs.readFileSync(path.join(root,row.file)));assert(actual.equals(expected),'Original buff observation changed: '+row.name);assert.equal(JSON.parse(actual).courses,row.courses);
 results.push({name:row.name,courses:row.courses,sha256:sha256(actual),byteEqual:true});console.log('PASS original '+row.name);
}
assert.equal(results.reduce((sum,row)=>sum+row.courses,0),40);
writeJSON(path.join(artifacts,'buff-reference-verification.json'),{source:lock.commit,acceptanceSha256:sha256(fs.readFileSync(path.join(root,'baseline/milestone-forty-one/acceptance.json'))),output,helpers:4,courses:40,fixtures:results,typesPassed:true,sourceUnchanged:true,intendedRepair:proof,scope:'Original buff observations reproduced. The four-field correction is separately declared; runtime/adapter/performance acceptance remains pending.'});
