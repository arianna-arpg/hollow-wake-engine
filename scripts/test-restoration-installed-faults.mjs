import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {root,listFiles,sha256,writeJSON} from './reference-utils.mjs';
import {readRestorationExpectations} from './check-restoration-contract.mjs';
import {restorationDecision} from '../adapters/hollow-wake/integrate-resource-restoration.mjs';
import {exportedFunctionBody} from './exported-function-body.mjs';

const at=process.argv.indexOf('--location');assert(at<0||process.argv[at+1],'Missing restoration location');
const location=JSON.parse(fs.readFileSync(at<0?path.join(root,'.artifacts/adapter-location.json'):path.resolve(process.argv[at+1])));
assert.equal(location.resourceRestorationAdapterDecision,restorationDecision);
const verification=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/game-restoration-verification.json')));
const expectations=readRestorationExpectations();
assert.equal(verification.game,location.game);assert.equal(verification.packageIntegrity,location.integrity);
assert.equal(verification.courses,expectations.courses);assert(verification.typesPassed&&verification.allSourceAndPackageFilesUnchanged);
const snapshot=directory=>Object.fromEntries(listFiles(directory).map(file=>[file,sha256(fs.readFileSync(path.join(directory,file)))]));
const installed=fs.realpathSync(path.join(location.tooling,'node_modules/@hollow-wake/engine'));
const sourceBefore=snapshot(path.join(location.game,'src')),packageBefore=snapshot(installed);
assert.equal(sha256(JSON.stringify(sourceBefore)),verification.hostSourceSha256,'Game changed since its restoration comparison; finish other mutation checks or repeat the comparison');
assert.equal(sha256(JSON.stringify(packageBefore)),verification.packageFilesSha256,'Package changed since its restoration comparison; finish other mutation checks or repeat the comparison');
const output=fs.mkdtempSync(path.join(root,'.artifacts/restoration-installed-faults-')),game=path.join(output,'game'),modules=path.join(game,'node_modules');
function copy(directory,target){for(const file of listFiles(directory)){
  const destination=path.join(target,file);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(path.join(directory,file),destination,fs.constants.COPYFILE_EXCL);
}}
// All mutations target newly copied regular files. Neither the supplied game nor
// its installed package is writable through this harness, including retained controls.
copy(path.join(location.game,'src'),path.join(game,'src'));fs.copyFileSync(path.join(location.game,'package.json'),path.join(game,'package.json'));
for(const name of ['tsconfig.json','tsconfig.sim.json'])fs.copyFileSync(path.join(location.game,name),path.join(game,name));
fs.mkdirSync(modules,{recursive:true});
for(const entry of fs.readdirSync(path.join(location.tooling,'node_modules'),{withFileTypes:true})){
  const dependency=path.join(location.tooling,'node_modules',entry.name);
  // Prepared graphs may already share read-only third-party tool directories.
  // The SDK itself is always copied into regular files below.
  if(entry.name==='@hollow-wake'||!fs.statSync(dependency).isDirectory())continue;
  fs.symlinkSync(dependency,path.join(modules,entry.name),process.platform==='win32'?'junction':'dir');
}
const ownPackage=path.join(modules,'@hollow-wake/engine');copy(installed,ownPackage);
assert.deepEqual(snapshot(path.join(game,'src')),sourceBefore);assert.deepEqual(snapshot(ownPackage),packageBefore);
const {fixtures,helpers:captureHelpers,rows,courses}=expectations,helpers=new Map();
for(const row of captureHelpers){const file=path.join(output,path.basename(row.file)),source=fs.readFileSync(path.join(root,row.file),'utf8');
  fs.writeFileSync(file,source.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,(_all,_q,p)=>JSON.stringify(pathToFileURL(path.join(game,'src',p+'.ts')).href)),{flag:'wx'});helpers.set(row.file,file);
}
function run(name,fixture){
  const row=rows.find(r=>r.name===fixture);assert(row);const destination=path.join(output,name+'.json');
  const result=spawnSync(process.execPath,['--import',pathToFileURL(path.join(game,'node_modules/tsx/dist/loader.mjs')).href,helpers.get(row.helper),destination],
    {cwd:game,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:4*1024*1024});
  assert.equal(result.error,undefined);const log=result.stdout+result.stderr;fs.writeFileSync(path.join(output,name+'.txt'),log,{flag:'wx'});
  if(result.status!==0){assert.match(log,/AssertionError/,'Unrelated fault failure: '+name);assert(!/SyntaxError|ERR_MODULE_NOT_FOUND/.test(log));return{equal:false,logSha256:sha256(log)};}
  return{equal:fs.readFileSync(destination).equals(fixtures.get(fixture).bytes),logSha256:sha256(log)};
}
for(const row of rows)assert(run('control-'+row.name,row.name).equal,'Disposable copy changed: '+row.name);
const targets={runtime:path.join(ownPackage,'dist/resource-restoration.js'),actor:path.join(game,'src/engine/actor.ts'),binding:path.join(game,'src/engine/resourceRestorationAdapter.ts'),world:path.join(game,'src/engine/world.ts')};
for(const file of Object.values(targets)){
  const actual=fs.realpathSync(file),relative=path.relative(fs.realpathSync(game),actual),stat=fs.lstatSync(file);
  assert(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1,'Linked mutation target');
}
const unchanged=()=>{assert.deepEqual(snapshot(path.join(location.game,'src')),sourceBefore);assert.deepEqual(snapshot(installed),packageBefore);
  assert.deepEqual(snapshot(path.join(game,'src')),sourceBefore);assert.deepEqual(snapshot(ownPackage),packageBefore);readRestorationExpectations();};
