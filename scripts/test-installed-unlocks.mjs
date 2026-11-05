import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {root,sha256,listFiles,verifyReference,writeJSON} from './reference-utils.mjs';
import {prepareVocationObserver,checkVocationObserverTypes,captureVocationObserver,readVocationFixture} from './vocation-reference.mjs';
import {assertMemoryRepairs,assertUnlockRepairs} from './assert-unlock-repairs.mjs';
const [flag,file,...extra]=process.argv.slice(2);assert.equal(flag,'--location');assert(file&&extra.length===0);
const location=JSON.parse(fs.readFileSync(path.resolve(file)));assert(location.unlockDecision,'Prepare a game with unlock delegation first');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file)));
const original=read('baseline/unlock-lifecycle/acceptance.json').fixtures,supplements=read('baseline/unlock-lifecycle/supplement-acceptance.json').fixtures;
const repaired=read('baseline/unlock-lifecycle/repairs/acceptance.json').fixtures,reference=path.join(root,'.reference'),lock=read('baseline/source-lock.json');
verifyReference(reference,lock);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/installed-unlocks-')),game=fs.realpathSync(location.game);
const protectedPaths=[path.join(game,'src'),fs.realpathSync(path.join(game,'node_modules/@hollow-wake/engine'))];
const snapshot=directory=>Object.fromEntries(listFiles(directory).map(file=>[file,sha256(fs.readFileSync(path.join(directory,file)))]));
const before=protectedPaths.map(snapshot),results={},observed={};let passed=false;
try{
 const fixtures={...original,edges:supplements.repairEdges},entries={};
 for(const name of Object.keys(fixtures))entries[name]=prepareVocationObserver(name,game,directory,fixtures);
 const helper='reference/export-unlock-save-roundtrip.ts';
 entries.save=prepareVocationObserver('save',game,directory,{save:{helper,helperSha256:sha256(fs.readFileSync(path.join(root,helper)))}});
 checkVocationObserverTypes(directory,Object.values(entries));
 for(const [name,entry]of Object.entries(entries)){
  const capture=captureVocationObserver(entry,directory,name+'-observations');observed[name]=JSON.parse(capture.bytes);
  if(name==='save'){assert(observed.save.passed);assert.equal(observed.save.results.length,10);assert.equal(observed.save.saves,23);}
  else assert(capture.bytes.equals(readVocationFixture(name,name==='policy'?original:repaired)),name+' differs from the approved behavior');
  results[name]=capture.sha256;
 }
 assertMemoryRepairs(JSON.parse(readVocationFixture('memory',original)),observed.memory);
 assertUnlockRepairs(JSON.parse(readVocationFixture('transactions',original)),observed.transactions,JSON.parse(readVocationFixture('repairEdges',supplements)),observed.edges);
 for(const [name,script]of [['classes','test-reference-character-rules.mjs'],['continuity','test-reference-character-continuity.mjs'],['gates','test-reference-progression-gates.mjs']]){
  const log=path.join(directory,name+'.txt'),fd=fs.openSync(log,'wx');
  try{execFileSync(process.execPath,[path.join(root,'scripts',script),'--game',game],{cwd:root,stdio:['ignore',fd,fd],windowsHide:true,timeout:600000});}finally{fs.closeSync(fd);}
  results[name]=sha256(fs.readFileSync(log));
 }
 passed=true;
}finally{
 protectedPaths.forEach((file,index)=>assert.deepEqual(snapshot(file),before[index]));verifyReference(reference,lock);
 const report={passed,directory,game,results,saves:observed.save?.saves,sourcePreserved:true,packagePreserved:true};
 writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/installed-unlocks-latest.json'),report);console.log(report);
}
