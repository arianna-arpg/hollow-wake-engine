import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {root,listFiles,sha256,writeJSON} from './reference-utils.mjs';
import {readLifeRecoveryExpectations} from './check-life-recovery-contract.mjs';

const at=process.argv.indexOf('--location');assert(at<0||process.argv[at+1],'Missing recovery location');
const location=JSON.parse(fs.readFileSync(at<0?path.join(root,'.artifacts/adapter-location.json'):path.resolve(process.argv[at+1])));
assert.equal(location.lifeRecoveryAdapterDecision,'life-recovery-adapter/v1');
const verification=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/game-life-recovery-verification.json')));
const expectations=readLifeRecoveryExpectations();
assert.equal(verification.game,location.game);assert.equal(verification.packageIntegrity,location.integrity);
assert.equal(verification.courses,expectations.courses);assert(verification.typesPassed&&verification.allSourceAndPackageFilesUnchanged);
const snapshot=directory=>Object.fromEntries(listFiles(directory).map(file=>[file,sha256(fs.readFileSync(path.join(directory,file)))]));
const installed=fs.realpathSync(path.join(location.tooling,'node_modules/@hollow-wake/engine'));
const sourceBefore=snapshot(path.join(location.game,'src')),packageBefore=snapshot(installed);
assert.equal(sha256(JSON.stringify(sourceBefore)),verification.hostSourceSha256,'Game changed since its recovery comparison; finish other mutation checks or repeat the comparison');
assert.equal(sha256(JSON.stringify(packageBefore)),verification.packageFilesSha256,'Package changed since its recovery comparison; finish other mutation checks or repeat the comparison');
const output=fs.mkdtempSync(path.join(root,'.artifacts/recovery-installed-faults-')),game=path.join(output,'game'),modules=path.join(game,'node_modules');
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
const targets={runtime:path.join(ownPackage,'dist/life-recovery.js'),actor:path.join(game,'src/engine/actor.ts'),binding:path.join(game,'src/engine/lifeRecoveryAdapter.ts'),world:path.join(game,'src/engine/world.ts')};
for(const file of Object.values(targets)){
  const actual=fs.realpathSync(file),relative=path.relative(fs.realpathSync(game),actual),stat=fs.lstatSync(file);
  assert(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1,'Linked mutation target');
}
const unchanged=()=>{assert.deepEqual(snapshot(path.join(location.game,'src')),sourceBefore);assert.deepEqual(snapshot(installed),packageBefore);
  assert.deepEqual(snapshot(path.join(game,'src')),sourceBefore);assert.deepEqual(snapshot(ownPackage),packageBefore);readLifeRecoveryExpectations();};
const faults=[
  ['rate-ignored','runtime','amount * ports.rate(actor)','amount','life-recovery'],
  ['dead-heals','runtime','amount <= 0 || actor.dead','amount <= 0','life-recovery'],
  ['silent-stamps','runtime','if (!silent)','if (true)','life-recovery'],
  ['rate-before-life','runtime','actor.life + amount * ports.rate(actor)','amount * ports.rate(actor) + actor.life','life-recovery'],
  ['refill-not-silent','runtime','actor.life - before, true','actor.life - before, false','life-recovery'],
  ['flat-proc-skips-maximum','runtime','(effect.pctMax ?? 0) * ports.maximumLife(actor)','(effect.pctMax ? effect.pctMax * ports.maximumLife(actor) : 0)','heal-procs'],
  ['zero-proc-signals','runtime','ports.maximumLife(actor)) > 0','ports.maximumLife(actor)) >= 0','heal-cues'],
  ['proc-consults-call-property','runtime','invokeHeal(method, actor,','method.call(actor,','heal-invocation'],
  ['reservation-ignored','binding','return actor.lifeCeiling();','return actor.maxLife();','life-recovery'],
  ['observer-loses-silent','binding','actor.onLifeHealed?.(amount, silent)','actor.onLifeHealed?.(amount, false)','life-recovery'],
  ['tap-omitted','binding','SIM_TAP.current?.onHeal?.(actor, amount);','void amount;','life-recovery'],
  ['recency-omitted','binding',"actor.noteRecent('heal');",'void actor;','life-recovery'],
  ['actor-loses-silent','actor','engineHealLife(this, amount, lifeRecoveryPorts, silent)','engineHealLife(this, amount, lifeRecoveryPorts, false)','life-recovery'],
  ['refill-uses-healing-gates','actor','engineRefillLife(this, lifeRecoveryPorts)','engineHealLife(this, 1000, lifeRecoveryPorts, false)','life-recovery'],
  ['heal-cue-omitted','world',"if (engineApplyProcHeal(caster, fx, lifeRecoveryPorts, caster.healBy)) noteProcCue(caster, procCue, 'gain', proc.id);",'engineApplyProcHeal(caster, fx, lifeRecoveryPorts, caster.healBy);','heal-cues'],
  ['method-selected-too-late','world','lifeRecoveryPorts, caster.healBy)','lifeRecoveryPorts, amount => caster.healBy(amount))','heal-method-resolution'],
  ['riders-omitted','world','this.fireProcRiders(proc, caster, inst, target, depth);','void proc;','heal-procs'],
];
const results=[];
for(const[name,target,before,after,fixture]of faults){
  const file=targets[target],source=fs.readFileSync(file,'utf8');assert.equal(source.split(before).length,2,'Changed installed fault anchor: '+name);
  let result;try{fs.writeFileSync(file,source.replace(before,after));result=run('fault-'+name,fixture);assert(!result.equal,'Installed fault escaped: '+name);}
  finally{fs.writeFileSync(file,source);unchanged();}
  results.push({name,target,fixture,detected:true,logSha256:result.logSha256});console.log('Rejected recovery fault: '+name);
}
unchanged();writeJSON(path.join(root,'.artifacts/life-recovery-installed-faults.json'),{output,game:location.game,disposableGame:game,packageIntegrity:location.integrity,
  controlCourses:courses,faults:results,suppliedGameAndPackageUnchanged:true,disposableSourceAndPackageRestored:true});
