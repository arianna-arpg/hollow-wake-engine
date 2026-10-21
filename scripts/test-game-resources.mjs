import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {execFileSync} from 'node:child_process';import {randomUUID} from 'node:crypto';
import {root,listFiles,sha256,writeJSON} from './reference-utils.mjs';
const a=path.join(root,'.artifacts'),location=JSON.parse(fs.readFileSync(path.join(a,'adapter-location.json'))),game=location.game;
const installed=path.join(location.tooling,'node_modules/@hollow-wake/engine/dist'),built=path.join(root,'dist'),files=listFiles(built);assert.deepEqual(listFiles(installed),files);
for(const file of files)assert(fs.readFileSync(path.join(installed,file)).equals(fs.readFileSync(path.join(built,file))),`Stale installed resource package: ${file}`);
const output=fs.mkdtempSync(path.join(a,'game-resources-')),names=['charge-banks','charge-clocks','resource-gauges','resource-world','resource-costs'],helpers=[],reports=[],faults=[
 {module:'charge-runtime',anchor:'if (next > cur)',change:'if (next >= cur)',name:'charge-banks',label:'capped-idle-refresh'},
 {module:'charge-runtime',anchor:'if (rst.tick >= 1)',change:'while (rst.tick >= 1)',name:'charge-clocks',label:'regen-debt-partition'},
 {module:'charge-runtime',anchor:"if (key.startsWith('treeTap:') && !treeKeys.has(key))",change:'if (false)',name:'charge-clocks',label:'retired-tree-clock'},
 {module:'charge-runtime',anchor:'Math.min(have, cost.amount)',change:'Math.max(have, cost.amount)',name:'resource-costs',label:'bank-overpayment'},
 {module:'resource-gauges',anchor:'dt = -left;',change:'dt = dt;',name:'resource-gauges',label:'gauge-lockout-remainder'},
];
const run=(h,label)=>{const file=path.join(output,label+'.json');execFileSync(process.execPath,['--import','tsx',h.file,file],{cwd:game,stdio:'pipe'});return fs.readFileSync(file);};
try{
 for(const name of names){const bytes=fs.readFileSync(path.join(root,'reference/export-'+name+'.ts')),file=path.join(game,'balance','sdk-resource-'+randomUUID()+'.ts');fs.writeFileSync(file,bytes,{flag:'wx'});helpers.push({name,bytes,file});}
 const tsc=path.join(game,'node_modules/typescript/bin/tsc');
 for(const config of ['tsconfig.json','tsconfig.launcher.json','tsconfig.sim.json'])execFileSync(process.execPath,[tsc,'-p',config],{cwd:game,stdio:'inherit'});
 for(const h of helpers){const file=path.join(output,h.name+'.json');execFileSync(process.execPath,['--import','tsx',h.file,file],{cwd:game,stdio:'inherit'});
  const actual=fs.readFileSync(file),expected=gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-twenty-two',h.name+'.json.gz')));
  assert.deepEqual(JSON.parse(actual),JSON.parse(expected),h.name+' installed resource behavior');assert(actual.equals(expected),h.name+' wire bytes changed');reports.push({name:h.name,sha256:sha256(actual),bytes:actual.length});
 }
 for(const f of faults){const target=path.join(installed,f.module+'.js'),original=fs.readFileSync(target,'utf8'),h=helpers.find(h=>h.name===f.name),expected=gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-twenty-two',f.name+'.json.gz')));assert(original.includes(f.anchor),'Fault target moved: '+f.label);let detected=false;
  try{fs.writeFileSync(target,original.replace(f.anchor,f.change));try{detected=!run(h,'negative-'+f.label).equals(expected);}catch(error){const detail=String(error.stdout??'')+String(error.stderr??'');assert(error.status!==undefined&&/AssertionError/.test(detail)&&!/SyntaxError|ERR_MODULE_NOT_FOUND/.test(detail),'Fault must reach behavior: '+detail);detected=true;}}finally{fs.writeFileSync(target,original);}assert(detected,'Installed resource fault was not detected: '+f.label);f.detected=true;
 }
 for(const file of files)assert(fs.readFileSync(path.join(installed,file)).equals(fs.readFileSync(path.join(built,file))),'Installed files were not restored: '+file);
}finally{for(const h of helpers)if(fs.existsSync(h.file)&&fs.readFileSync(h.file).equals(h.bytes))fs.unlinkSync(h.file);}
writeJSON(path.join(a,'game-resource-verification.json'),{game,output,packageIntegrity:location.integrity,version:JSON.parse(fs.readFileSync(path.join(location.tooling,'node_modules/@hollow-wake/engine/package.json'))).version,installedRuntimeFilesMatchBuild:files.length,gameLauncherAndCaptureTypeChecks:true,reports,installedFaults:faults.map(f=>({name:f.label,detected:f.detected})),allInstalledFilesRestored:true});
console.log('Installed resource banks, clocks, gauges, full World courses and all authored payment cases match original bytes; five installed behavior faults detected and restored.');
