import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';

const [buildFlag,buildFile,verifiedFlag,verifiedFile,acceptedFlag,acceptedDir,outFlag,output,...rest]=process.argv.slice(2);
assert.deepEqual([buildFlag,verifiedFlag,acceptedFlag,outFlag,rest.length],['--build','--verified','--accepted','--out',0]);
const read=file=>JSON.parse(fs.readFileSync(file));
const bytes=fs.readFileSync(verifiedFile),original=JSON.parse(bytes);
const accepted=read(path.join(acceptedDir,'verification.json'));
assert(original.passed&&accepted.passed);
assert.equal(accepted.verificationSha256,sha256(bytes));
assert.equal(accepted.buildSha256,sha256(fs.readFileSync(buildFile)));
assert(!fs.existsSync(output));
const work=fs.mkdtempSync(path.join(path.dirname(path.resolve(output)),'inventory-receipt-faults-'));
const runs=[];
try{
  const faults=[
    ['unobserved-barrier',v=>{v.crashes[1].barrierVerified=false;},'crash barrier verified'],
    ['lost-committed-inventory',v=>{v.crashes[2].recovery.sourceSha256=v.crashes[0].recovery.sourceSha256;},'exact recovered checkpoint'],
    ['partial-uncommitted-transfer',v=>{v.crashes[1].recovery.stashSha256=v.crashes[2].recovery.stashSha256;},'exact recovered checkpoint'],
    ['missing-workshop-courses',v=>{delete v.workshop;},'v.workshop?.coldImport.cacheInitiallyAbsent'],
  ];
  for(const [name,change,expected] of faults){
    const altered=structuredClone(original);change(altered);
    const fixture=path.join(work,name+'.json'),delivery=path.join(work,name);
    writeJSON(fixture,altered);
    const result=spawnSync(process.execPath,[path.join(root,'scripts/record-inventory-workshop.mjs'),
      '--build',path.resolve(buildFile),'--verified',fixture,'--out',delivery],
      {windowsHide:true,encoding:'utf8',timeout:60000});
    const text=result.stdout+result.stderr;
    assert(!result.error&&!result.signal&&result.status===1,name+': '+text);
    assert(text.includes('AssertionError')&&text.includes(expected),name+': '+text);
    assert(!fs.existsSync(delivery),'invalid evidence never creates a delivery');
    runs.push({name,status:result.status,assertion:expected,output:text,sha256:sha256(text)});
  }
  assert(fs.readFileSync(verifiedFile).equals(bytes),'accepted evidence unchanged');
  writeJSON(output,{passed:true,verificationSha256:sha256(bytes),runs,sourcePreserved:true});
  console.log({passed:true,faults:runs.length});
}finally{
  fs.rmSync(work,{recursive:true,force:true,maxRetries:8,retryDelay:250});
}
