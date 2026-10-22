import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {execFileSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
import {root,listFiles,sha256,writeJSON} from './reference-utils.mjs';
const artifacts=path.join(root,'.artifacts'),location=JSON.parse(fs.readFileSync(path.join(artifacts,'adapter-location.json'))),game=location.game;
const installed=path.join(location.tooling,'node_modules/@hollow-wake/engine/dist'),built=path.join(root,'dist'),files=listFiles(built);
assert.deepEqual(listFiles(installed),files);for(const file of files)assert(fs.readFileSync(path.join(installed,file)).equals(fs.readFileSync(path.join(built,file))),'Stale installed payment '+file);
const acceptance=JSON.parse(fs.readFileSync(path.join(root,'baseline/milestone-twenty-nine/acceptance.json'))),output=fs.mkdtempSync(path.join(artifacts,'game-resource-payment-'));
const helpers=acceptance.fixtures.map(row=>({...row,bytes:fs.readFileSync(path.join(root,'reference/export-'+row.name+'.ts')),helper:path.join(game,'balance','sdk-payment-'+randomUUID()+'.ts'),expected:gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-twenty-nine',row.name+'.json.gz')))}));
const target=path.join(installed,'resource-payment.js'),original=fs.readFileSync(target,'utf8'),reports=[];
const faults=[
 ['mana-reservation-omitted','actor.reservedMana += booked;','actor.reservedMana += 0;'],
 ['life-borrows-only-shortfall','Math.min(cost.life, this.headroom(actor, \'life\'))','Math.min(cost.life - actor.life, this.headroom(actor, \'life\'))'],
 ['shield-fraction-changes-spend','actor.es -= fromEs;','actor.es -= fromEs / p.esToMana(actor);'],
 ['idle-boundary-not-inclusive','loan.idle <= 0 ? 1','loan.idle < 0 ? 1'],
 ['blood-observer-omitted','p.lifeSpent(actor, spent);','void spent;'],
 ['repayment-does-not-free-mana','actor.reservedMana - repaid','actor.reservedMana'],
];
function capture(row,label){const file=path.join(output,row.name+'-'+label+'.json');execFileSync(process.execPath,['--import','tsx',row.helper,file],{cwd:game,stdio:'pipe'});return fs.readFileSync(file);}
try{
 for(const row of helpers){assert.equal(sha256(row.bytes),row.helperSha256);assert.equal(sha256(row.expected),row.fixtureSha256);fs.writeFileSync(row.helper,row.bytes,{flag:'wx'});}
 for(const config of ['tsconfig.json','tsconfig.launcher.json','tsconfig.sim.json'])execFileSync(process.execPath,[path.join(game,'node_modules/typescript/bin/tsc'),'-p',config],{cwd:game,stdio:'inherit'});
 for(const row of helpers)assert(capture(row,'accepted').equals(row.expected),'Installed payment changed: '+row.name);
 for(const[name,before,after]of faults){
  assert(original.includes(before),'Moved payment fault '+name);let detected=false;
  try{fs.writeFileSync(target,original.replace(before,after));
   for(const row of helpers){try{if(!capture(row,'fault-'+name).equals(row.expected))detected=true;}catch(error){const detail=String(error.stdout??'')+String(error.stderr??'');assert(error.status!==undefined&&/AssertionError/.test(detail)&&!/SyntaxError|ERR_MODULE_NOT_FOUND/.test(detail),'Fault must reach behavior: '+detail);detected=true;}}
  }finally{fs.writeFileSync(target,original);}
  assert(detected,'Undetected installed payment fault '+name);reports.push({name,detected});console.log('Detected installed fault: '+name);
 }
}finally{for(const row of helpers)if(fs.existsSync(row.helper)&&fs.readFileSync(row.helper).equals(row.bytes))fs.unlinkSync(row.helper);}
for(const file of files)assert(fs.readFileSync(path.join(installed,file)).equals(fs.readFileSync(path.join(built,file))),'Payment fault not restored '+file);
writeJSON(path.join(artifacts,'game-resource-payment-verification.json'),{game,output,version:JSON.parse(fs.readFileSync(path.join(location.tooling,'node_modules/@hollow-wake/engine/package.json'))).version,
 packageIntegrity:location.integrity,installedRuntimeFilesMatchBuild:files.length,gameLauncherAndCaptureTypeChecks:true,fixtures:acceptance.fixtures,installedFaults:reports,allInstalledFilesRestored:true});
console.log('Installed resource payment matches 47 original courses; six behavioral faults detected and restored.');
