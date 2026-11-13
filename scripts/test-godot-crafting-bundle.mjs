import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import {gunzipSync,gzipSync} from 'node:zlib';
import {root,sha256} from './reference-utils.mjs';
import {workshopBundles,workspaceBridges} from './godot-crafting-bundle.mjs';
import {itemPack} from './compile-item-content.mjs';import {craftingPack} from './compile-crafting-content.mjs';
import {skillProgressionPack} from './compile-skill-progression.mjs';import {inspectionTerms} from './compile-inspection-terms.mjs';
import {encodeContentTable} from '../dist/content-table-compiler.js';

// Fast bundle qualification before the separate native editor/export jobs.
// Replays retained replies; it does not establish a new native or device run.
const owned=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(owned,'godot-bundle-check-owned-'));
const read=file=>fs.readFileSync(path.join(root,file)),logs={},report={passed:false,sources:{},variants:{},nativeQualified:false};
const capture=file=>{const bytes=read(file);report.sources[file]=sha256(bytes);return bytes;};
try{
 for(const file of ['scripts/test-godot-crafting-bundle.mjs','scripts/godot-crafting-bundle.mjs','test/godot-crafting/bundle-contract.mjs',
  'scripts/compile-item-content.mjs','scripts/compile-crafting-content.mjs','scripts/compile-skill-progression.mjs','scripts/compile-inspection-terms.mjs'])capture(file);
 const proof=JSON.parse(capture('evidence/content-tables/windows.json')),raw=capture(proof.raw.file);assert(proof.passed);assert.equal(sha256(raw),proof.raw.sha256);
 const {course}=JSON.parse(gunzipSync(raw));assert.equal(course.rows.length,56);
 const plain=JSON.stringify({items:itemPack(),crafting:craftingPack(),skills:skillProgressionPack()});assert.equal(sha256(plain),proof.content.contentSha256);
 const table=JSON.stringify(encodeContentTable(JSON.parse(plain)));assert.equal(sha256(table),proof.content.tableSha256);
 const directory=path.join(root,'adapters/godot/crafting'),bundles=await workshopBundles(directory,workspaceBridges(root));
 for(const[name,row]of Object.entries(bundles)){
  for(const input of row.inputs){const file=path.relative(root,path.resolve(directory,input)).replaceAll('\\','/');assert(!file.startsWith('../'));capture(file);}
  const context=vm.createContext({input:table});
  vm.runInContext('Math.random=()=>{throw new Error("ambient random")}',context);
  vm.runInContext(Buffer.from(row.bytes).toString('utf8'),context,{timeout:30000});
  vm.runInContext('var host=HollowWakeSession.create(JSON.parse(input))',context,{timeout:30000});
  for(const {request,expected}of course.rows){
   context.input=JSON.stringify(request);
   const actual=vm.runInContext('(()=>{const request=HollowWakeSession.dispatch(host,["parse",input]);if(!request.ok)throw Error("parse");const reply=HollowWakeSession.dispatch(host,["command",request.value]);return HollowWakeSession.dispatch(host,["format",reply]).text;})()',context,{timeout:30000});
   assert.deepEqual(JSON.parse(actual),expected,name);
  }
  report.variants[name]={bytes:row.bytes.length,sha256:sha256(row.bytes),originalCommands:course.rows.length};
 }
 fs.writeFileSync(path.join(work,'content.json'),table);fs.writeFileSync(path.join(work,'inspection.json'),JSON.stringify(inspectionTerms()));
 fs.writeFileSync(path.join(work,'bundle.txt'),bundles.vestiges.bytes);
 fs.writeFileSync(path.join(work,'manifest.json'),JSON.stringify({optional:['crafting-session/v2','crafting-session/v3','workshop-supports/v1','pouch-recall/v1','vestige-inlays/v1','crafting-view/v1','crafting-station/v1']}));
 const child=spawnSync(process.execPath,['test/godot-crafting/bundle-contract.mjs',work],{cwd:root,windowsHide:true,encoding:'utf8',timeout:120000,
  env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_COMPILE_CACHE:path.join(work,'compile-cache')}});
 logs.contract={stdout:child.stdout,stderr:child.stderr};assert(!child.error&&!child.signal,String(child.error));assert.equal(child.status,0,child.stderr);
 report.contracts=JSON.parse(child.stdout);assert(report.contracts.passed);report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(read(file))===hash);report.passed&&=report.inputsUnchanged;
 assert.equal(path.dirname(fs.realpathSync(work)),owned);fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;
 const bytes=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(bytes);
 fs.writeFileSync(path.join(owned,'godot-bundle-contracts.logs.json.gz'),bytes);fs.writeFileSync(path.join(owned,'godot-bundle-contracts.json'),JSON.stringify(report,null,2)+'\n');
}
assert(report.passed,report.failure);console.log({passed:true,variants:report.variants,capabilities:report.contracts.capabilities.length,cleaned:true,nativeQualified:false});
