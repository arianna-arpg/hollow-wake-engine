import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {gzipSync,gunzipSync} from 'node:zlib';
import ts from 'typescript';import {build} from 'esbuild';
import {root,sha256,verifyReference} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';
import {renderCompanionGrants} from '../adapters/hollow-wake/integrate-companion-grants.mjs';
import {renderPassiveGrants} from '../adapters/hollow-wake/integrate-passive-grants.mjs';
import {renderEquipmentSkills} from '../adapters/hollow-wake/integrate-equipment-skills.mjs';
import {renderBuildContributions} from '../adapters/hollow-wake/integrate-build-contributions.mjs';
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const owned=fs.realpathSync(path.join(root,'.artifacts')),ref=path.join(root,'.reference'),read=p=>fs.readFileSync(p,'utf8');
const work=fs.mkdtempSync(path.join(owned,'build-context-game-owned-')),consumer=path.join(work,'consumer');fs.mkdirSync(consumer);
const lock=JSON.parse(read(path.join(root,'baseline/source-lock.json'))),capture=JSON.parse(read(path.join(root,'baseline/build-context/acceptance.json')));
const report={passed:false,scope:'ordinary-private-build-context/v1',sources:{},replays:[],faults:[]},logs={};
for(const file of ['src/stats.ts','src/passive-grants.ts','src/build-contributions.ts','src/equipment-skills.ts','src/companion-grants.ts',
 'adapters/hollow-wake/integrate-companion-grants.mjs','adapters/hollow-wake/integrate-passive-grants.mjs','adapters/hollow-wake/passiveGrantAdapter.ts',
 'adapters/hollow-wake/integrate-equipment-skills.mjs','adapters/hollow-wake/integrate-build-contributions.mjs','baseline/source-lock.json','package.json','package-lock.json',
 'test/build-context-game.ts','scripts/test-build-context-game.mjs','reference/export-build-context.ts','baseline/build-context/acceptance.json','baseline/build-context/observations.json.gz'])report.sources[file]=sha256(fs.readFileSync(path.join(root,file)));
const run=(label,args,cwd=consumer)=>{const r=spawnSync(process.execPath,args,{cwd,encoding:'utf8',windowsHide:true,timeout:240000,maxBuffer:6*1024*1024,
 env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_PATH:'',NODE_COMPILE_CACHE:path.join(work,'compile-cache')}});
 logs[label]=(r.stdout??'')+'\n'+(r.stderr??'');assert(!r.error&&!r.signal,label+': '+r.error);return r;};
