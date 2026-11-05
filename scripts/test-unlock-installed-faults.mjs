import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {prepareVocationFaultGame} from './vocation-installed-fault-tools.mjs';
import {prepareVocationObserver,checkVocationObserverTypes,captureVocationObserver,readVocationFixture} from './vocation-reference.mjs';
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file)));
const [flag,file,...extra]=process.argv.slice(2);assert.equal(flag,'--location');assert(file&&extra.length===0);
const accepted=JSON.parse(fs.readFileSync(path.resolve(file)));assert(accepted.unlockDecision);
const repaired=read('baseline/unlock-lifecycle/repairs/acceptance.json');
const {directory,game,verifyUnchanged}=prepareVocationFaultGame({game:accepted.game},'unlock-installed-binding-faults-');
const fixtures=read('baseline/unlock-lifecycle/acceptance.json').fixtures;
const expectedHashes=Object.fromEntries(['policy','transactions','memory'].map(name=>[name,sha256(readVocationFixture(name,name==='policy'?fixtures:repaired.fixtures))]));
const entries=Object.fromEntries(['policy','transactions','memory'].map(name=>[name,prepareVocationObserver(name,game,directory,fixtures)]));
checkVocationObserverTypes(directory,Object.values(entries));
const originals=new Map(['meta/unlocks.ts','meta/memoryUnlocks.ts'].map(name=>[name,fs.readFileSync(path.join(game,'src',name))]));
const expected=new Map(),results=[];let passed=false;
const faults=[
 ['invest-forwarding','meta/unlocks.ts','investUnlock','transactions','return 0;'],
 ['apply-forwarding','meta/unlocks.ts','applyUnlock','transactions','return false;'],
 ['memory-grant-forwarding','meta/memoryUnlocks.ts','grantMemoryUnlock','memory','return null;'],
 ['package-content-binding','meta/unlocks.ts',null,'policy',null],
];
try{
 for(const [name,entry]of Object.entries(entries)){
  const capture=captureVocationObserver(entry,directory,name+'-control');assert.equal(capture.sha256,expectedHashes[name]);
  expected.set(name,JSON.parse(capture.bytes));
 }
 for(const [label,file,method,observer,statement]of faults){
  const target=path.join(game,'src',file),source=originals.get(file).toString();let changed;
  if(method){
   const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true),node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===method);
   assert(node?.body);changed=source.slice(0,node.body.getStart(ast))+'{ '+statement+' }'+source.slice(node.body.end);
  }else{const needle='packages: () => PACKAGES';assert.equal(source.split(needle).length,2);changed=source.replace(needle,'packages: () => []');}
  assert.equal(ts.createSourceFile(file,changed,ts.ScriptTarget.Latest,true).parseDiagnostics.length,0);
  fs.writeFileSync(target,changed);
  try{
   const capture=captureVocationObserver(entries[observer],directory,label),observed=JSON.parse(capture.bytes),before=expected.get(observer);
   assert.notEqual(capture.sha256,expectedHashes[observer],label+' survived');
   let affected;
   if(observer==='policy'){
    assert.equal(observed.packageRows.length,0);assert(before.packageRows.length>0);
    affected=observed.observations.filter((row,i)=>JSON.stringify(row)!==JSON.stringify(before.observations[i])).map(row=>row.name);
   }else if(observer==='memory'){
    affected=observed.draws.filter((row,i)=>{const prior=before.draws[i];return prior.receipt&&row.receipt===null&&row.randomDraws===0;}).map(row=>row.name);
   }else{
    affected=observed.traces.filter((row,i)=>row.steps.some((step,j)=>{
     const prior=before.traces[i].steps[j];return !prior.error&&!step.error&&prior.result!==step.result&&step.result===(method==='investUnlock'?0:false);
    })).map(row=>row.name);
   }
   assert(affected.length>0,label+' missed its intended wrong outcome');
   results.push({label,file,method,observer,sha256:capture.sha256,affected});console.log({passed:label,affected:affected.length});
  }finally{fs.writeFileSync(target,originals.get(file));}
 }
 for(const [name,entry]of Object.entries(entries))assert.equal(captureVocationObserver(entry,directory,name+'-restored').sha256,expectedHashes[name]);
 passed=true;
}finally{
 verifyUnchanged();const report={passed,directory,archiveSha256:sha256(fs.readFileSync(accepted.archive)),results,sourceRestored:true,packagePreserved:true};
 writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/unlock-installed-binding-faults-latest.json',report);console.log({passed,directory,faults:results.length});
}
