import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {root,sha256,verifyReference,writeJSON} from './reference-utils.mjs';

const game=path.join(root,'.reference');
const artifacts=path.join(root,'.artifacts');
const lockBytes=fs.readFileSync(path.join(root,'baseline/source-lock.json'));
const lock=JSON.parse(lockBytes);
const acceptanceFile=path.join(root,'baseline/milestone-thirty-eight/acceptance.json');
const acceptanceBytes=fs.readFileSync(acceptanceFile);
const acceptance=JSON.parse(acceptanceBytes);
const addendumBytes=fs.readFileSync(path.join(root,'baseline/milestone-thirty-eight/dispatch-addendum.json'));
const addendum=JSON.parse(addendumBytes);
const phaseBytes=fs.readFileSync(path.join(root,'baseline/milestone-thirty-eight/host-phase-addendum.json'));
const phases=JSON.parse(phaseBytes);
assert.equal(phases.schemaVersion,1);assert.equal(phases.source,lock.commit);assert.equal(phases.sourceLockSha256,sha256(lockBytes));
assert.equal(phases.baselineAcceptanceSha256,sha256(acceptanceBytes));assert.equal(phases.dispatchAddendumSha256,sha256(addendumBytes));
assert.equal(phases.courses,7);assert.equal(phases.helpers.length,1);
assert.equal(acceptance.schemaVersion,1);
assert.equal(acceptance.source,lock.commit);
assert.equal(acceptance.sourceLockSha256,sha256(lockBytes));
assert.equal(acceptance.courses,57);
assert.equal(acceptance.helpers.length,4);
assert.deepEqual(acceptance.fixtures.map(row=>row.name),['proc-rules','proc-native','proc-ordering','proc-catalogue']);
assert.equal(addendum.schemaVersion,1);
assert.equal(addendum.source,lock.commit);
assert.equal(addendum.sourceLockSha256,sha256(lockBytes));
assert.equal(addendum.baselineAcceptanceSha256,sha256(acceptanceBytes));
assert.equal(addendum.courses,86);
assert.equal(addendum.helpers.length,4);
assert.deepEqual(addendum.fixtures.map(row=>row.name),['proc-dispatch','proc-hits','proc-frames','proc-registry']);
const acceptedCourses=acceptance.courses+addendum.courses+phases.courses;
assert.equal(acceptedCourses,150);
verifyReference(game,lock);
fs.mkdirSync(artifacts,{recursive:true});
const output=fs.mkdtempSync(path.join(artifacts,'reference-procs-'));
const helpers=new Map(),typed=[];
for(const row of [...acceptance.helpers,...addendum.helpers,...phases.helpers]){
  const source=fs.readFileSync(path.join(root,row.file),'utf8');
  assert.equal(sha256(source),row.sha256,'Changed original capture helper: '+row.file);
  const name=path.basename(row.file,'.ts');
  const runtimeFile=path.join(output,name+'.ts'),typedFile=path.join(output,name+'.typed.ts');
  const imports=/(['"])\.\.\/src\/([^'"]+)\1/g;
  fs.writeFileSync(runtimeFile,source.replace(imports,(_all,_q,file)=>JSON.stringify(pathToFileURL(path.join(game,'src',file+'.ts')).href)),{flag:'wx'});
  fs.writeFileSync(typedFile,source.replace(imports,(_all,_q,file)=>JSON.stringify(path.relative(output,path.join(game,'src',file)).replaceAll('\\','/'))),{flag:'wx'});
  helpers.set(row.file,{runtimeFile,sha256:row.sha256});
  typed.push(typedFile);
}
const config=path.join(output,'tsconfig.json');
writeJSON(config,{extends:path.join(game,'tsconfig.sim.json'),compilerOptions:{typeRoots:[path.join(game,'node_modules/@types')]},include:[path.join(game,'src'),...typed],exclude:[]});
function run(name,args){
  const fd=fs.openSync(path.join(output,name+'.txt'),'wx');
  try{execFileSync(process.execPath,args,{cwd:game,stdio:['ignore',fd,fd]});}
  finally{fs.closeSync(fd);verifyReference(game,lock);}
}
run('types',[path.join(game,'node_modules/typescript/bin/tsc'),'-p',config]);
const results=[];
for(const row of [...acceptance.fixtures,...addendum.fixtures,...phases.fixtures]){
  const helper=helpers.get(row.helper);
  assert(helper);assert.equal(helper.sha256,row.helperSha256);assert.deepEqual(row.args,[]);
  const compressed=fs.readFileSync(path.join(root,row.file));
  assert.equal(sha256(compressed),row.compressedSha256,'Changed original fixture: '+row.file);
  const expected=gunzipSync(compressed);
  assert.equal(sha256(expected),row.fixtureSha256);
  const destination=path.join(output,row.name+'.json');
  run(row.name,['--import',pathToFileURL(path.join(game,'node_modules/tsx/dist/loader.mjs')).href,helper.runtimeFile,destination]);
  const actual=fs.readFileSync(destination);
  assert(actual.equals(expected),'Original proc observation changed: '+row.name);
  const value=JSON.parse(actual);
  if(row.name==='proc-catalogue'){
    assert.equal(value.procs.length,147);assert.equal(value.riders.length,1);
    assert.equal(row.procRows,147);assert.equal(row.riderRows,1);
  }else if(row.name==='proc-host-phases')assert.equal(value.checks.length,row.courses);
  else assert.equal(value.courses,row.courses);
  results.push({name:row.name,courses:row.courses,procRows:row.procRows,riderRows:row.riderRows,sha256:sha256(actual),byteEqual:true});
  console.log('PASS original '+row.name);
}
assert.equal(results.reduce((sum,row)=>sum+(row.courses??0),0),acceptedCourses);
writeJSON(path.join(artifacts,'proc-reference-verification.json'),{
  source:lock.commit,acceptanceSha256:sha256(acceptanceBytes),addendumSha256:sha256(addendumBytes),hostPhaseAddendumSha256:sha256(phaseBytes),output,helpers:9,
  courses:acceptedCourses,procRows:147,riderRows:1,fixtures:results,typesPassed:true,
  independentAssertionsPassed:true,sourceUnchanged:true,
  scope:'Pinned original observations only. Fixtures are never regenerated by this command. No SDK proc implementation, complete effect execution or new callback-recovery guarantee is established.',
});
