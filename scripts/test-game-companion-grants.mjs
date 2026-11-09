import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {gzipSync,gunzipSync} from 'node:zlib';
import ts from 'typescript';import {build} from 'esbuild';import {root,sha256,verifyReference} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';
import {integrateCompanionGrants,renderCompanionGrants} from '../adapters/hollow-wake/integrate-companion-grants.mjs';
import {renderPassiveGrants} from '../adapters/hollow-wake/integrate-passive-grants.mjs';import {renderEquipmentSkills} from '../adapters/hollow-wake/integrate-equipment-skills.mjs';import {renderBuildContributions} from '../adapters/hollow-wake/integrate-build-contributions.mjs';
const owned=path.join(root,'.artifacts');fs.mkdirSync(owned,{recursive:true});
const work=fs.mkdtempSync(path.join(owned,'companion-grants-game-owned-')),consumer=path.join(work,'consumer');fs.mkdirSync(consumer);
const ref=path.join(root,'.reference'),moduleFile='src/engine/companionGrants.ts',spec='@hollow-wake/engine/companions/grants';
const read=file=>fs.readFileSync(file,'utf8'),lock=JSON.parse(read(path.join(root,'baseline/source-lock.json')));
const logs={},report={passed:false,sources:{},courses:[],faults:[]};
for(const file of ['src/companion-grants.ts','adapters/hollow-wake/integrate-companion-grants.mjs','scripts/test-game-companion-grants.mjs','scripts/prepare-game-adapter.mjs','adapters/hollow-wake/integrate-passive-grants.mjs','adapters/hollow-wake/passiveGrantAdapter.ts','adapters/hollow-wake/integrate-equipment-skills.mjs','adapters/hollow-wake/integrate-build-contributions.mjs','baseline/source-lock.json','package.json','package-lock.json'])report.sources[file]=sha256(fs.readFileSync(path.join(root,file)));
const run=(label,args,cwd=consumer)=>{const child=spawnSync(process.execPath,args,{cwd,encoding:'utf8',windowsHide:true,timeout:240000,maxBuffer:8*1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_PATH:'',NODE_COMPILE_CACHE:path.join(work,'compile-cache')}});logs[label]=(child.stdout??'')+'\n'+(child.stderr??'');assert(!child.error&&!child.signal,label+': '+child.error);return child;};
const success=(label,args,cwd)=>{const child=run(label,args,cwd);assert.equal(child.status,0,logs[label].slice(-7000));return child;};
try{
 verifyReference(ref,lock);
 success('pack',[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work,'--cache',path.join(work,'npm-cache')],root);
 const archive=path.join(work,JSON.parse(logs.pack)[0].filename);report.archiveSha256=sha256(fs.readFileSync(archive));
 fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
 success('install',[npmCli(),'install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(work,'npm-cache')]);
 const installed=path.join(consumer,'node_modules/@hollow-wake/engine'),pkg=JSON.parse(read(path.join(installed,'package.json')));
 const original=read(path.join(ref,moduleFile)),fixture=path.join(work,'fixture'),fixtureFile=path.join(fixture,moduleFile);fs.mkdirSync(path.dirname(fixtureFile),{recursive:true});fs.writeFileSync(fixtureFile,original);
 integrateCompanionGrants(fixture,false);assert.equal(read(fixtureFile),original);integrateCompanionGrants(fixture);const generated=read(fixtureFile);
 assert.throws(()=>integrateCompanionGrants(fixture),/already installed/);
 report.adapterGuards=3;
 for(const nl of ['\n','\r\n']){
  const raw=original.replace(/\r?\n/g,nl),extra=nl+'// unrelated host extension'+nl;
  const rendered=renderCompanionGrants(raw+extra,raw);assert(rendered.includes(extra));assert.equal(rendered.includes('\r\n'),nl==='\r\n');
  assert.throws(()=>renderCompanionGrants(raw.replace('Math.floor','Math.ceil'),raw),/Unreviewed/);
  assert.throws(()=>renderCompanionGrants(raw.replace('manaCost','lifeCost'),raw),/Unreviewed/);report.adapterGuards+=4;
 }
 const originalWorld=read(path.join(ref,'src/engine/world.ts')),originalEditor=read(path.join(ref,'src/dev/passiveEditor.ts'));
 const passive=renderPassiveGrants(originalWorld,originalEditor,originalWorld,originalEditor);
 const composedWorld=renderBuildContributions(renderEquipmentSkills(passive.world,originalWorld,{passiveGrafts:'compiled'}),originalWorld,originalEditor);
 const baseOverlay=new Map([[path.join(ref,moduleFile),generated]]);
 const composedOverlay=new Map([...baseOverlay,[path.join(ref,'src/engine/world.ts'),composedWorld],[path.join(ref,'src/dev/passiveEditor.ts'),passive.editor],[path.join(ref,'src/engine/passiveGrantAdapter.ts'),read(path.join(root,'adapters/hollow-wake/passiveGrantAdapter.ts'))]]);
 const courses=new Map();
 for(const name of ['companion-grants','account-relic-build','build-contributions','equipment-live']){
  const base=path.join(root,'baseline',name),manifest=JSON.parse(read(path.join(base,'acceptance.json'))),source=read(path.join(root,manifest.source));
  assert.equal(sha256(source),manifest.sourceSha256);assert.equal(manifest.sourceLockSha256,report.sources['baseline/source-lock.json']);
  const packed=fs.readFileSync(path.join(base,'observations.json.gz')),expected=gunzipSync(packed);assert.equal(sha256(expected),manifest.sha256);assert.equal(sha256(packed),manifest.gzipSha256);
  report.sources[manifest.source]=manifest.sourceSha256;report.sources['baseline/'+name+'/acceptance.json']=sha256(fs.readFileSync(path.join(base,'acceptance.json')));report.sources['baseline/'+name+'/observations.json.gz']=manifest.gzipSha256;
  courses.set(name,{source,expected,manifest,virtual:path.join(ref,'balance/hwe-companions-'+name+'.ts')});
 }
 // Typecheck every original game/simulation input with in-memory replacements.
 // Neither the shared reference nor the user's game is modified or copied.
 const configFile=path.join(ref,'tsconfig.sim.json'),config=ts.getParsedCommandLineOfConfigFile(configFile,{}, {...ts.sys,onUnRecoverableConfigFileDiagnostic:d=>{throw Error(ts.flattenDiagnosticMessageText(d.messageText,'\n'));}});
 assert(config);const paths=Object.fromEntries(Object.entries(pkg.exports).filter(([,entry])=>entry.types).map(([key,entry])=>['@hollow-wake/engine'+(key==='.'?'':key.slice(1)),[path.join(installed,entry.types)]]));
 const overlay=new Map([...composedOverlay,...[...courses.values()].map(c=>[c.virtual,c.source])]);
 const options={...config.options,baseUrl:root,paths,typeRoots:[path.join(ref,'node_modules/@types')]};
 const host=ts.createCompilerHost(options),readFile=host.readFile.bind(host),exists=host.fileExists.bind(host);
 host.readFile=p=>overlay.get(path.resolve(p))??readFile(p);host.fileExists=p=>overlay.has(path.resolve(p))||exists(p);
 const program=ts.createProgram([...config.fileNames,...overlay.keys()],options,host),diagnostics=ts.getPreEmitDiagnostics(program);
 assert.equal(diagnostics.length,0,ts.formatDiagnostics(diagnostics,{getCurrentDirectory:()=>ref,getCanonicalFileName:p=>p,getNewLine:()=>'\n'}));report.types=true;
 const installedRuntime=path.join(installed,'dist/companion-grants.js'),runtimeSource=read(installedRuntime);
 async function replay(name,label,mode='composed',fault){
  const course=courses.get(name),output=path.join(work,label+'.json'),entry=path.join(work,label+'.cjs');
  const table=mode==='original'?new Map():mode==='companion'?baseOverlay:composedOverlay;
  const bundle=await build({stdin:{contents:course.source,loader:'ts',resolveDir:path.join(ref,'balance')},bundle:true,platform:'node',format:'cjs',logLevel:'silent',metafile:true,outfile:entry,plugins:[{name:'installed-companion-host',setup(b){
   b.onResolve({filter:/^@hollow-wake\/engine(?:\/|$)/},args=>{const key='.'+args.path.slice('@hollow-wake/engine'.length),entry=pkg.exports[key]?.import;assert(entry,'Unresolved installed SDK export: '+key);return{path:path.join(installed,entry)};});
   b.onResolve({filter:/passiveGrantAdapter$/},()=>({path:path.join(ref,'src/engine/passiveGrantAdapter.ts')}));
   b.onLoad({filter:/\.ts$/},args=>{let contents=table.get(path.resolve(args.path));if(contents===undefined)return;if(fault?.binding&&args.path===path.join(ref,moduleFile)){assert.equal(contents.split(fault.needle).length,2);contents=contents.replace(fault.needle,fault.replacement);}return{contents,loader:'ts',resolveDir:path.dirname(args.path)};});
   if(fault&&!fault.binding)b.onLoad({filter:/[\\/]dist[\\/]companion-grants\.js$/},args=>{assert.equal(args.path,installedRuntime);assert.equal(runtimeSource.split(fault.needle).length,2);return{contents:runtimeSource.replace(fault.needle,fault.replacement),loader:'js'};});
  }}]});
  const inputs=Object.keys(bundle.metafile.inputs).map(p=>path.resolve(p));
  if(mode!=='original')assert(inputs.includes(installedRuntime),'Replay bypassed installed companion code');
  if(mode==='composed')for(const file of ['equipment-skills','build-contributions','passive-grants'])assert(inputs.includes(path.join(installed,'dist',file+'.js')),'Replay bypassed '+file);
  const child=run(label,[entry,output],ref);
  if(fault){
   if(child.status===0)assert.notEqual(sha256(fs.readFileSync(output)),course.manifest.sha256,'Fault escaped original observation: '+label);
   else{assert.equal(child.status,1);assert(logs[label].includes('ERR_ASSERTION'),'Fault did not reach a behavior assertion');}
   report.faults.push({name:label,detected:true,logSha256:sha256(logs[label])});
  }else{assert.equal(child.status,0,logs[label]);assert(fs.readFileSync(output).equals(course.expected),label+' differs from pinned original');}
 }
 // The untouched original and installed binding must each reproduce the fixed
 // oracle; instrumentation is never used to manufacture accepted results.
 for(const name of courses.keys()){
  await replay(name,'original-'+name,'original');await replay(name,'installed-'+name,'companion');await replay(name,'composed-'+name);
  const m=courses.get(name).manifest;report.courses.push({name,cases:m.cases??m.courses,observations:m.observations,sha256:m.sha256,modes:['original','companion','composed']});
 }
 await replay('companion-grants','fault-scaled-death','composed',{needle:'d.persistent.respawnTime * p.respawnScale(owner, row.inst)',replacement:'d.persistent.respawnTime'});
 await replay('account-relic-build','fault-cold-refresh','composed',{needle:'let row = previous.get(def.id);',replacement:'let row = undefined;'});
 await replay('account-relic-build','fault-missing-provenance-binding','composed',{binding:true,needle:'runtime.derive(state,owner,defs,source,retire,refresh,relicSource);',replacement:'runtime.derive(state,owner,defs,source,retire,refresh,()=>undefined);'});
 await replay('companion-grants','restored-companion');await replay('account-relic-build','restored-account');report.restored=true;report.passed=true;
}catch(error){report.failure=String(error);throw error;}
finally{
 try{verifyReference(ref,lock);report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(fs.readFileSync(path.join(root,file)))===hash);const bytes=gzipSync(JSON.stringify(logs),{level:9});fs.writeFileSync(path.join(owned,'companion-grants-game.logs.json.gz'),bytes);report.logsSha256=sha256(bytes);}
 catch(error){report.passed=false;report.failure=String(error);throw error;}
 finally{assert.equal(path.dirname(fs.realpathSync(work)),fs.realpathSync(owned));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;report.passed=report.passed&&report.inputsUnchanged;fs.writeFileSync(path.join(owned,'companion-grants-game.json'),JSON.stringify(report,null,2)+'\n');}
}
assert(report.passed);console.log({passed:true,courses:report.courses,faults:report.faults.length,guards:report.adapterGuards,cleaned:report.cleaned});
