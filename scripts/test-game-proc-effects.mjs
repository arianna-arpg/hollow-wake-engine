import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync} from 'node:zlib';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {root,listFiles,sha256,verifyReference,writeJSON} from './reference-utils.mjs';
const artifacts=path.join(root,'.artifacts'),arg=process.argv.indexOf('--location'),location=JSON.parse(fs.readFileSync(arg<0?path.join(artifacts,'adapter-location.json'):path.resolve(process.argv[arg+1])));
assert.equal(location.procEffectAdapterDecision,'proc-ward-game-adapter/v1','Requires the guarded ward adapter');
const game=location.game,installed=path.join(location.tooling,'node_modules/@hollow-wake/engine/dist'),canonical=p=>fs.realpathSync(p).toLowerCase();
for(const file of ['m36-condition-control/retained.json','m37-initial-candidate/retained.json','m37-proc-control/retained.json','m38-prepared-adapter-location.json','m38-proc-initial/retained.json','m38-observation-control/retained.json','m38-native-array-initial-control/retained.json','m38-effect-control/retained.json']){
  const retainedPath=path.join(artifacts,file);if(!fs.existsSync(retainedPath))continue;const retained=JSON.parse(fs.readFileSync(retainedPath)),control=retained.location??retained;
  assert.notEqual(canonical(game),canonical(control.game),'Refusing to mutate a retained game');assert.notEqual(canonical(location.tooling),canonical(control.tooling),'Refusing to mutate a retained runtime');
  assert.notEqual(canonical(path.join(game,'src')),canonical(path.join(control.game,'src')),'Retained source junction');
  assert.notEqual(canonical(installed),canonical(path.join(control.tooling,'node_modules/@hollow-wake/engine/dist')),'Retained package junction');
}
const reference=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(reference,lock);
assert.notEqual(canonical(game),canonical(reference));assert.notEqual(canonical(installed),canonical(path.join(root,'dist')));
assert.notEqual(canonical(path.join(game,'src')),canonical(path.join(reference,'src')),'Original source junction');
const snapshot=dir=>Object.fromEntries(listFiles(dir).map(file=>[file,sha256(fs.readFileSync(path.join(dir,file)))]));
const hostBefore=snapshot(path.join(game,'src')),runtimeBefore=snapshot(installed),output=fs.mkdtempSync(path.join(artifacts,'game-proc-effects-'));
const unchanged=()=>{assert.deepEqual(snapshot(path.join(game,'src')),hostBefore);assert.deepEqual(snapshot(installed),runtimeBefore);verifyReference(reference,lock);};
const acceptance=JSON.parse(fs.readFileSync(path.join(root,'baseline/milestone-thirty-nine/acceptance.json'))),addendum=JSON.parse(fs.readFileSync(path.join(root,'baseline/milestone-thirty-nine/ward-addendum.json')));
const fixtures=[...acceptance.fixtures,...addendum.fixtures],helpers=new Map(),typed=[];
function prepare(source,directory,name){
  const runtime=path.join(output,name+'.ts'),type=path.join(output,name+'.typed.ts'),imports=/(['"])\.\.\/src\/([^'"]+)\1/g;
  fs.writeFileSync(runtime,source.replace(imports,(_all,_q,p)=>JSON.stringify(pathToFileURL(path.join(directory,'src',p+'.ts')).href)));
  fs.writeFileSync(type,source.replace(imports,(_all,_q,p)=>JSON.stringify(path.relative(output,path.join(directory,'src',p)).replaceAll('\\','/'))));return {runtime,type};
}
for(const row of [...acceptance.helpers,...addendum.helpers]){
  const source=fs.readFileSync(path.join(root,row.file),'utf8');assert.equal(sha256(source),row.sha256);const prepared=prepare(source,game,path.basename(row.file,'.ts'));typed.push(prepared.type);helpers.set(row.file,prepared.runtime);
}
const hostSource=fs.readFileSync(path.join(root,'reference/check-proc-ward-host.ts'),'utf8'),host=prepare(hostSource,game,'ward-host'),originalHost=prepare(hostSource,reference,'original-ward-host');typed.push(host.type);
const run=(name,args,cwd=game)=>{const fd=fs.openSync(path.join(output,name+'.txt'),'wx');try{execFileSync(process.execPath,args,{cwd,stdio:['ignore',fd,fd]});}finally{fs.closeSync(fd);}return path.join(output,name+'.txt');};
const args=(helper,destination,directory=game)=>['--import',pathToFileURL(path.join(directory,'node_modules/tsx/dist/loader.mjs')).href,helper,destination];
for(const [name,directory,files]of [['types',game,typed],['original-host-types',reference,[originalHost.type]]]){
  const config=path.join(output,name+'.json');writeJSON(config,{extends:path.join(directory,'tsconfig.sim.json'),compilerOptions:{typeRoots:[path.join(directory,'node_modules/@types')]},include:[path.join(directory,'src'),...files],exclude:[]});
  run(name,[path.join(directory,'node_modules/typescript/bin/tsc'),'-p',config],directory);unchanged();
}
run('original-host',args(originalHost.runtime,path.join(output,'original-host.json'),reference),reference);unchanged();
run('ward-host',args(host.runtime,path.join(output,'ward-host.json')));unchanged();assert(fs.readFileSync(path.join(output,'ward-host.json')).equals(fs.readFileSync(path.join(output,'original-host.json'))),'Native ward hook/cue comparison differs');
const expected=new Map(),results=[];
for(const row of fixtures){
  const compressed=fs.readFileSync(path.join(root,row.file));assert.equal(sha256(compressed),row.compressedSha256);const bytes=gunzipSync(compressed);assert.equal(sha256(bytes),row.fixtureSha256);expected.set(row.name,bytes);
  const destination=path.join(output,row.name+'.json');run(row.name,args(helpers.get(row.helper),destination));const actual=fs.readFileSync(destination);assert(actual.equals(bytes),'Installed effect observation differs: '+row.name);unchanged();
  results.push({name:row.name,courses:row.courses,byteEqual:true,sha256:sha256(actual)});console.log('PASS installed '+row.name);
}
const targets={runtime:path.join(installed,'proc-effects.js'),binding:path.join(game,'src/engine/procEffectAdapter.ts'),world:path.join(game,'src/engine/world.ts')},faults=[];
for(const [name,target,before,after,fixture]of [
  ['zero-power-clears','runtime','pw === 1 || !(pw > 0)','pw === 1 || pw < 0','proc-effects-scaling'],
  ['ward-percent-unscaled','runtime','pctMaxLife: fx.pctMaxLife === undefined ? undefined : fx.pctMaxLife * pw','pctMaxLife: fx.pctMaxLife','proc-effects-scaling'],
  ['metadata-retained-incorrectly','runtime','healAllies: fx.healAllies ? { base:','healAllies: fx.healAllies ? { ...fx.healAllies, base:','proc-magnitude-metadata'],
  ['zero-cast-defaulted','runtime','fx.cast.mult ?? 1','fx.cast.mult || 1','proc-magnitude-metadata'],
  ['dead-resource-admitted','runtime','amount <= 0 || actor.dead','amount <= 0','proc-ward-resource'],
  ['ward-capped','runtime','const gained = amount * ports.rate(actor);','const gained = Math.min(100, amount * ports.rate(actor));','proc-ward-resource'],
  ['stale-pool-before-rate','runtime','const gained = amount * ports.rate(actor);\n    actor.ward += gained;','const before = actor.ward;\n    const gained = amount * ports.rate(actor);\n    actor.ward = before + gained;','proc-ward-resource'],
  ['growth-not-observed','runtime','return actor.ward > before;','return amount > 0;','ward-host'],
  ['snapshot-before-life','runtime','const amount = (fx.flat ?? 0) + (fx.pctMaxLife ?? 0) * ports.maximumLife(actor);\n    const before = actor.ward;','const before = actor.ward;\n    const amount = (fx.flat ?? 0) + (fx.pctMaxLife ?? 0) * ports.maximumLife(actor);','ward-host'],
  ['native-gain-bypassed','binding','gain:(actor:Actor,amount:number)=>actor.gainWard(amount),','gain:(actor:Actor,amount:number)=>{actor.ward+=amount;return amount;},','proc-effects-edges'],
  ['native-rate-bypassed','binding',"rate:(actor:Actor)=>actor.sheet.get('wardGain'),",'rate:(_actor:Actor)=>1,','proc-ward-resource'],
  ['native-life-bypassed','binding','maximumLife:(actor:Actor)=>actor.maxLife(),','maximumLife:(_actor:Actor)=>0,','ward-host'],
  ['cue-unconditional','world','if (engineApplyWardEffect(caster, fx, wardEffectPorts))','if ((engineApplyWardEffect(caster, fx, wardEffectPorts), true))','ward-host'],
  ['cue-omitted','world',"if (engineApplyWardEffect(caster, fx, wardEffectPorts)) noteProcCue(caster, procCue, 'gain', proc.id);",'engineApplyWardEffect(caster, fx, wardEffectPorts);','ward-host'],
  ['rider-tail-bypassed','world','this.fireProcRiders(proc, caster, inst, target, depth);','void depth;','ward-host'],
]){
  const file=targets[target],source=fs.readFileSync(file,'utf8');assert.equal(source.split(before).length,2,'Fault anchor changed or ambiguous: '+name);
  const row=fixtures.find(r=>r.name===fixture),helper=row?helpers.get(row.helper):host.runtime,destination=path.join(output,'fault-'+name+'.json');let detected=false;
  try{
    fs.writeFileSync(file,source.replace(before,after));
    try{run('fault-'+name,args(helper,destination));}catch(error){const log=fs.readFileSync(path.join(output,'fault-'+name+'.txt'),'utf8');assert(/AssertionError/.test(log)&&!/SyntaxError|ERR_MODULE_NOT_FOUND/.test(log),'Fault failed for unrelated reason: '+name);detected=true;}
    if(!detected)detected=!fs.readFileSync(destination).equals(row?expected.get(fixture):fs.readFileSync(path.join(output,'original-host.json')));assert(detected,'Installed effect fault escaped: '+name);
  }finally{fs.writeFileSync(file,source);unchanged();}
  faults.push({name,detected});console.log('Rejected installed effect fault: '+name);
}
assert.equal(results.reduce((sum,row)=>sum+row.courses,0),1096);
writeJSON(path.join(artifacts,'game-proc-effects-verification.json'),{output,game,tooling:location.tooling,packageIntegrity:location.integrity,typesPassed:true,originalHostTypesPassed:true,originalCoursesCompared:1096,additionalNativeHookAndCueCases:7,hostProbeSha256:sha256(hostSource),hostProbeByteEqual:true,results,installedFaults:faults,allInstalledFilesRestored:true,originalUnchanged:true});
