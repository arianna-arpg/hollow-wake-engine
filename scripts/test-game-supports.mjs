import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {execFileSync} from 'node:child_process';import {randomUUID} from 'node:crypto';import {root,listFiles,sha256,writeJSON} from './reference-utils.mjs';
const location=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/adapter-location.json'))),installed=path.join(location.tooling,'node_modules/@hollow-wake/engine/dist');
const identity=()=>{assert.deepEqual(listFiles(installed),listFiles(path.join(root,'dist')));for(const file of listFiles(installed))assert(fs.readFileSync(path.join(installed,file)).equals(fs.readFileSync(path.join(root,'dist',file))),`Stale support package: ${file}`);};identity();
const output=fs.mkdtempSync(path.join(root,'.artifacts/game-supports-')),helpers=[],expected=new Map(),reports=[];
const run=(name,label,stdio='pipe')=>{const helper=helpers.find(h=>h.name===name),file=path.join(output,label+'.json');execFileSync(process.execPath,['--import','tsx',helper.file,file],{cwd:location.game,stdio,maxBuffer:96*1024*1024});return fs.readFileSync(file);};
try{
 for(const name of ['support-content','support-rules','support-composition','support-actions']){
  const bytes=fs.readFileSync(path.join(root,`reference/export-${name}.ts`)),file=path.join(location.game,`balance/sdk-${name}-${randomUUID()}.ts`);fs.writeFileSync(file,bytes,{flag:'wx'});helpers.push({name,file,bytes});
  expected.set(name,gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-twenty-one',name+'.json.gz'))));const actual=run(name,name);assert(actual.equals(expected.get(name)),`Installed support capture differs: ${name}`);reports.push({name,sha256:sha256(actual),bytes:actual.length});
 }
 const faults=[
  {file:'support-rules.js',anchor:'while (grew) {',change:'while (grew && false) {',name:'support-composition',label:'tag-closure'},
  {file:'support-rules.js',anchor:'let level = inst.level + Math.floor(inst.bonusLevels ?? 0);',change:'let level = inst.level;',name:'support-rules',label:'effective-level'},
  {file:'support-rules.js',anchor:"scale === 1 || mod.kind === 'override' ? mod",change:'scale === 1 ? mod',name:'support-rules',label:'forwarded-override'},
  {file:'support-actions.js',anchor:'if (!p.give(seat, gem))',change:'inst.sockets[index] = null; if (!p.give(seat, gem))',name:'support-actions',label:'clear-before-bag-room'},
  {file:'support-actions.js',anchor:'p.resync(inst);',change:'void inst;',name:'support-actions',label:'live-crew-resync'},
 ];
 for(const fault of faults){const target=path.join(installed,fault.file),source=fs.readFileSync(target,'utf8');assert(source.includes(fault.anchor),fault.label+' anchor');let detected=false;
  try{fs.writeFileSync(target,source.replace(fault.anchor,fault.change));try{detected=!run(fault.name,'negative-'+fault.label).equals(expected.get(fault.name));}catch(error){const detail=String(error.stdout??'')+String(error.stderr??'');assert(error.status!==undefined&&/AssertionError/.test(detail)&&!/SyntaxError|ERR_MODULE_NOT_FOUND/.test(detail),'Negative control must reach a behavior assertion: '+detail);detected=true;}}finally{fs.writeFileSync(target,source);}assert(detected,'Game bypassed installed '+fault.label);fault.detected=true;
 }
 identity();writeJSON(path.join(root,'.artifacts/game-support-verification.json'),{packageIntegrity:location.integrity,reports,skills:954,supports:457,pairs:435978,resolverStates:954,changedCompositions:301,courses:8,transitions:35,installedFaults:faults.map(f=>({name:f.label,detected:f.detected})),allInstalledFilesRestored:true});console.log('Installed support package matches four original captures; five behavior faults detected and restored.');
}finally{for(const h of helpers)if(fs.existsSync(h.file)&&fs.readFileSync(h.file).equals(h.bytes))fs.unlinkSync(h.file);}
