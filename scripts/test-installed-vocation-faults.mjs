import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,sha256,listFiles,writeJSON} from './reference-utils.mjs';
import {readVocationFixture,prepareVocationObserver,captureVocationObserver} from './vocation-reference.mjs';

const [flag,file]=process.argv.slice(2);
assert.equal(flag,'--location');const location=JSON.parse(fs.readFileSync(path.resolve(root,file)));
const source=fs.realpathSync(location.game),sdk=fs.realpathSync(path.join(source,'node_modules/@hollow-wake/engine'));
assert.notEqual(source,fs.realpathSync(path.join(root,'.reference')));
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const directory=fs.mkdtempSync(path.join(root,'.artifacts/installed-vocation-faults-'));
const game=path.join(directory,'game'),modules=path.join(game,'node_modules'),scope=path.join(modules,'@hollow-wake'),copy=path.join(scope,'engine');
fs.cpSync(path.join(source,'src'),path.join(game,'src'),{recursive:true});
fs.mkdirSync(scope,{recursive:true});fs.cpSync(sdk,copy,{recursive:true});
fs.copyFileSync(path.join(source,'package.json'),path.join(game,'package.json'));
for(const entry of fs.readdirSync(path.join(source,'node_modules'))){
  if(entry.startsWith('.')||entry==='@hollow-wake')continue;
  const target=path.join(source,'node_modules',entry);
  if(fs.statSync(target).isDirectory())fs.symlinkSync(fs.realpathSync(target),path.join(modules,entry),process.platform==='win32'?'junction':'dir');
}
const paths={quest:path.join(copy,'dist/vocations.js'),grant:path.join(copy,'dist/vocation-grants.js'),world:path.join(game,'src/engine/world.ts'),binding:path.join(game,'src/engine/vocationGrantAdapter.ts')};
const originals=Object.fromEntries(Object.entries(paths).map(([key,f])=>[key,fs.readFileSync(f,'utf8')]));
const expectedBytes=readVocationFixture('survey'),expected=JSON.parse(expectedBytes);
const gate=d=>d.gates.some((g,i)=>g.bits!==expected.gates[i].bits);
const grant=(d,id)=>d.grants.find(row=>row.trial.id===id);
const changed=(d,id)=>JSON.stringify(grant(d,id))!==JSON.stringify(grant(expected,id));
const faults=[
  ['progression-ledger','quest','progressionOpen(state.accountLedger)','progressionOpen(state.runLedger)',gate],
  ['previous-step-ledger','quest','state.runLedger[vocationStepKey(v.id, index)]','state.accountLedger[vocationStepKey(v.id, index)]',gate,2],
  ['detached-zone','quest','zone: step.zone','zone: {...step.zone}',d=>d.identities.some(row=>!row.borrowedZone)],
  ['root-allocation','grant','character.allocated.add(vocationRootId(id))','character.allocated.add(id)',d=>!grant(d,'ordinary').after.root],
  ['account-overwrite','grant','ports.accountLedger()[key] = 1','ports.accountLedger()[key] = (ports.accountLedger()[key] ?? 0) + 1',d=>changed(d,'preexisting-ledger')],
  ['account-authority','binding','() => world.metaProgressionActive()','() => true',d=>d.grants.some((r,i)=>r.after.account!==expected.grants[i].after.account)],
  ['recipient-seat','world','engineGrantVocation(vocId, seat, this.engineVocationGrants)','engineGrantVocation(vocId, this.localSeat, this.engineVocationGrants)',d=>d.grants.some(r=>r.trial.remote&&changed(d,r.trial.id))],
];
const entry=prepareVocationObserver('survey',game,directory);
const control=captureVocationObserver(entry,directory,'control');assert(control.bytes.equals(expectedBytes));
const results=[];let passed=false;
try{
  for(const [name,key,before,after,detected,count=1]of faults){
    const target=paths[key],whole=originals[key];
    assert.equal(whole.split(before).length-1,count,name);
    fs.writeFileSync(target,whole.replaceAll(before,after));
    let observed;
    try{observed=captureVocationObserver(entry,directory,name);}finally{fs.writeFileSync(target,whole);}
    const data=JSON.parse(observed.bytes);
    assert.deepEqual(data.grants.map(r=>r.error),expected.grants.map(r=>r.error),name+' unexpected error');
    assert(!observed.bytes.equals(expectedBytes)&&detected(data),name+' did not change its intended outcome');
    results.push({name,sha256:observed.sha256});writeJSON(path.join(directory,'progress.json'),{results});
  }
  passed=true;
}finally{
  for(const [a,b] of [[path.join(game,'src'),path.join(source,'src')],[copy,sdk]])
    for(const f of listFiles(a))assert.equal(sha256(fs.readFileSync(path.join(a,f))),sha256(fs.readFileSync(path.join(b,f))),f);
  writeJSON(path.join(directory,'verification.json'),{passed,directory,results,controlSha256:control.sha256,inputsUnchanged:true});
  console.log({passed,directory,detected:results.length});
}
