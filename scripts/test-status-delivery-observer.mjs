import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';import {gzipSync,gunzipSync} from 'node:zlib';import ts from 'typescript';
import {root,materialize,verifyReference,sha256,writeJSON} from './reference-utils.mjs';
import {statusDeliveryFaults,applyStatusDeliveryFault} from './status-delivery-observer-faults.mjs';
import {statusDeliveryTree} from '../adapters/hollow-wake/status-delivery-tree.mjs';
import {assertStatusDeliveryObservations} from './status-delivery-observation-checks.mjs';
const args=process.argv.slice(2);assert(args.length===0||args.length===2&&args[0]==='--acceptance');
const acceptedFile=path.resolve(root,args[1]??'baseline/status-delivery/acceptance.json'),acceptedBytes=fs.readFileSync(acceptedFile),capture=JSON.parse(acceptedBytes);
assert.equal(capture.schemaVersion,1);assert.equal(capture.courses,88);assert.equal(statusDeliveryFaults.length,52);
const tracked=new Map([[acceptedFile,sha256(acceptedBytes)]]);
for(const file of ['scripts/test-status-delivery-observer.mjs','scripts/status-delivery-observer-faults.mjs','adapters/hollow-wake/status-delivery-tree.mjs']){const absolute=path.join(root,file);tracked.set(absolute,sha256(fs.readFileSync(absolute)));}
for(const[file,hash]of [[capture.helper,capture.helperSha256],[capture.positiveAssertions,capture.positiveAssertionsSha256],[capture.sourceBoundary,capture.sourceBoundarySha256],[capture.observations,capture.compressedSha256]]){const absolute=path.join(root,file);assert.equal(sha256(fs.readFileSync(absolute)),hash,file);tracked.set(absolute,hash);}
const boundary=JSON.parse(fs.readFileSync(path.join(root,capture.sourceBoundary))),lockFile=path.join(root,'baseline/source-lock.json');assert.equal(sha256(fs.readFileSync(lockFile)),boundary.sourceLockSha256);tracked.set(lockFile,boundary.sourceLockSha256);
const expected=gunzipSync(fs.readFileSync(path.join(root,capture.observations)));assert.equal(sha256(expected),capture.observationsSha256);const expectedValue=JSON.parse(expected);assertStatusDeliveryObservations(expectedValue);
const lock=JSON.parse(fs.readFileSync(lockFile)),directory=fs.mkdtempSync(path.join(root,'.artifacts/status-delivery-observer-faults-')),game=path.join(directory,'game');
materialize(null,lock,game);verifyReference(game,lock);fs.symlinkSync(fs.realpathSync(path.join(root,'.reference/node_modules')),path.join(game,'node_modules'),process.platform==='win32'?'junction':'dir');
const file=path.join(game,'src/engine/world.ts'),bytes=fs.readFileSync(file),tree=statusDeliveryTree(bytes.toString());
for(const[name,row]of Object.entries(boundary.maps.original.branches))assert.equal(sha256(tree.branches[name].getText(tree.ast)),row.sha256,name);
assert.equal(sha256(tree.field.getText(tree.ast)),boundary.maps.original.recallIdentity.fieldSha256);assert.equal(sha256(tree.retirement.getText(tree.ast)),boundary.maps.original.recallIdentity.retirementSha256);
for(const fault of statusDeliveryFaults)assert.equal(ts.createSourceFile(file,applyStatusDeliveryFault(tree,fault),ts.ScriptTarget.Latest,true).parseDiagnostics.length,0,fault[0]);
const runtime=path.join(directory,'capture.ts'),helper=fs.readFileSync(path.join(root,capture.helper),'utf8');fs.writeFileSync(runtime,helper.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,(_a,_q,f)=>JSON.stringify(pathToFileURL(path.join(game,'src',f+'.ts')).href)),{flag:'wx'});
const errors=data=>data.rows.flatMap(r=>r.steps.filter(s=>s.error!==null).map(s=>[r.name,s.error])),expectedErrors=errors(expectedValue),results=[];
const first=new Set(['recall-burst-type','recall-definition']),ordered=[...statusDeliveryFaults.filter(f=>first.has(f[0])),...statusDeliveryFaults.filter(f=>!first.has(f[0]))];assert.equal(new Set(ordered.map(f=>f[0])).size,52);
let passed=false;
try{
 for(const fault of [['control',null],...ordered]){
  const[name,section]=fault;if(section!==null)fs.writeFileSync(file,applyStatusDeliveryFault(tree,fault));
  const out=path.join(directory,name+'.json'),log=path.join(directory,name+'.txt'),fd=fs.openSync(log,'wx');
  try{execFileSync(process.execPath,['--import',pathToFileURL(path.join(game,'node_modules/tsx/dist/loader.mjs')).href,runtime,out],{cwd:game,windowsHide:true,timeout:180000,stdio:['ignore',fd,fd]});}finally{fs.closeSync(fd);fs.writeFileSync(file,bytes);}
  const actual=fs.readFileSync(out),value=JSON.parse(actual),matches=actual.equals(expected),compressed=gzipSync(actual,{level:9});assert(gunzipSync(compressed).equals(actual));fs.writeFileSync(out+'.gz',compressed,{flag:'wx'});fs.unlinkSync(out);
  assert.equal(value.courses,capture.courses);assert.deepEqual(value.rows.map(r=>r.name),expectedValue.rows.map(r=>r.name));
  // Only disappearance of an intentionally interrupted callback is permitted.
  // Native crashes, new runtime errors and unrelated exceptions never count.
  for(const[course,error]of errors(value))assert.equal(error,expectedErrors.find(e=>e[0]===course)?.[1],'Unrelated exception: '+name+'/'+course);
  assert.equal(matches,name==='control',name+' not distinguished');
  if(name==='control'){assert.deepEqual(errors(value),expectedErrors);assertStatusDeliveryObservations(value);}
  results.push({name,detected:name!=='control',matches,observationsSha256:sha256(actual),compressedSha256:sha256(compressed),logSha256:sha256(fs.readFileSync(log))});
  writeJSON(path.join(directory,'progress.json'),{directory,results});console.log('Verified status delivery observer: '+name);
 }
 passed=true;
}finally{
 fs.writeFileSync(file,bytes);verifyReference(game,lock);for(const[f,h]of tracked)assert.equal(sha256(fs.readFileSync(f)),h,f);
 const report={passed,directory,game,originalRestored:true,expectedFilesRewritten:false,acceptanceFile:acceptedFile,acceptanceSha256:sha256(acceptedBytes),courses:capture.courses,helperSha256:capture.helperSha256,expectedSha256:capture.observationsSha256,
  faultDefinitionsSha256:sha256(fs.readFileSync('scripts/status-delivery-observer-faults.mjs')),executionOrder:ordered.map(f=>f[0]),verificationInputs:Object.fromEntries(tracked),faults:results.filter(r=>r.detected).length,results};
 writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/status-delivery-observer-verification.json',report);console.log({passed,directory,faults:report.faults});
}
