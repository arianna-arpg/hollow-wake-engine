import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {gzipSync,gunzipSync} from 'node:zlib';import {build} from 'esbuild';
import {root,sha256,materialize,verifyReference} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';
import {integratePassiveGrants,renderPassiveGrants} from '../adapters/hollow-wake/integrate-passive-grants.mjs';
import {integrateEquipmentSkills} from '../adapters/hollow-wake/integrate-equipment-skills.mjs';
import {integrateBuildContributions,renderBuildContributions} from '../adapters/hollow-wake/integrate-build-contributions.mjs';
const catalogue=process.argv.includes('--catalogue');assert(process.argv.length===(catalogue?3:2));
const owned=path.join(root,'.artifacts');fs.mkdirSync(owned,{recursive:true});
const work=fs.mkdtempSync(path.join(owned,'build-contributions-package-owned-')),consumer=path.join(work,'consumer');fs.mkdirSync(consumer);
const logs={},report={passed:false,contracts:10,faults:[],game:{courses:[],faults:[]},sources:{}};
const inputs=['src/build-contributions.ts','src/passive-grants.ts','src/equipment-skills.ts','test/build-contributions.test.mjs','test/build-contributions-game.ts',
 'scripts/test-build-contributions-package.mjs','adapters/hollow-wake/integrate-build-contributions.mjs',
 'adapters/hollow-wake/integrate-equipment-skills.mjs','adapters/hollow-wake/integrate-passive-grants.mjs','adapters/hollow-wake/passiveGrantAdapter.ts',
 'reference/export-build-contributions.ts','baseline/build-contributions/acceptance.json','baseline/source-lock.json','package.json','package-lock.json'];
