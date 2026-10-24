import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {root,listFiles,sha256,writeJSON} from './reference-utils.mjs';
const artifacts=path.join(root,'.artifacts'),location=JSON.parse(fs.readFileSync(path.join(artifacts,'adapter-location.json')));
assert.equal(location.intentionalConditionRepair,'condition-publication-recovery/v1');
const game=location.game,installed=path.join(location.tooling,'node_modules/@hollow-wake/engine/dist');
const readOnly=process.argv.includes('--read-only');
if(!readOnly)for(const file of ['m36-condition-control/retained.json','m37-initial-candidate/retained.json']){
  const record=path.join(artifacts,file);if(!fs.existsSync(record))continue;
  const control=JSON.parse(fs.readFileSync(record));
  const canonical=p=>{const real=fs.realpathSync(p);return process.platform==='win32'?real.toLowerCase():real;};
  assert.notEqual(canonical(game),canonical(control.game),'Retained game control: use --read-only');
  assert.notEqual(canonical(location.tooling),canonical(control.tooling),'Retained runtime control: use --read-only');
}
const snapshot=dir=>Object.fromEntries(listFiles(dir).map(file=>[file,sha256(fs.readFileSync(path.join(dir,file)))]));
const hostBefore=snapshot(path.join(game,'src')),runtimeBefore=snapshot(installed),output=fs.mkdtempSync(path.join(artifacts,'game-conditions-'));
const unchanged=()=>{assert.deepEqual(snapshot(path.join(game,'src')),hostBefore);assert.deepEqual(snapshot(installed),runtimeBefore);};
const acceptance=JSON.parse(fs.readFileSync(path.join(root,'baseline/milestone-thirty-seven/acceptance.json'))),typed=[],helpers=new Map();
const selected=acceptance.fixtures.filter(row=>row.name!=='actor-condition-reentry');
for(const row of [...new Map(selected.map(row=>[row.helper,row])).values(),{helper:'adapters/hollow-wake/condition-recovery-check.ts'}]){
  const source=fs.readFileSync(path.join(root,row.helper),'utf8');if(row.helperSha256)assert.equal(sha256(source),row.helperSha256);
  const name=path.basename(row.helper,'.ts'),directory=path.join(output,name);fs.mkdirSync(directory);
  const imports=/(['"])\.\.\/src\/([^'"]+)\1/g,runtime=path.join(directory,'capture.ts'),type=path.join(directory,'typed.ts');
  fs.writeFileSync(runtime,source.replace(imports,(_all,_quote,p)=>JSON.stringify(pathToFileURL(path.join(game,'src',p+'.ts')).href)));
  fs.writeFileSync(type,source.replace(imports,(_all,_quote,p)=>JSON.stringify(path.relative(directory,path.join(game,'src',p)).replaceAll('\\','/'))));typed.push(type);helpers.set(row.helper,runtime);
}
const config=path.join(output,'tsconfig.json');writeJSON(config,{extends:path.join(game,'tsconfig.sim.json'),compilerOptions:{typeRoots:[path.join(game,'node_modules/@types')]},include:[path.join(game,'src'),...typed],exclude:[]});
function run(name,args,cwd=game){const log=path.join(output,name+'.txt'),fd=fs.openSync(log,'wx');try{execFileSync(process.execPath,args,{cwd,stdio:['ignore',fd,fd]});}finally{fs.closeSync(fd);}return log;}
run('types',[path.join(game,'node_modules/typescript/bin/tsc'),'-p',config],output);unchanged();
const results=[];
for(const row of selected){
  const packed=fs.readFileSync(path.join(root,row.file));assert.equal(sha256(packed),row.compressedSha256);const expectedBytes=gunzipSync(packed);assert.equal(sha256(expectedBytes),row.fixtureSha256);
  const destination=path.join(output,row.name+'.json');run(row.name,['--import','tsx',helpers.get(row.helper),destination,...row.args]);
  const actual=fs.readFileSync(destination);let mode='byte-equal-original';
  if(row.name==='actor-condition-feedback'){
    const expected=JSON.parse(expectedBytes);
    for(const course of expected.results.filter(course=>course.name.startsWith('condition-sink-existing-'))){
      assert.equal(course.afterFailure.sheetMarkerCurrent,true);assert.equal(course.calls.length,3);
      course.afterFailure.sheetMarkerCurrent=false;
      course.afterRetry.sheetLow=true;course.afterRetry.damage=2;
      course.calls.splice(1,0,structuredClone(course.calls[0]));
    }
    const gauge=expected.results.find(course=>course.name==='gauge-sink-failure-after-condition-fold');
    assert.equal(gauge.afterRetry.charge,0);assert.equal(gauge.calls.length,1);gauge.afterRetry.charge=1;gauge.calls.push(structuredClone(gauge.calls[0]));
    assert.deepEqual(JSON.parse(actual),expected,'Only predeclared condition recovery and retained M36 gauge recovery may differ');mode='explicit-recovery-decision';
  }else assert(actual.equals(expectedBytes),'Unexpected native condition difference: '+row.name);
  unchanged();results.push({name:row.name,courses:row.courses,mode,sha256:sha256(actual)});console.log('PASS installed '+row.name);
}
const recoveryFile=path.join(output,'recovery.json');run('recovery',['--import','tsx',helpers.get('adapters/hollow-wake/condition-recovery-check.ts'),recoveryFile]);
const recovery=JSON.parse(fs.readFileSync(recoveryFile));assert.equal(recovery.checks.length,19);unchanged();console.log('PASS nineteen native callback and dead-sweep checks');

// Faults run only in the independent installed candidate, never in a control.
const runtimeFile=path.join(installed,'actor-conditions.js'),bindingFile=path.join(game,'src/engine/actorConditionAdapter.ts');
const module=fs.readFileSync(runtimeFile,'utf8'),binding=fs.readFileSync(bindingFile,'utf8'),faults=[];
const boundaryRow=selected.find(row=>row.name==='actor-condition-boundary'),boundaryExpected=gunzipSync(fs.readFileSync(path.join(root,boundaryRow.file)));
for(const [name,file,before,after,kind]of readOnly?[]:[
  ['threshold-inclusive',runtimeFile,'actor.life < maxLife','actor.life <= maxLife','boundary'],
  ['recency-inclusive',runtimeFile,'actor.since[index] < cfg.recentWindows[index]','actor.since[index] <= cfg.recentWindows[index]','boundary'],
  ['queue-expanded',runtimeFile,'actor.condRose.length < 16','actor.condRose.length < 17','boundary'],
  ['birth-events',runtimeFile,'actor.condMask === -1 ? 0 : mask & ~actor.condMask','actor.condMask === -1 ? mask : mask & ~actor.condMask','boundary'],
  ['failed-confirmation',runtimeFile,'actor.condSheet = null;\n        }','actor.condSheet = actor.sheet;\n        }','recovery'],
  ['recursion-allowed',runtimeFile,'if (previous === sampling)','if (false)','recovery'],
  ['host-low-line-ignored',bindingFile,'actor=>actor.lowLifeLine()','actor=>.35','boundary'],
  ['host-stride-never-ready',bindingFile,"actor=>actor.sheet.get('strideReach')",'actor=>Number.MAX_VALUE','boundary'],
]){
  const source=file===runtimeFile?module:binding;assert(source.includes(before),'Installed fault anchor changed: '+name);let detected=false;
  const destination=path.join(output,'fault-'+name+'.json');
  try{
    fs.writeFileSync(file,source.replace(before,after));
    try{run('fault-'+name,['--import','tsx',helpers.get(kind==='boundary'?boundaryRow.helper:'adapters/hollow-wake/condition-recovery-check.ts'),destination]);}
    catch(error){const log=fs.readFileSync(path.join(output,'fault-'+name+'.txt'),'utf8');assert(/AssertionError|cannot reenter/.test(log)&&!/SyntaxError|ERR_MODULE_NOT_FOUND/.test(log),'Fault failed for an unrelated reason: '+name);detected=true;}
    if(!detected&&kind==='boundary')detected=!fs.readFileSync(destination).equals(boundaryExpected);
    assert(detected,'Installed fault escaped: '+name);
  }finally{fs.writeFileSync(file,source);unchanged();}
  faults.push({name,detected});console.log('Rejected installed condition fault: '+name);
}
writeJSON(path.join(artifacts,'game-actor-condition-verification.json'),{output,packageIntegrity:location.integrity,game,typesPassed:true,results,originalCoursesCompared:results.reduce((sum,row)=>sum+row.courses,0),recovery:recovery.checks,installedFaults:faults,readOnly,allInstalledFilesRestored:true});
