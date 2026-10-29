import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {root,listFiles,sha256,writeJSON} from './reference-utils.mjs';import {readCooldownExpectations,cooldownTree} from './check-cooldown-contract.mjs';
import {cooldownDecision} from '../adapters/hollow-wake/integrate-cooldowns.mjs';import {exportedFunctionBody} from './exported-function-body.mjs';
const at=process.argv.indexOf('--location');assert(at<0||process.argv[at+1]);
const location=JSON.parse(fs.readFileSync(at<0?path.join(root,'.artifacts/adapter-location.json'):path.resolve(process.argv[at+1])));
assert.equal(location.cooldownAdapterDecision,cooldownDecision);
const verification=JSON.parse(fs.readFileSync(path.join(root,'.artifacts/game-cooldown-verification.json'))),expectations=readCooldownExpectations();
assert.equal(verification.game,location.game);assert.equal(verification.packageIntegrity,location.integrity);assert(verification.typesPassed&&verification.allSourceAndPackageFilesUnchanged);
const snapshot=directory=>Object.fromEntries(listFiles(directory).map(file=>[file,sha256(fs.readFileSync(path.join(directory,file)))]));
const installed=fs.realpathSync(path.join(location.tooling,'node_modules/@hollow-wake/engine')),sourceBefore=snapshot(path.join(location.game,'src')),packageBefore=snapshot(installed);
assert.equal(sha256(JSON.stringify(sourceBefore)),verification.hostSourceSha256);assert.equal(sha256(JSON.stringify(packageBefore)),verification.packageFilesSha256);
const output=fs.mkdtempSync(path.join(root,'.artifacts/cooldown-installed-faults-')),game=path.join(output,'game'),modules=path.join(game,'node_modules');
function copy(directory,target){for(const file of listFiles(directory)){const destination=path.join(target,file);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(path.join(directory,file),destination,fs.constants.COPYFILE_EXCL);}}
copy(path.join(location.game,'src'),path.join(game,'src'));
for(const file of ['package.json','tsconfig.json','tsconfig.sim.json'])fs.copyFileSync(path.join(location.game,file),path.join(game,file));
fs.mkdirSync(modules,{recursive:true});
for(const entry of fs.readdirSync(path.join(location.tooling,'node_modules'),{withFileTypes:true})){
 const dependency=path.join(location.tooling,'node_modules',entry.name);if(entry.name==='@hollow-wake'||!fs.statSync(dependency).isDirectory())continue;
 fs.symlinkSync(dependency,path.join(modules,entry.name),process.platform==='win32'?'junction':'dir');}
