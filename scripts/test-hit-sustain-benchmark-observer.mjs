import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const args=process.argv.slice(2);assert(args.length===2&&args[0]==='--location');
const location=path.resolve(root,args[1]),helperPath=path.join(root,'reference/benchmark-hit-sustain-worker.ts'),runnerPath=path.join(root,'scripts/benchmark-hit-sustain.mjs');
const helper=fs.readFileSync(helperPath,'utf8'),runner=fs.readFileSync(runnerPath,'utf8'),directory=fs.mkdtempSync(path.join(root,'.artifacts/hit-sustain-benchmark-observer-'));
const faults=[
 ['skip-hit','auditing=true;for(let i=0;i<count;i++)one()','auditing=true;for(let i=0;i<count-1;i++)one()','benchmark must execute every hit'],
 ['missing-heal',"siphon:name==='siphon'||name==='combined'?.5:undefined",'siphon:undefined','measured recovery count'],
 ['healing-order','if(auditing)order.push(a.id)','if(auditing)order.unshift(a.id)','ordered actual healing'],
 ['extra-draw','unitDamage,draws,heals:','unitDamage,draws:draws+1,heals:','fixed workload random schedule'],
];
const results=[];let passed=false;
try {
  for(const[name,needle,replacement,message]of [['control',null,null,null],...faults]) {
    const script=path.join(directory,name+'.mjs'),worker=path.join(directory,name+'.ts'),proofPath=path.join(directory,name+'-verification.json');
    if(needle)assert.equal(helper.split(needle).length-1,1,name+' selector');
    fs.writeFileSync(worker,needle?helper.replace(needle,replacement):helper,{flag:'wx'});
    let source=runner;
    for(const file of ['reference-utils.mjs','hit-sustain-benchmark-checks.mjs'])source=source.replace("from './"+file+"'",'from '+JSON.stringify(pathToFileURL(path.join(root,'scripts',file)).href));
    const lookup="path.join(root,'reference/benchmark-hit-sustain-worker.ts')";assert.equal(source.split(lookup).length-1,1);source=source.replace(lookup,JSON.stringify(worker));
    source=source.replace("'.artifacts/hit-sustain-benchmark-verification.json'",JSON.stringify(proofPath));
    source=source.replace("'.artifacts/hit-sustain-benchmark-latest.json'",JSON.stringify(path.join(directory,name+'-latest.json')));
    fs.writeFileSync(script,source,{flag:'wx'});
    const result=spawnSync(process.execPath,[script,'--previous',location,'--location',location,'--control','--verify-only'],{cwd:root,encoding:'utf8',timeout:480000,windowsHide:true,maxBuffer:8*1024*1024});
    const output=(result.stdout??'')+(result.stderr??'');fs.writeFileSync(path.join(directory,name+'.txt'),output);
    assert(!result.error,result.error?.message);assert.equal(result.signal,null);
    const proof=JSON.parse(fs.readFileSync(proofPath));assert(proof.inputsUnchanged&&proof.control&&proof.verifyOnly);
    if(name==='control'){assert.equal(result.status,0);assert(proof.passed);assert.equal(proof.results.length,21);}
    else {assert.notEqual(result.status,0,name+' survived');assert.equal(proof.passed,false);assert.match(output,/ERR_ASSERTION/);assert(output.includes(message));assert.doesNotMatch(output,/SyntaxError|ReferenceError|TypeError|ERR_MODULE_NOT_FOUND/);}
    results.push({name,passed:true,detected:name!=='control',directory:proof.directory,outputSha256:sha256(output),proofSha256:sha256(fs.readFileSync(proofPath))});
    writeJSON(path.join(directory,'progress.json'),{results});console.log(name+': passed');
  }
  passed=true;
}finally {
  assert.equal(fs.readFileSync(helperPath,'utf8'),helper);assert.equal(fs.readFileSync(runnerPath,'utf8'),runner);
  const report={passed,directory,helperSha256:sha256(helper),runnerSha256:sha256(runner),results,faults:results.filter(r=>r.detected).length};
  writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/hit-sustain-benchmark-observer-verification.json',report);console.log({passed,directory});
}
