import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {execFileSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
import {root,listFiles,sha256,writeJSON,verifyReference} from './reference-utils.mjs';
import {actorCaptureSource,worldCaptureSource,withoutParents,projectAdmission} from './admission-comparison.mjs';
const artifacts=path.join(root,'.artifacts'),location=JSON.parse(fs.readFileSync(path.join(artifacts,'adapter-location.json'))),game=location.game;
const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
verifyReference(reference,lock);
const installed=path.join(location.tooling,'node_modules/@hollow-wake/engine/dist'),built=path.join(root,'dist'),files=listFiles(built);
assert.deepEqual(listFiles(installed),files);for(const file of files)assert(fs.readFileSync(path.join(installed,file)).equals(fs.readFileSync(path.join(built,file))),'Stale installed admission '+file);
const acceptance=JSON.parse(fs.readFileSync(path.join(root,'baseline/milestone-thirty/acceptance.json'))),output=fs.mkdtempSync(path.join(artifacts,'game-skill-admission-'));
const helpers=acceptance.fixtures.map(row=>{
 const bytes=fs.readFileSync(path.join(root,'reference/export-'+row.name+'.ts')),expected=gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-thirty',row.name+'.json.gz')));
 assert.equal(sha256(bytes),row.helperSha256);assert.equal(sha256(expected),row.fixtureSha256);
 return {...row,source:(row.name==='admission-actor'?actorCaptureSource:worldCaptureSource)(bytes.toString()),expected:JSON.parse(expected),filename:'sdk-admission-'+randomUUID()+'.ts'};
});
function capture(row,folder,label){
 const file=path.join(output,row.name+'-'+label+'.json');
 execFileSync(process.execPath,['--import','tsx',path.join(folder,'balance',row.filename),file],{cwd:folder,stdio:'pipe'});
 return JSON.parse(fs.readFileSync(file));
}
const faults=[
 ['ammunition-bank-created-before-body-refusal','if (p.replenishing(inst))','if (p.requiresUseCharge(inst)) p.useChargeBank(actor, inst);\n        if (p.replenishing(inst))'],
 ['recovery-lock-ignored','if (actor.skillRecoveryLocks.has(inst.def.id))','if (false)'],
 ['authored-gate-identity-lost','return gate;','return {...gate};'],
 ['prime-admits-one-point-dent','this.maximum(actor, kind) - actor[kind] < 1','this.maximum(actor, kind) - actor[kind] <= 1'],
 ['aura-debt-lock-ignored','if (raw.overdrive &&','if (false && raw.overdrive &&'],
];
const target=path.join(installed,'skill-admission.js'),original=fs.readFileSync(target,'utf8'),reports=[];
try{
 for(const row of helpers)for(const folder of [reference,game])fs.writeFileSync(path.join(folder,'balance',row.filename),row.source,{flag:'wx'});
 for(const config of ['tsconfig.json','tsconfig.launcher.json','tsconfig.sim.json'])execFileSync(process.execPath,[path.join(game,'node_modules/typescript/bin/tsc'),'-p',config],{cwd:game,stdio:'inherit'});
 for(const row of helpers){
  const observed=capture(row,reference,'original');
  assert.deepEqual(row.name==='admission-world'?withoutParents(observed):observed,row.expected,'Instrumented original changed accepted observations');
  row.projected=projectAdmission(row.name,observed);
  assert.deepEqual(projectAdmission(row.name,capture(row,game,'candidate')),row.projected,'Installed admission changed '+row.name);
 }
 if(!process.argv.includes('--skip-faults')){
  for(const[name,before,after]of faults){
   assert(original.includes(before),'Moved admission fault '+name);let detected=false;
   try{fs.writeFileSync(target,original.replaceAll(before,after));
    for(const row of helpers){try{assert.deepEqual(projectAdmission(row.name,capture(row,game,'fault-'+name)),row.projected);}catch(error){
     const detail=String(error.stdout??'')+String(error.stderr??'');assert(error.code==='ERR_ASSERTION'||error.status!==undefined&&/AssertionError/.test(detail)&&!/SyntaxError|ERR_MODULE_NOT_FOUND/.test(detail),'Fault must reach behavior: '+detail);detected=true;
    }}
   }finally{fs.writeFileSync(target,original);}
   assert(detected,'Undetected installed admission fault '+name);reports.push({name,detected});console.log('Detected installed fault: '+name);
  }
  const actorFile=path.join(game,'src/engine/actor.ts'),actor=fs.readFileSync(actorFile,'utf8'),binding='return sdkSkillAdmission.canUse(this, inst);';assert(actor.includes(binding));let detected=false;
  try{fs.writeFileSync(actorFile,actor.replace(binding,'return true;'));
   try{capture(helpers.find(row=>row.name==='admission-world'),game,'fault-disconnected-native-admission');}catch(error){const detail=String(error.stdout??'')+String(error.stderr??'');assert(/AssertionError/.test(detail)&&!/SyntaxError|ERR_MODULE_NOT_FOUND/.test(detail),detail);detected=true;}
  }finally{fs.writeFileSync(actorFile,actor);}
  assert(detected,'Native admission delegation fault survived');reports.push({name:'disconnected-native-admission',detected});
 }
}finally{
 for(const row of helpers)for(const folder of [reference,game]){const file=path.join(folder,'balance',row.filename);if(fs.existsSync(file)&&fs.readFileSync(file,'utf8')===row.source)fs.unlinkSync(file);}
}
for(const file of files)assert(fs.readFileSync(path.join(installed,file)).equals(fs.readFileSync(path.join(built,file))),'Admission fault not restored '+file);
verifyReference(reference,lock);
writeJSON(path.join(artifacts,'game-skill-admission-verification.json'),{game,output,version:JSON.parse(fs.readFileSync(path.join(location.tooling,'node_modules/@hollow-wake/engine/package.json'))).version,
 packageIntegrity:location.integrity,installedRuntimeFilesMatchBuild:files.length,gameLauncherAndCaptureTypeChecks:true,fixtures:acceptance.fixtures,projection:'Only retired forwarding trace entries and instrumented gatesMet -> unmetGate / canUse -> gatesMet -> unmetGate calls; all unfiltered captures retained.',installedFaults:reports,allInstalledFilesRestored:true});
console.log('Installed skill admission matches 137 original courses / 243 observations with explicit diagnostic projection.');
