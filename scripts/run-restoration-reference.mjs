import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {root,sha256,verifyReference,writeJSON} from './reference-utils.mjs';
import {readRestorationExpectations} from './check-restoration-contract.mjs';

const contract=readRestorationExpectations(),{acceptance,boundaries,fixtures,helpers,rows}=contract;
const game=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,acceptance.sourceLock)));
const output=fs.mkdtempSync(path.join(root,'.artifacts/reference-restoration-'));
verifyReference(game,lock);
for(const owner of Object.values(boundaries.original))
  assert.equal(sha256(fs.readFileSync(path.join(game,owner.file))),owner.fileSha256);
const typed=[],runtime=new Map(),imports=/(['"])\.\.\/src\/([^'"]+)\1/g;
for(const row of helpers) {
  const source=fs.readFileSync(path.join(root,row.file),'utf8'),name=path.basename(row.file);
  const file=path.join(output,name),type=path.join(output,name.replace('.ts','.typed.ts'));
  fs.writeFileSync(file,source.replace(imports,(_a,_q,p)=>JSON.stringify(pathToFileURL(path.join(game,'src',p+'.ts')).href)),{flag:'wx'});
  fs.writeFileSync(type,source.replace(imports,(_a,_q,p)=>JSON.stringify(path.relative(output,path.join(game,'src',p)).replaceAll('\\','/'))),{flag:'wx'});
  typed.push(type);runtime.set(row.file,file);
}
const config=path.join(output,'tsconfig.json');
writeJSON(config,{extends:path.join(game,'tsconfig.sim.json'),compilerOptions:{typeRoots:[path.join(game,'node_modules/@types')]},include:typed,exclude:[]});
function run(name,args) {
  const fd=fs.openSync(path.join(output,name+'.txt'),'wx');
  try {execFileSync(process.execPath,args,{cwd:game,stdio:['ignore',fd,fd],windowsHide:true,timeout:180000});}
  finally {fs.closeSync(fd);verifyReference(game,lock);readRestorationExpectations();}
}
run('types',[path.join(game,'node_modules/typescript/bin/tsc'),'-p',config]);
const results=[];
for(const row of rows) {
  const destination=path.join(output,row.name+'.json');
  run(row.name,['--import',pathToFileURL(path.join(game,'node_modules/tsx/dist/loader.mjs')).href,runtime.get(row.helper),destination]);
  const actual=fs.readFileSync(destination);assert(actual.equals(fixtures.get(row.name).bytes),'Native restoration changed: '+row.name);
  results.push({name:row.name,courses:row.courses,sha256:sha256(actual),byteEqual:true});
  console.log('PASS native '+row.name+' ('+row.courses+')');
}
writeJSON(path.join(root,'.artifacts/restoration-reference-verification.json'),{source:lock.commit,output,courses:218,
  fixtures:results,typesPassed:true,sourceUnchanged:true,expectedFilesRewritten:false,
  acceptanceSha256:sha256(fs.readFileSync(path.join(root,contract.acceptanceFile))),
  scope:'Reproduces the accepted native baseline. SDK implementation, adapter, renderer, performance and device acceptance remain separate.'});