try{
 verifyReference(ref,lock);assert.equal(capture.freshProcesses,2);assert.equal(capture.observations,14);assert.equal(capture.sourceLockSha256,report.sources['baseline/source-lock.json']);
 const source=read(path.join(root,capture.source)),expected=gunzipSync(fs.readFileSync(path.join(root,'baseline/build-context/observations.json.gz')));
 assert.equal(sha256(source),capture.sourceSha256);assert.equal(sha256(expected),capture.sha256);
 assert.equal(sha256(fs.readFileSync(path.join(root,'baseline/build-context/observations.json.gz'))),capture.gzipSha256);
 assert.equal(run('pack',[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work,'--cache',path.join(work,'npm-cache')],root).status,0,logs.pack);
 const archive=path.join(work,JSON.parse(logs.pack)[0].filename);report.archiveSha256=sha256(fs.readFileSync(archive));
 fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
 assert.equal(run('install',[npmCli(),'install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(work,'npm-cache')]).status,0,logs.install);
 const installed=path.join(consumer,'node_modules/@hollow-wake/engine'),pkg=JSON.parse(read(path.join(installed,'package.json')));
 const worldFile=path.join(ref,'src/engine/world.ts'),editorFile=path.join(ref,'src/dev/passiveEditor.ts'),companionFile=path.join(ref,'src/engine/companionGrants.ts');
 const world=read(worldFile),editor=read(editorFile),companion=read(companionFile),passive=renderPassiveGrants(world,editor,world,editor);
 const composed=renderBuildContributions(renderEquipmentSkills(passive.world,world,{passiveGrafts:'compiled'}),world,editor);
 const overlay=new Map([[worldFile,composed],[editorFile,passive.editor],[companionFile,renderCompanionGrants(companion,companion)],
 [path.join(ref,'src/engine/passiveGrantAdapter.ts'),read(path.join(root,'adapters/hollow-wake/passiveGrantAdapter.ts'))]]);
 const helper=path.join(ref,'balance/hwe-private-build.ts'),helperSource=read(path.join(root,'test/build-context-game.ts'));
 assert.equal(source.split('w.walk=null;').length,2,'Unreviewed original observer injection');
 const instrument=source=>"import {observePrivateBuilds,privateBuildChecks} from './hwe-private-build';\n"+source.replace('w.walk=null;','observePrivateBuilds(w);w.walk=null;')+"\nwriteFileSync(process.argv[3],JSON.stringify(privateBuildChecks));\n";
 overlay.set(helper,helperSource);
 const virtual=path.join(ref,'balance/hwe-build-context.ts'),typesOverlay=new Map([...overlay,[virtual,instrument(source)]]);
 const config=ts.getParsedCommandLineOfConfigFile(path.join(ref,'tsconfig.sim.json'),{}, {...ts.sys,onUnRecoverableConfigFileDiagnostic:d=>{throw Error(ts.flattenDiagnosticMessageText(d.messageText,'\n'));}});assert(config);
 const paths=Object.fromEntries(Object.entries(pkg.exports).filter(([,entry])=>entry.types).map(([key,entry])=>['@hollow-wake/engine'+(key==='.'?'':key.slice(1)),[path.join(installed,entry.types)]]));
 const options={...config.options,baseUrl:root,paths,typeRoots:[path.join(ref,'node_modules/@types')]},host=ts.createCompilerHost(options),readFile=host.readFile.bind(host),exists=host.fileExists.bind(host);
 host.readFile=p=>typesOverlay.get(path.resolve(p))??readFile(p);host.fileExists=p=>typesOverlay.has(path.resolve(p))||exists(p);
 const program=ts.createProgram([...config.fileNames,...typesOverlay.keys()],options,host),diagnostics=ts.getPreEmitDiagnostics(program);
 assert.equal(diagnostics.length,0,ts.formatDiagnostics(diagnostics,{getCurrentDirectory:()=>ref,getCanonicalFileName:p=>p,getNewLine:()=>'\n'}));report.types=true;
 async function replay(label,{original=false,fault}={}){
  const entry=path.join(work,label+'.cjs'),output=path.join(work,label+'.json');
  const result=await build({stdin:{contents:original?source:instrument(source),loader:'ts',resolveDir:path.join(ref,'balance')},bundle:true,platform:'node',format:'cjs',logLevel:'silent',metafile:true,outfile:entry,
   plugins:[{name:'installed-context-replay',setup(b){
    b.onResolve({filter:/^@hollow-wake\/engine(?:\/|$)/},args=>{const key='.'+args.path.slice('@hollow-wake/engine'.length),target=pkg.exports[key]?.import;assert(target,args.path);return{path:path.join(installed,target)};});
    b.onResolve({filter:/hwe-private-build$/},()=>({path:helper}));
    b.onResolve({filter:/passiveGrantAdapter$/},()=>({path:path.join(ref,'src/engine/passiveGrantAdapter.ts')}));
    b.onLoad({filter:/\.ts$/},args=>{if(original)return;let contents=overlay.get(path.resolve(args.path));if(contents===undefined)return;
     if(fault==='refill-current-resources'&&args.path===worldFile){const from='p.life = Math.min(p.life, p.maxLife());';assert.equal(contents.split(from).length,2);contents=contents.replace(from,'p.life = p.maxLife();');}
     return{contents,loader:'ts',resolveDir:path.dirname(args.path)};
    });
    if(fault==='cold-restore-warm-grant')b.onLoad({filter:/[\\/]dist[\\/]equipment-skills\.js$/},args=>{let contents=read(args.path);const from='let inst = previousGrant?.grantedHostUid === host?.uid ? previousGrant : undefined;';assert.equal(contents.split(from).length,2);return{contents:contents.replace(from,'let inst = undefined;'),loader:'js'};});
    if(fault?.startsWith('stat-fork-'))b.onLoad({filter:/[\\/]dist[\\/]stats\.js$/},args=>{
     const selectors={bases:'fork.baseOverrides = new Map(this.baseOverrides);',conditions:'fork.conditions = new Set(this.conditions);',gauges:'fork.gauges = new Map(this.gauges);'};
     const from=selectors[fault.slice('stat-fork-'.length)],contents=read(args.path);assert(from);assert.equal(contents.split(from).length,2);
     return{contents:contents.replace(from,''),loader:'js'};
    });
   }}]});
  const inputs=Object.keys(result.metafile.inputs).map(p=>path.resolve(p));if(!original)for(const module of ['companion-grants','equipment-skills','build-contributions','passive-grants','stats'])assert(inputs.includes(path.join(installed,'dist',module+'.js')),'Bypassed '+module);
  const checks=path.join(work,label+'-checks.json'),child=run(label,[entry,output,checks],ref);
  if(fault){
   if(child.status===0)assert(!fs.readFileSync(output).equals(expected),'Fault escaped: '+fault);
   else{assert.equal(child.status,1);assert.match(logs[label],/ERR_ASSERTION/);}
   report.faults.push({name:fault,detected:true,logSha256:sha256(logs[label])});
  }else{assert.equal(child.status,0,logs[label]);assert(fs.readFileSync(output).equals(expected),label+' changed original observation');const privateChecks=original?undefined:JSON.parse(read(checks));if(privateChecks){assert.equal(privateChecks.prepared,11);assert.equal(privateChecks.unchanged,privateChecks.prepared);assert.equal(privateChecks.equipmentMatched,privateChecks.prepared);assert.equal(privateChecks.completed,privateChecks.prepared);}report.replays.push({label,sha256:sha256(fs.readFileSync(output)),privateChecks});}
 }
 await replay('original-control',{original:true});await replay('installed-composed');
 await replay('fault-cold-restore',{fault:'cold-restore-warm-grant'});await replay('fault-resource-refill',{fault:'refill-current-resources'});
 for(const kind of ['bases','conditions','gauges'])await replay('fault-stat-fork-'+kind,{fault:'stat-fork-'+kind});
 await replay('restored-composed');report.restored=true;report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 try{verifyReference(ref,lock);report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(fs.readFileSync(path.join(root,file)))===hash);report.passed=report.passed&&report.inputsUnchanged;
  const logsBytes=gzipSync(JSON.stringify(logs),{level:9});fs.writeFileSync(path.join(owned,'build-context-game.logs.json.gz'),logsBytes);report.logsSha256=sha256(logsBytes);
 }catch(error){report.passed=false;report.failure=String(error);process.exitCode=1;}
 finally{assert.equal(path.dirname(fs.realpathSync(work)),owned);fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;fs.writeFileSync(path.join(owned,'build-context-game.json'),JSON.stringify(report,null,2)+'\n');}
}
console.log({passed:report.passed,types:report.types,replays:report.replays.length,faults:report.faults.length,cleaned:report.cleaned,failure:report.failure});
