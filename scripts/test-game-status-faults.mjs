import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';import {gunzipSync} from 'node:zlib';
import {root,sha256,listFiles,writeJSON} from './reference-utils.mjs';import {statusDecision} from '../adapters/hollow-wake/integrate-status-lifecycle.mjs';
const args=process.argv.slice(2);assert(args.length===2&&args[0]==='--location');
const location=JSON.parse(fs.readFileSync(path.resolve(root,args[1]))),game=fs.realpathSync(location.game);
assert(game.startsWith(path.join(root,'.artifacts')+path.sep),'Fault tests require a disposable adapter inside this repository');assert.equal(location.statusDecision,statusDecision);
const installed=fs.realpathSync(path.join(game,'node_modules/@hollow-wake/engine'));assert(installed.startsWith(path.join(root,'.artifacts')+path.sep));
const snapshot=d=>Object.fromEntries(listFiles(d).map(f=>[f,sha256(fs.readFileSync(path.join(d,f)))]));
assert.deepEqual(snapshot(path.join(installed,'dist')),snapshot(path.join(root,'dist')));
const before=snapshot(path.join(game,'src')),pkg=snapshot(installed),file=path.join(installed,'dist/status-lifecycle.js'),bytes=fs.readFileSync(file),source=bytes.toString('utf8');
const accepted=JSON.parse(fs.readFileSync(path.join(root,'baseline/status-lifecycle/acceptance.json'))),expected=gunzipSync(fs.readFileSync(path.join(root,accepted.observations)));
assert.equal(sha256(expected),accepted.observationsSha256);const helper=fs.readFileSync(path.join(root,accepted.helper),'utf8');assert.equal(sha256(helper),accepted.helperSha256);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/game-status-faults-')),runtime=path.join(directory,'capture.ts');
fs.writeFileSync(runtime,helper.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,(_a,_q,f)=>JSON.stringify(pathToFileURL(path.join(game,'src',f+'.ts')).href)));
const faults=[['immunity',"actor.sheet.get('debuffImmunity') > 0","actor.sheet.get('debuffImmunity') > 1000"],
 ['bank-wet','dps *= def.bank.wetMul;','dps *= 1;'],
 ['pop-debt','owed * frac','owed * frac * 2'],
 ['full-frame','const tick = s.dps * s.stacks * curve * dt;','const tick = s.remaining <= 0 ? 0 : s.dps * s.stacks * curve * dt;'],
 ['cleanse','stripped < count','stripped + 1 <= count'],
 ['strongest','if (dps > existing.dps)','if (dps >= existing.dps)']];
const results=[];let passed=false;
try{
  // First prove this exact observer and installed package still reproduce the fixture.
  for(const [name,needle,replacement] of [['control',null,null],...faults]){
    if(needle){assert.equal(source.split(needle).length-1,1,name);fs.writeFileSync(file,source.replace(needle,replacement));}
    const out=path.join(directory,name+'.json'),fd=fs.openSync(path.join(directory,name+'.txt'),'wx');
    try{execFileSync(process.execPath,['--import',pathToFileURL(path.join(game,'node_modules/tsx/dist/loader.mjs')).href,runtime,out],{cwd:game,stdio:['ignore',fd,fd],timeout:180000});}
    finally{fs.closeSync(fd);fs.writeFileSync(file,bytes);}
    const actual=fs.readFileSync(out);assert.equal(actual.equals(expected),name==='control',name);
    const value=JSON.parse(actual);assert.equal(value.courses,217);assert.deepEqual(value.rows.flatMap(r=>r.steps.filter(s=>!s.error?.$undefined).map(s=>[r.name,s.error.message])),[['relay-throw','relay fault'],['tick-callback-throw','tick fault'],['source-publication-throw','publication fault']]);
    results.push({name,detected:name!=='control',sha256:sha256(actual)});
  }passed=true;
}finally{fs.writeFileSync(file,bytes);assert.deepEqual(snapshot(path.join(game,'src')),before);assert.deepEqual(snapshot(installed),pkg);
  const report={passed,directory,game,faults:results.filter(r=>r.detected).length,results,sourceAndPackageRestored:true};writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/game-status-fault-verification.json'),report);console.log({passed,directory,faults:report.faults});}