const ownPackage=path.join(modules,'@hollow-wake/engine');copy(installed,ownPackage);
assert.deepEqual(snapshot(path.join(game,'src')),sourceBefore);assert.deepEqual(snapshot(ownPackage),packageBefore);
const {fixtures,helpers:captureHelpers,rows,courses}=expectations,helpers=new Map();
for(const row of captureHelpers){const file=path.join(output,path.basename(row.file)),source=fs.readFileSync(path.join(root,row.file),'utf8');
 fs.writeFileSync(file,source.replace(/(['"])\.\.\/src\/([^'"]+)\1/g,(_all,_q,p)=>JSON.stringify(pathToFileURL(path.join(game,'src',p+'.ts')).href)),{flag:'wx'});helpers.set(row.file,file);}
function run(name,fixture){const row=rows.find(item=>item.name===fixture);assert(row);const destination=path.join(output,name+'.json');
 const result=spawnSync(process.execPath,['--import',pathToFileURL(path.join(game,'node_modules/tsx/dist/loader.mjs')).href,helpers.get(row.helper),destination],{cwd:game,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:4*1024*1024});
 assert.equal(result.error,undefined);const log=result.stdout+result.stderr;fs.writeFileSync(path.join(output,name+'.txt'),log,{flag:'wx'});
 if(result.status!==0){assert.match(log,/AssertionError/,'Unrelated installed cooldown failure: '+name);assert(!/SyntaxError|ERR_MODULE_NOT_FOUND|ReferenceError/.test(log));return {equal:false,logSha256:sha256(log)};}
 return {equal:fs.readFileSync(destination).equals(fixtures.get(fixture).bytes),logSha256:sha256(log)};
}
for(const row of rows)assert(run('control-'+row.name,row.name).equal,'Disposable cooldown control changed: '+row.name);
const targets={runtime:path.join(ownPackage,'dist/cooldowns.js'),world:path.join(game,'src/engine/world.ts')};
for(const file of Object.values(targets)){const relative=path.relative(fs.realpathSync(game),fs.realpathSync(file)),stat=fs.lstatSync(file);
 assert(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1,'Linked cooldown mutation target');}
const unchanged=()=>{assert.deepEqual(snapshot(path.join(location.game,'src')),sourceBefore);assert.deepEqual(snapshot(installed),packageBefore);
 assert.deepEqual(snapshot(path.join(game,'src')),sourceBefore);assert.deepEqual(snapshot(ownPackage),packageBefore);readCooldownExpectations();};
const call='engineApplyProcCooldown(caster, fx, inst)',cue="noteProcCue(caster, procCue, 'gain', proc.id);",statement='if ('+call+') '+cue;
const faults=[
 ['sdk-path-disconnected','runtime',[['return changed;','return false;'],['for (const [id, remaining] of [...actor.cooldowns])','for (const [id, remaining] of [])']],'rules'],
 ['live-map-iteration','runtime',[['[...actor.cooldowns]','actor.cooldowns']],'rules'],
 ['empty-tags-skipped','runtime',[['if (effect.tags)','if (effect.tags?.length)']],'rules'],
 ['arithmetic-reassociated','runtime',[['remaining - (effect.seconds ?? 0) - remaining * (effect.fraction ?? 0)','remaining * (1 - (effect.fraction ?? 0)) - (effect.seconds ?? 0)']],'rules'],
 ['last-duplicate-instance','runtime',[['actor.skills.find(','[...actor.skills].reverse().find(']],'rules'],
 ['stale-map','runtime',[['let changed = false;','let changed = false; const clocks = actor.cooldowns;'],['actor.cooldowns.delete(id)','clocks.delete(id)'],['actor.cooldowns.set(id, left)','clocks.set(id, left)']],'live'],
 ['stale-effect','runtime',[['let changed = false;','let changed = false; effect = {...effect};']],'live'],
 ['trigger-disconnected','world',[[call,'engineApplyProcCooldown(caster, fx, null)']],'rules'],
 ['cue-unconditional','world',[[statement,call+'; '+cue]],'rules'],
 ['cue-omitted','world',[[statement,call+';']],'rules'],
 ['cue-before-mutation','world',[[statement,cue+' '+call+';']],'live'],
 ['rider-tail-skipped','world',[['break;','return;']],'rules'],
 ['effect-applied-twice','world',[[statement,call+'; '+statement]],'rules'],
 ['failure-swallowed','world',[[statement,'try { '+statement+' } catch {}']],'rules'],
];
const results=[];
for(const[name,target,edits,fixture]of faults){const file=targets[target],source=fs.readFileSync(file,'utf8');
 const region=target==='runtime'?exportedFunctionBody(source,'applyProcCooldown'):(()=>{const tree=cooldownTree(source);return {start:tree.clause.getStart(tree.ast),end:tree.clause.end};})();
 let text=source.slice(region.start,region.end);for(const[before,after]of edits){assert.equal(text.split(before).length,2,'Changed installed cooldown anchor: '+name);text=text.replace(before,after);}
 let result;try{fs.writeFileSync(file,source.slice(0,region.start)+text+source.slice(region.end));result=run('fault-'+name,fixture);assert(!result.equal,'Installed cooldown fault escaped: '+name);}
 finally{fs.writeFileSync(file,source);unchanged();}
 results.push({name,target,fixture,detected:true,logSha256:result.logSha256});console.log('Rejected cooldown installed fault: '+name);
}
unchanged();writeJSON(path.join(root,'.artifacts/cooldown-installed-faults.json'),{output,game:location.game,disposableGame:game,packageIntegrity:location.integrity,
 controlCourses:courses,faults:results,suppliedGameAndPackageUnchanged:true,disposableSourceAndPackageRestored:true});
