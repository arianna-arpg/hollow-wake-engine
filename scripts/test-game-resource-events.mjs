import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {execFileSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
import {root,listFiles,sha256,writeJSON} from './reference-utils.mjs';
const a=path.join(root,'.artifacts'),location=JSON.parse(fs.readFileSync(path.join(a,'adapter-location.json'))),game=location.game,installed=path.join(location.tooling,'node_modules/@hollow-wake/engine/dist'),built=path.join(root,'dist'),files=listFiles(built);
assert.deepEqual(listFiles(installed),files);for(const file of files)assert(fs.readFileSync(path.join(installed,file)).equals(fs.readFileSync(path.join(built,file))),`Stale installed event package: ${file}`);
const output=fs.mkdtempSync(path.join(a,'game-resource-events-')),bytes=fs.readFileSync(path.join(root,'reference/export-resource-events.ts')),helper=path.join(game,'balance','sdk-resource-events-'+randomUUID()+'.ts'),expected=gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-twenty-three/resource-events.json.gz')));
const faults=[['inclusive-chance','return roll < probability;','return roll <= probability;'],['reversed-slots','for (const inst of p.skills(actor))','for (const inst of [...p.skills(actor)].reverse())'],['bank-after-shave','continue;\n                    }\n                    gaugeAdd','/* lost continue */\n                    }\n                    gaugeAdd']];
const target=path.join(installed,'resource-events.js'),original=fs.readFileSync(target,'utf8'),reports=[];
const capture=label=>{const file=path.join(output,label+'.json');execFileSync(process.execPath,['--import','tsx',helper,file,'--sdk-events'],{cwd:game,stdio:'pipe'});return fs.readFileSync(file);};
try{
 fs.writeFileSync(helper,bytes,{flag:'wx'});for(const config of ['tsconfig.json','tsconfig.launcher.json','tsconfig.sim.json'])execFileSync(process.execPath,[path.join(game,'node_modules/typescript/bin/tsc'),'-p',config],{cwd:game,stdio:'inherit'});
 assert(capture('accepted').equals(expected),'Installed event observations changed');
 for(const [name,before,after]of faults){assert(original.includes(before),'Moved fault: '+name);let detected=false;
  try{fs.writeFileSync(target,original.replace(before,after));try{detected=!capture('fault-'+name).equals(expected);}catch(error){const detail=String(error.stdout??'')+String(error.stderr??'');assert(error.status!==undefined&&/AssertionError/.test(detail)&&!/SyntaxError|ERR_MODULE_NOT_FOUND/.test(detail),'Fault must reach behavior: '+detail);detected=true;}}
  finally{fs.writeFileSync(target,original);}assert(detected,'Undetected installed fault: '+name);reports.push({name,detected});
 }
}finally{if(fs.existsSync(helper)&&fs.readFileSync(helper).equals(bytes))fs.unlinkSync(helper);}
for(const file of files)assert(fs.readFileSync(path.join(installed,file)).equals(fs.readFileSync(path.join(built,file))),`Installed event fault was not restored: ${file}`);
writeJSON(path.join(a,'game-resource-event-verification.json'),{game,output,version:JSON.parse(fs.readFileSync(path.join(location.tooling,'node_modules/@hollow-wake/engine/package.json'))).version,packageIntegrity:location.integrity,installedRuntimeFilesMatchBuild:files.length,gameLauncherAndCaptureTypeChecks:true,fixtureSha256:sha256(expected),predicateCases:1300,dispatchTransitions:21,privatePredicateUsesExplicitSDKBinding:true,dispatchUsesActualGameCaller:true,installedFaults:reports,allInstalledFilesRestored:true});
console.log('Installed resource events match original observations; three behavioral faults detected and restored.');