const faults=[
  ['shield-no-clamp','runtime','Math.min(max, actor.es + amount)','actor.es + amount','restoration','gainEnergyShield'],
  ['shield-dead-gains','runtime','amount <= 0 || actor.dead','amount <= 0','restoration','gainEnergyShield'],
  ['shield-threshold-lost','runtime','actor.es >= max - 0.001','actor.es >= max','restoration','gainEnergyShield'],
  ['poise-overcharge-lost','runtime','max * (1 + ports.poiseOvercharge(actor))','max','restoration','gainPoise'],
  ['event-overflow','runtime','actor.gainEvents.length < 64','actor.gainEvents.length <= 64','restoration','applyInstantRestoration'],
  ['event-tags-copied','runtime','tags: options?.tags','tags: options?.tags ? [...options.tags] : undefined','partial-failure','applyInstantRestoration'],
  ['zero-gain-skips-cue-read','runtime',"if (effect.resource !== 'poise')","if (landed > 0 && effect.resource !== 'poise')",'partial-failure','applyInstantRestoration'],
  ['proc-wrong-mana-base','runtime','ports.maximumMana(actor)','ports.availableMana(actor)','pool-bases','applyProcRestoration'],
  ['proc-zero-signals','runtime','return after > before;','return after >= before;','restoration','applyProcRestoration'],
  ['proc-delay-reset-lost','runtime','if (effect.resetEsDelay)','if (false)','restoration','applyProcRestoration'],
  ['available-mana-ignored','binding','return actor.availableMaxMana();','return actor.maxMana();','restoration'],
  ['instant-method-selected-late','binding','return actor.gainEs(effect.amount);','const amount = effect.amount; return actor.gainEs(amount);','invocation'],
  ['instant-consults-custom-call','binding','return actor.gainEs(effect.amount);','return actor.gainEs.call(actor, effect.amount);','invocation'],
  ['feeding-notification-lost','binding','noteRestoreGain(actor, resource, amount, cue);','void actor;','restoration'],
  ['actor-shield-path-disconnected','actor','return engineGainEnergyShield(this, amount, resourceRestorationPorts);','return 0;','world'],
  ['actor-poise-blocks-broken','actor','return engineGainPoise(this, amount, resourceRestorationPorts);','if (this.poiseBroken) return 0; return engineGainPoise(this, amount, resourceRestorationPorts);','restoration'],
  ['instant-options-lost','world','(target, fx, resourceRestorationPorts, opts);','(target, fx, resourceRestorationPorts);','partial-failure'],
  ['proc-gain-cue-lost','world',"if (engineApplyProcRestoration(caster, fx, resourceRestorationPorts)) noteProcCue(caster, procCue, 'gain', proc.id);",'engineApplyProcRestoration(caster, fx, resourceRestorationPorts);','restoration'],
];
const results=[];
for(const[name,target,before,after,fixture,method]of faults){
  const file=targets[target],source=fs.readFileSync(file,'utf8');
  const {start,end}=method?exportedFunctionBody(source,method):{start:0,end:source.length},region=source.slice(start,end);
  assert.equal(region.split(before).length,2,'Changed installed fault anchor: '+name);
  const changed=source.slice(0,start)+region.replace(before,after)+source.slice(end);
  let result;try{fs.writeFileSync(file,changed);result=run('fault-'+name,fixture);assert(!result.equal,'Installed fault escaped: '+name);}
  finally{fs.writeFileSync(file,source);unchanged();}
  results.push({name,target,fixture,detected:true,logSha256:result.logSha256});console.log('Rejected restoration fault: '+name);
}
unchanged();writeJSON(path.join(root,'.artifacts/restoration-installed-faults.json'),{output,game:location.game,disposableGame:game,packageIntegrity:location.integrity,
  controlCourses:courses,faults:results,suppliedGameAndPackageUnchanged:true,disposableSourceAndPackageRestored:true});
