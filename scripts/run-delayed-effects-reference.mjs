import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {root,sha256,verifyReference,writeJSON} from './reference-utils.mjs';
import {readDelayedRepairExpectations} from './check-delayed-contract.mjs';
const game=path.join(root,'.reference'),artifacts=path.join(root,'.artifacts');
const lockBytes=fs.readFileSync(path.join(root,'baseline/source-lock.json')),lock=JSON.parse(lockBytes);
const acceptanceBytes=fs.readFileSync(path.join(root,'baseline/milestone-forty/acceptance.json')),acceptance=JSON.parse(acceptanceBytes);
assert.equal(acceptance.schemaVersion,1);assert.equal(acceptance.milestone,40);assert.equal(acceptance.source,lock.commit);assert.equal(acceptance.sourceLockSha256,sha256(lockBytes));
assert.equal(acceptance.courses,48);assert.equal(acceptance.helpers.length,7);
const intendedRepair=readDelayedRepairExpectations().proof;
assert.deepEqual(acceptance.fixtures.map(r=>[r.name,r.courses]),[['delayed-ordering',15],['delayed-defense',14],['delayed-descent',2],['delayed-frames',7],['delayed-load',6],['delayed-stale',2],['delayed-passives',2]]);
const boundaryBytes=fs.readFileSync(path.join(root,acceptance.sourceBoundaries.file));assert.equal(sha256(boundaryBytes),acceptance.sourceBoundaries.sha256);
const boundary=JSON.parse(boundaryBytes);assert.equal(boundary.source,lock.commit);assert.equal(boundary.sourceLockSha256,sha256(lockBytes));assert.equal(boundary.world.sha256,lock.files[boundary.world.file]);
assert.deepEqual(boundary.catalogue.definitions.map(d=>d.id),['radiant_reprisal','radiant_cascade','sainted_ash','native_parting_blessing','native_song_of_return']);
for(const row of boundary.catalogue.sourceFiles)assert.equal(row.sha256,lock.files[row.file]);
verifyReference(game,lock);fs.mkdirSync(artifacts,{recursive:true});const output=fs.mkdtempSync(path.join(artifacts,'reference-delayed-effects-')),helpers=new Map(),typed=[];
for(const row of acceptance.helpers){
 const source=fs.readFileSync(path.join(root,row.file),'utf8');assert.equal(sha256(source),row.sha256,'Changed capture helper: '+row.file);
 const name=path.basename(row.file,'.ts'),runtimeFile=path.join(output,name+'.ts'),typedFile=path.join(output,name+'.typed.ts'),imports=/(['"])\.\.\/src\/([^'"]+)\1/g;
 fs.writeFileSync(runtimeFile,source.replace(imports,(_all,_q,file)=>JSON.stringify(pathToFileURL(path.join(game,'src',file+'.ts')).href)),{flag:'wx'});
 fs.writeFileSync(typedFile,source.replace(imports,(_all,_q,file)=>JSON.stringify(path.relative(output,path.join(game,'src',file)).replaceAll('\\','/'))),{flag:'wx'});
 assert(!helpers.has(row.file));helpers.set(row.file,{runtimeFile,sha256:row.sha256});typed.push(typedFile);
}
const config=path.join(output,'tsconfig.json');writeJSON(config,{extends:path.join(game,'tsconfig.sim.json'),compilerOptions:{typeRoots:[path.join(game,'node_modules/@types')]},include:[path.join(game,'src'),...typed],exclude:[]});
function run(name,args){const fd=fs.openSync(path.join(output,name+'.txt'),'wx');try{execFileSync(process.execPath,args,{cwd:game,stdio:['ignore',fd,fd]});}finally{fs.closeSync(fd);verifyReference(game,lock);}}
run('types',[path.join(game,'node_modules/typescript/bin/tsc'),'-p',config]);
const results=[];for(const row of acceptance.fixtures){
 const helper=helpers.get(row.helper);assert(helper);assert.equal(helper.sha256,row.helperSha256);assert.deepEqual(row.args,[]);
 const compressed=fs.readFileSync(path.join(root,row.file));assert.equal(sha256(compressed),row.compressedSha256,'Changed fixture: '+row.file);const expected=gunzipSync(compressed);assert.equal(sha256(expected),row.fixtureSha256);
 const destination=path.join(output,row.name+'.json');run(row.name,['--import',pathToFileURL(path.join(game,'node_modules/tsx/dist/loader.mjs')).href,helper.runtimeFile,destination]);
 const actual=fs.readFileSync(destination);assert(actual.equals(expected),'Original delayed observation changed: '+row.name);const value=JSON.parse(actual);assert.equal(value.courses,row.courses);
 if(row.name==='delayed-load')assert.deepEqual(value.loadedDelayedDefinitions,boundary.catalogue.definitions);
 results.push({name:row.name,courses:row.courses,sha256:sha256(actual),byteEqual:true});console.log('PASS original '+row.name);
}
assert.equal(results.reduce((sum,row)=>sum+row.courses,0),acceptance.courses);
writeJSON(path.join(artifacts,'delayed-effects-reference-verification.json'),{source:lock.commit,acceptanceSha256:sha256(acceptanceBytes),boundarySha256:sha256(boundaryBytes),output,helpers:7,courses:48,fixtures:results,typesPassed:true,sourceUnchanged:true,intendedRepair,scope:'Bounded original observations including unchanged failure cases. Normal verification never regenerates fixtures. Intended repair expectations are validated separately, without implementing or accepting repaired runtime behavior.'});