for(const file of inputs)report.sources[file]=sha256(fs.readFileSync(path.join(root,file)));
const run=(label,args,cwd=consumer,timeout=240000)=>{
 const child=spawnSync(process.execPath,args,{cwd,encoding:'utf8',windowsHide:true,timeout,maxBuffer:8*1024*1024,
  env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_PATH:''}});
 logs[label]=(child.stdout??'')+'\n'+(child.stderr??'');assert(!child.error&&!child.signal,label+': '+child.error);return child;
};
const success=(label,args,cwd,timeout)=>{const child=run(label,args,cwd,timeout);assert.equal(child.status,0,logs[label].slice(-7000));return child;};
const contracts=(label,file='contracts.test.mjs')=>{success(label,['--test',file]);assert(new RegExp('(?:#|ℹ) pass '+report.contracts+'\\b').test(logs[label]));};
try{
 success('pack',[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work,'--cache',path.join(work,'npm-cache')],root);
 const archive=path.join(work,JSON.parse(logs.pack)[0].filename);report.archiveSha256=sha256(fs.readFileSync(archive));
 fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
 success('install',[npmCli(),'install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(work,'npm-cache')]);
 const entries={'build-contributions':'character/build-contributions','passive-grants':'passives/grants','container-policy':'inventory/containers'};
 let test=fs.readFileSync(path.join(root,'test/build-contributions.test.mjs'),'utf8');
 for(const[file,entry]of Object.entries(entries))test=test.replaceAll("'../dist/"+file+".js'","'@hollow-wake/engine/"+entry+"'");
 fs.writeFileSync(path.join(consumer,'contracts.test.mjs'),test);contracts('installed');
 fs.writeFileSync(path.join(consumer,'browser.mjs'),Object.values(entries).map(entry=>"export * from '@hollow-wake/engine/"+entry+"';").join('\n'));
 const bundle=await build({entryPoints:[path.join(consumer,'browser.mjs')],bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,metafile:true,write:false});
 assert(Object.values(bundle.metafile.outputs).every(row=>!row.imports.length));report.browserBytes=bundle.outputFiles[0].contents.length;assert(report.browserBytes<40*1024);
 fs.writeFileSync(path.join(consumer,'browser-built.mjs'),bundle.outputFiles[0].contents);
 for(const entry of Object.values(entries))test=test.replaceAll("'@hollow-wake/engine/"+entry+"'","'./browser-built.mjs'");
 fs.writeFileSync(path.join(consumer,'browser-contracts.mjs'),test);
 fs.writeFileSync(path.join(consumer,'hostile.test.mjs'),"Math.random=()=>{throw Error('ambient RNG')};globalThis.fetch=()=>{throw Error('network')};for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw Error(key)}});await import('./browser-contracts.mjs');");contracts('browser','hostile.test.mjs');
 fs.writeFileSync(path.join(consumer,'types.ts'),"import {BuildContributions,type BuildContributionInput,type BuildContributionPorts,type BuildContributionSink} from '@hollow-wake/engine/character/build-contributions';import type {Modifier} from '@hollow-wake/engine';type I={uid:number};type D={id:string;active:boolean};declare const ports:BuildContributionPorts<I,Modifier,D>;declare const input:BuildContributionInput<I>;declare const sink:BuildContributionSink;const result=new BuildContributions(ports).rebuild(input,sink);const hosts:Map<I,Modifier[]>=result.containerPieceMods;void hosts;");
 success('types',[path.join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','types.ts']);report.types=true;
 const installed=path.join(consumer,'node_modules/@hollow-wake/engine'),module=path.join(installed,'dist/build-contributions.js'),original=fs.readFileSync(module,'utf8');
 report.moduleBytes=Buffer.byteLength(original);assert(report.moduleBytes<6*1024);
 const faults=[
  ['skip-class',"sink.sheet.setSource('class', input.classDef.innate ?? []);",''],
  ['lose-conduits','sink.conduits(conduits.length ? conduits : undefined);','sink.conduits(undefined);'],
  ['ignore-enable','!(input.relicEnabled ?? true)','false'],
  ['ignore-suppression','|| sink.relicEffectsSuppressed','|| false'],
  ['include-misfits','held.filter(item => !misfit.has(item))','held'],
  ['lose-neighbourhood','amps.get(item) ?? 1','1'],
  ['zero-means-one','amps.get(item) ?? 1','amps.get(item) || 1'],
  ['lose-host-identity','containerPieceMods.set(item, mods);','containerPieceMods.set({...item}, mods);'],
  ['stale-gear',"sink.sheet.removeSource('gear:' + slot.id);",'void slot;'],
  ['reverse-order','for (const slot of r.equipSlots())','for (const slot of [...r.equipSlots()].reverse())'],
 ];
 for(const[name,needle,replacement]of faults){
  assert(original.includes(needle),name+' target changed');fs.writeFileSync(module,original.replaceAll(needle,replacement));
  try{const child=run('fault-'+name,['--test','contracts.test.mjs']);assert.equal(child.status,1,name+' escaped');assert(logs['fault-'+name].includes('ERR_ASSERTION'),name+' did not reach an assertion');report.faults.push({name,detected:true,logSha256:sha256(logs['fault-'+name])});}
  finally{fs.writeFileSync(module,original);}
 }
 contracts('restored');report.restored=true;
 const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),game=path.join(work,'game');verifyReference(path.join(root,'.reference'),lock);materialize(undefined,lock,game);verifyReference(game,lock);
 const deps=fs.realpathSync(path.join(root,'.reference/node_modules')),modules=path.join(game,'node_modules');fs.mkdirSync(modules);
 for(const row of fs.readdirSync(deps,{withFileTypes:true}))if(row.name!=='.bin'&&row.name!=='@hollow-wake'&&(row.isDirectory()||row.isSymbolicLink()))fs.symlinkSync(path.join(deps,row.name),path.join(modules,row.name),process.platform==='win32'?'junction':'dir');
 fs.mkdirSync(path.join(modules,'@hollow-wake'));fs.symlinkSync(installed,path.join(modules,'@hollow-wake/engine'),process.platform==='win32'?'junction':'dir');
 const world=fs.readFileSync(path.join(game,'src/engine/world.ts'),'utf8'),editor=fs.readFileSync(path.join(game,'src/dev/passiveEditor.ts'),'utf8');
 const passive=renderPassiveGrants(world,editor,world,editor).world;
 assert.throws(()=>renderBuildContributions(passive.replace('amps.get(seated) ?? 1','amps.get(seated) ?? 2'),world,editor),/Unreviewed build contribution phase/);
 assert.throws(()=>renderBuildContributions(world,world,editor),/Expected reviewed passive integration/);
 const rendered=renderBuildContributions(passive,world,editor);assert.throws(()=>renderBuildContributions(rendered,world,editor),/already present/);report.adapterGuards=3;
 integratePassiveGrants(game);integrateEquipmentSkills(game,true,{passiveGrafts:'compiled'});integrateBuildContributions(game);
 const courseFiles=new Map();
 for(const name of ['build-contributions','equipment-live',...(catalogue?['equipment-catalogue']:[])]){
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'baseline',name,'acceptance.json'))),source=fs.readFileSync(path.join(root,manifest.source));
  assert.equal(sha256(source),manifest.sourceSha256);report.sources[manifest.source]=manifest.sourceSha256;
  const probe=path.join(game,'balance','hwe-'+name+'.ts');
  if(name!=='equipment-catalogue'){
   const text=source.toString();assert.equal(text.split('makeSimWorld}').length,2);
   const instrumented="import {observeBuildContributions,buildChecks} from './hwe-build-observer';\n"+
    text.replace('makeSimWorld}','makeSimWorld as originalMakeSimWorld}')+
    "\nfunction makeSimWorld(...args:Parameters<typeof originalMakeSimWorld>){const world=originalMakeSimWorld(...args);observeBuildContributions(world);return world;}\nwriteFileSync(process.argv[3],JSON.stringify(buildChecks),{flag:'wx'});\n";
   fs.writeFileSync(probe,instrumented);
  }
  courseFiles.set(name,{manifest,probe});
 }
 fs.copyFileSync(path.join(root,'test/build-contributions-game.ts'),path.join(game,'balance/hwe-build-observer.ts'));
 success('game-types',[path.join(deps,'typescript/bin/tsc'),'--noEmit','-p','tsconfig.sim.json'],game);
 // The immutable older catalogue observer deliberately calls private World
 // methods. Typecheck the installed game and new observers before adding it;
 // execute its exact accepted bytes through the original transpilation path.
 if(catalogue){const row=courseFiles.get('equipment-catalogue');fs.copyFileSync(path.join(root,row.manifest.source),row.probe);}
 const course=(name,label=name)=>{
  const {manifest,probe}=courseFiles.get(name),output=path.join(work,label+'.json');
  const checks=path.join(work,label+'-checks.json');
  success(label,['--import','tsx',probe,output,...name==='equipment-catalogue'?[]:[checks]],game,name==='equipment-catalogue'?1800000:240000);
  if(name!=='equipment-catalogue'){
   const counts=JSON.parse(fs.readFileSync(checks));assert.equal(counts.prepared,name==='build-contributions'?91:36);
   assert.equal(counts.prepared,counts.unchanged);assert.equal(counts.prepared,counts.matched);
   if(label===name)(report.game.privateBuilds??={})[name]=counts;
  }
  return {manifest,actual:fs.readFileSync(output)};
 };
 for(const name of courseFiles.keys()){
  const {manifest,actual}=course(name);assert.equal(sha256(actual),manifest.sha256,'Frozen original course changed: '+name);
  report.game.courses.push({name,cases:manifest.cases,sha256:manifest.sha256});
 }
 for(const name of ['skip-class','include-misfits','lose-neighbourhood']){
  const [,needle,replacement]=faults.find(row=>row[0]===name);fs.writeFileSync(module,original.replaceAll(needle,replacement));
  try{const {manifest,actual}=course('build-contributions','game-fault-'+name);assert.notEqual(sha256(actual),manifest.sha256,name+' bypassed installed game');report.game.faults.push({name,detected:true});}
  finally{fs.writeFileSync(module,original);}
 }
 const restored=course('build-contributions','game-restored');assert.equal(sha256(restored.actual),restored.manifest.sha256);report.game.restored=true;
 report.passed=true;
}catch(error){report.failure=String(error);throw error;}
finally{
 try{report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(fs.readFileSync(path.join(root,file)))===hash);const bytes=gzipSync(JSON.stringify(logs),{level:9});fs.writeFileSync(path.join(owned,'build-contributions-package'+(catalogue?'-catalogue':'')+'.logs.json.gz'),bytes);report.logsSha256=sha256(bytes);}
 finally{assert.equal(path.dirname(fs.realpathSync(work)),fs.realpathSync(owned));fs.rmSync(work,{recursive:true});report.cleaned=true;report.passed=report.passed&&report.inputsUnchanged;fs.writeFileSync(path.join(owned,'build-contributions-package'+(catalogue?'-catalogue':'')+'.json'),JSON.stringify(report,null,2)+'\n');}
}
assert(report.passed);console.log({passed:true,contracts:report.contracts,faults:report.faults.length,game:report.game,browserBytes:report.browserBytes,cleaned:report.cleaned});
