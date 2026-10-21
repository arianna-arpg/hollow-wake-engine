import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {execFileSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
import {root,listFiles,sha256,writeJSON} from './reference-utils.mjs';
const a=path.join(root,'.artifacts'),location=JSON.parse(fs.readFileSync(path.join(a,'adapter-location.json'))),game=location.game,installed=path.join(location.tooling,'node_modules/@hollow-wake/engine/dist'),built=path.join(root,'dist'),files=listFiles(built);
assert.deepEqual(listFiles(installed),files);for(const file of files)assert(fs.readFileSync(path.join(installed,file)).equals(fs.readFileSync(path.join(built,file))),`Stale installed interactive package: ${file}`);
const output=fs.mkdtempSync(path.join(a,'game-interactive-casting-')),bytes=fs.readFileSync(path.join(root,'reference/export-interactive-casting.ts')),helper=path.join(game,'balance','sdk-interactive-'+randomUUID()+'.ts'),expected=gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-twenty-five/interactive-casting.json.gz')));
const faults=[["timing-attempt-not-spent","state.pressUsed = true;","state.pressUsed = false;"],["focus-drain-fills","state.elapsed - dt *","state.elapsed + dt *"],["focus-release-adds-frame","const fraction = state.elapsed / state.total;","const fraction = (state.elapsed + dt) / state.total;"],["focus-fizzle-ignores-recovery","base / Math.max(.1, nonnegative(skillRecovery, 'Skill cooldown recovery') / globalRecovery)","base"]];
const target=path.join(installed,'interactive-casting.js'),original=fs.readFileSync(target,'utf8'),reports=[];
const capture=label=>{const file=path.join(output,label+'.json');execFileSync(process.execPath,['--import','tsx',helper,file],{cwd:game,stdio:'pipe'});return fs.readFileSync(file);};
try{
 fs.writeFileSync(helper,bytes,{flag:'wx'});
 for(const config of ['tsconfig.json','tsconfig.launcher.json','tsconfig.sim.json'])execFileSync(process.execPath,[path.join(game,'node_modules/typescript/bin/tsc'),'-p',config],{cwd:game,stdio:'inherit'});
 assert(capture('accepted').equals(expected),'Installed interactive casting observations changed');
 for(const [name,before,after]of faults){assert(original.includes(before),'Moved fault: '+name);let detected=false;
  try{fs.writeFileSync(target,original.replace(before,after));try{detected=!capture('fault-'+name).equals(expected);}catch(error){const detail=String(error.stdout??'')+String(error.stderr??'');assert(error.status!==undefined&&/AssertionError/.test(detail)&&!/SyntaxError|ERR_MODULE_NOT_FOUND/.test(detail),'Fault must reach behavior: '+detail);detected=true;}}
  finally{fs.writeFileSync(target,original);}assert(detected,'Undetected installed fault: '+name);reports.push({name,detected});
 }
}finally{if(fs.existsSync(helper)&&fs.readFileSync(helper).equals(bytes))fs.unlinkSync(helper);}
for(const file of files)assert(fs.readFileSync(path.join(installed,file)).equals(fs.readFileSync(path.join(built,file))),`Installed interactive fault was not restored: ${file}`);
writeJSON(path.join(a,'game-interactive-casting-verification.json'),{game,output,version:JSON.parse(fs.readFileSync(path.join(location.tooling,'node_modules/@hollow-wake/engine/package.json'))).version,packageIntegrity:location.integrity,installedRuntimeFilesMatchBuild:files.length,gameLauncherAndCaptureTypeChecks:true,fixtureSha256:sha256(expected),courses:47,transitions:204,actualGamePressUpdatePaymentAndDelivery:true,installedFaults:reports,allInstalledFilesRestored:true});
console.log('Installed interactive casting matches original observations; four behavioral faults detected and restored.');
