import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';import {gunzipSync} from 'node:zlib';
import {root,sha256,listFiles,writeJSON} from './reference-utils.mjs';import {statusEffectsDecision} from '../adapters/hollow-wake/integrate-status-effects.mjs';
const args=process.argv.slice(2);assert(args.length===2&&args[0]==='--location');
const location=JSON.parse(fs.readFileSync(path.resolve(root,args[1]))),game=fs.realpathSync(location.game);
assert(game.startsWith(path.join(root,'.artifacts')+path.sep),'Fault tests require a disposable adapter inside this repository');assert.equal(location.statusEffectsDecision,statusEffectsDecision);
const installed=fs.realpathSync(path.join(game,'node_modules/@hollow-wake/engine'));assert(installed.startsWith(path.join(root,'.artifacts')+path.sep));
const snapshot=d=>Object.fromEntries(listFiles(d).map(f=>[f,sha256(fs.readFileSync(path.join(d,f)))]));
assert.deepEqual(snapshot(path.join(installed,'dist')),snapshot(path.join(root,'dist')));
const before=snapshot(path.join(game,'src')),pkg=snapshot(installed),file=path.join(installed,'dist/status-effects.js'),bytes=fs.readFileSync(file),source=bytes.toString('utf8');
const accepted=JSON.parse(fs.readFileSync(path.join(root,'baseline/status-effects/acceptance.json'))),expected=gunzipSync(fs.readFileSync(path.join(root,accepted.observations)));
assert.equal(sha256(expected),accepted.observationsSha256);const helper=fs.readFileSync(path.join(root,accepted.helper),'utf8');assert.equal(sha256(helper),accepted.helperSha256);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/game-status-effects-faults-')),runtime=path.join(directory,'capture.ts');
fs.writeFileSync(runtime,helper.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,(_a,_q,f)=>JSON.stringify(pathToFileURL(path.join(game,'src',f+'.ts')).href)));
const propagation=JSON.parse(fs.readFileSync(path.join(root,'baseline/status-propagation/acceptance.json'))),propExpected=gunzipSync(fs.readFileSync(path.join(root,propagation.observations))),propHelper=fs.readFileSync(path.join(root,propagation.helper),'utf8'),propRuntime=path.join(directory,'propagation.ts');
assert.equal(sha256(propExpected),propagation.observationsSha256);assert.equal(sha256(propHelper),propagation.helperSha256);
fs.writeFileSync(propRuntime,propHelper.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,(_a,_q,f)=>JSON.stringify(pathToFileURL(path.join(game,'src',f+'.ts')).href)));
const faults=[['ring-modifiers','value: m.value * s.stacks','value: m.value'],
 ['bank-payout','banked * f * Math.max(0, mul)','banked * f * Math.max(0, mul) * 2'],
 ['rupture-story','!ports.sameStory(e, victim)','false'],
 ['proc-magnitude','(effect.magnitude ?? 1)','(effect.magnitude ?? 1) * 2'],
 ['zap-stacks','baseline(s.id) * zn.factor * s.stacks','baseline(s.id) * zn.factor * (s.stacks + 1)'],
 ['propagation-cap','spread >= 6','spread >= 7']];
const results=[];let passed=false;
try{
  // First prove this exact observer and installed package still reproduce the fixture.
  for(const [name,needle,replacement] of [['control',null,null],...faults]){
    if(needle){assert.equal(source.split(needle).length-1,1,name);fs.writeFileSync(file,source.replace(needle,replacement));}
    const out=path.join(directory,name+'.json'),fd=fs.openSync(path.join(directory,name+'.txt'),'wx');
    const propOut=path.join(directory,name+'-propagation.json');
    try{execFileSync(process.execPath,['--import',pathToFileURL(path.join(game,'node_modules/tsx/dist/loader.mjs')).href,runtime,out],{cwd:game,stdio:['ignore',fd,fd],timeout:180000});
      if(name==='control'||name==='propagation-cap')execFileSync(process.execPath,['--import',pathToFileURL(path.join(game,'node_modules/tsx/dist/loader.mjs')).href,propRuntime,propOut],{cwd:game,stdio:['ignore',fd,fd],timeout:180000});}
    finally{fs.closeSync(fd);fs.writeFileSync(file,bytes);}
    const actual=fs.readFileSync(out),primaryMatches=actual.equals(expected),propActual=fs.existsSync(propOut)?fs.readFileSync(propOut):null,propagationMatches=propActual?propActual.equals(propExpected):null;
    assert.equal(primaryMatches&&propagationMatches!==false,name==='control',name);
    if(propActual)assert.equal(JSON.parse(propActual).courses,10);
    const value=JSON.parse(actual);assert.equal(value.courses,263);assert.deepEqual(value.rows.flatMap(r=>r.steps.filter(s=>!s.error?.$undefined).map(s=>[r.name,s.error.message])),[['transplant-application-throw','application fault'],['bank-text-throw','text fault'],['ring-source-throw','source fault']]);
    results.push({name,detected:name!=='control',sha256:sha256(actual),primaryMatches,propagationMatches,propagationSha256:propActual?sha256(propActual):undefined});
  }passed=true;
}finally{fs.writeFileSync(file,bytes);assert.deepEqual(snapshot(path.join(game,'src')),before);assert.deepEqual(snapshot(installed),pkg);
  const report={passed,directory,game,faults:results.filter(r=>r.detected).length,results,sourceAndPackageRestored:true,sourceMapSha256:sha256(JSON.stringify(before)),packageMapSha256:sha256(JSON.stringify(pkg))};writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/game-status-effects-fault-verification.json'),report);console.log({passed,directory,faults:report.faults});}
