import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,sha256,writeJSON,listFiles,verifyReference} from './reference-utils.mjs';
import {accepted,readVocationFixture,prepareVocationObserver,checkVocationObserverTypes,captureVocationObserver} from './vocation-reference.mjs';
const args=process.argv.slice(2);assert(args.length===0||(args.length===2&&args[0]==='--location'));
const read=file=>JSON.parse(fs.readFileSync(file)),ref=path.join(root,'.reference'),lock=read('baseline/source-lock.json');
const game=args.length?fs.realpathSync(read(path.resolve(root,args[1])).game):ref;
verifyReference(ref,lock);
const snapshot=directory=>Object.fromEntries(listFiles(directory).map(f=>[f,sha256(fs.readFileSync(path.join(directory,f)))]));
const watched=[path.join(ref,'src'),path.join(root,'dist')];
if(game!==ref)watched.push(path.join(game,'src'),path.join(game,'node_modules/@hollow-wake/engine'));
const before=watched.map(snapshot);
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const directory=fs.mkdtempSync(path.join(root,'.artifacts/reference-vocations-'));
const names=['survey','chain'],entries=names.map(n=>prepareVocationObserver(n,game,directory));
let passed=false,types;const results=[];
try{
  types=checkVocationObserverTypes(directory,entries);
  for(const [index,name]of names.entries()){
    const run=captureVocationObserver(entries[index],directory,name+'-observations'),expected=readVocationFixture(name);
    assert(run.bytes.equals(expected),name+' differs from the frozen game observations');
    const data=JSON.parse(run.bytes);
    if(name==='survey'){
      assert.equal(data.vocations,31);assert.equal(data.quests,92);assert.equal(data.grants.length,14);
      assert.deepEqual(data.liveCap,{before:false,expanded:true,repeat:false});
      assert(data.gates.every(q=>q.bits.length===256));
      assert(data.identities.every(q=>q.borrowedZone&&q.sharedGiver&&q.requirementIdentity!==false));
    }else{
      assert.deepEqual(data.map(d=>d.sealed),[false,true]);
      for(const row of data){
        assert.equal(row.events.filter(e=>e.name==='paid').length,3);
        const final=row.events.at(-1).state;assert.deepEqual(final.stepKeys,[1,1,1]);assert.deepEqual(final.accountStepKeys,[null,null,null]);
        assert.equal(final.account,row.sealed?null:1);
      }
    }
    results.push({name,sha256:run.sha256,logSha256:run.logSha256});
  }
  passed=true;
}finally{
  watched.forEach((dir,i)=>assert.deepEqual(snapshot(dir),before[i]));verifyReference(ref,lock);
  writeJSON(path.join(directory,'verification.json'),{passed,directory,game,typesLogSha256:types,results,inputsUnchanged:true});
  console.log({passed,directory,vocations:accepted.vocations,questSteps:accepted.steps,results:results.map(r=>r.name)});
}
