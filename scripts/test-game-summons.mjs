import {renderSummonBirth} from '../adapters/hollow-wake/integrate-summon-birth.mjs';
import {verifySummonAdapterGuards} from './test-summon-adapter.mjs';
import {renderAuraTick} from '../adapters/hollow-wake/integrate-aura-ticking.mjs';
import {renderAuraActivation} from '../adapters/hollow-wake/integrate-aura-activation.mjs';
import {renderAuraLedgerWorld,renderAuraLedgerActor} from '../adapters/hollow-wake/integrate-aura-ledgers.mjs';
import {renderAuraRetirement} from '../adapters/hollow-wake/integrate-aura-retirement.mjs';
import {renderCompanionRecovery} from '../adapters/hollow-wake/integrate-companion-recovery.mjs';
import {renderBodyLevels} from '../adapters/hollow-wake/integrate-body-levels.mjs';
import {companionBondsBindings} from '../adapters/hollow-wake/integrate-companion-bonds.mjs';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {gzipSync,gunzipSync} from 'node:zlib';import ts from 'typescript';import {build} from 'esbuild';
import {root,sha256,verifyReference} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';
assert.equal(process.argv.length,2);fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const owned=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(owned,'summons-game-owned-')),consumer=path.join(work,'consumer');
const read=file=>fs.readFileSync(path.join(root,file)),inputs=['scripts/test-game-summons.mjs','scripts/test-summon-adapter.mjs','scripts/prepare-game-adapter.mjs','package.json','package-lock.json',...["summon-birth","summon-offspring","aura-ticking","aura-activation","aura-ledgers","aura-retirement","companion-recovery","body-levels","companion-bonds","companion-bond-rules","minion-inheritance","attribute-bequests"].map(n=>'src/'+n+'.ts')];
const report={passed:false,sources:Object.fromEntries(inputs.map(file=>[file,sha256(read(file))])),courses:[],faults:[]},logs={};
const track=file=>{const bytes=read(file);report.sources[file]=sha256(bytes);return bytes;};
const run=(label,args,cwd=consumer)=>{const child=spawnSync(process.execPath,args,{cwd,windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_COMPILE_CACHE:path.join(work,'compile-cache'),NPM_CONFIG_CACHE:path.join(work,'npm-cache')}});logs[label]=(child.stdout??'')+'\n'+(child.stderr??'');assert(!child.error&&!child.signal,label+': '+child.error);return child;};
const success=(label,args,cwd)=>assert.equal(run(label,args,cwd).status,0,logs[label]);
const ref=path.join(root,'.reference'),lock=JSON.parse(track('baseline/source-lock.json'));
try{
 fs.mkdirSync(consumer);fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
 success('pack',[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work],root);const archive=path.join(work,JSON.parse(logs.pack)[0].filename);report.archiveSha256=sha256(fs.readFileSync(archive));
 success('install',[npmCli(),'install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund']);verifyReference(ref,lock);
 for(const file of ['adapters/hollow-wake/integrate-summon-birth.mjs','adapters/hollow-wake/install-character-sources.mjs',...['aura-ticking','aura-activation','aura-ledgers','aura-retirement','companion-recovery','body-levels','companion-bonds'].map(n=>'adapters/hollow-wake/integrate-'+n+'.mjs'),...['companionBonds','companionSpec','minionInheritance','bequests'].map(n=>'adapters/hollow-wake/'+n+'.ts')])track(file);
 const installed=path.join(consumer,'node_modules/@hollow-wake/engine'),installedPkg=JSON.parse(fs.readFileSync(path.join(installed,'package.json'))),worldFile=path.join(ref,'src/engine/world.ts'),originalWorld=fs.readFileSync(worldFile,'utf8');
 const guards=verifySummonAdapterGuards(originalWorld,work);assert.equal(guards.guards,62);report.adapterGuards=guards.guards;
 let rendered=originalWorld;for(const render of [renderBodyLevels,renderCompanionRecovery,renderAuraRetirement,renderAuraLedgerWorld,renderAuraActivation,renderAuraTick,renderSummonBirth])rendered=render(rendered,originalWorld);
 const actorFile=path.join(ref,'src/engine/actor.ts'),originalActor=fs.readFileSync(actorFile,'utf8'),renderedActor=renderAuraLedgerActor(originalActor,originalActor);
 const overlay=new Map([[worldFile,rendered],[actorFile,renderedActor],...[...companionBondsBindings()].map(([file,binding])=>[path.join(ref,file),binding])]),courses=new Map();
 for(const name of ["aura-ticking","aura-ticking-contact","aura-ticking-order","aura-activation","body-levels","companion-recovery","companion-continuation","aura-retirement","aura-ledgers","retirement-contact","summon-birth-admission","summon-birth-contact","summon-offspring","summon-birth-order","summon-birth-forms","summon-birth-boundary","summon-nested"]){
  const manifest=JSON.parse(track('baseline/'+name+'/acceptance.json')),source=track(manifest.source).toString(),packed=track('baseline/'+name+'/observations.json.gz'),expected=gunzipSync(packed);
  assert.equal(sha256(source),manifest.sourceSha256);assert.equal(manifest.sourceLockSha256,report.sources['baseline/source-lock.json']);assert.equal(sha256(packed),manifest.gzipSha256);assert.equal(sha256(expected),manifest.sha256);
  courses.set(name,{source,expected,observations:manifest.observations,virtual:path.join(ref,'balance/hwe-'+name+'.ts')});
 }
 const known=JSON.parse(gunzipSync(track('baseline/companion-continuation/original.logs.json.gz')))['original-1'];
 courses.set('private-companion',{source:track('test/companion-continuation-game.ts').toString(),expectedLogs:'Companion private game continuation: 4 courses, 15 stages passed\n\n'+known.stderr,privateCourses:4,privateStages:15,virtual:path.join(ref,'balance/hwe-private-summon.ts')});
 const simConfig=ts.getParsedCommandLineOfConfigFile(path.join(ref,'tsconfig.sim.json'),{}, {...ts.sys,onUnRecoverableConfigFileDiagnostic:d=>{throw Error(ts.flattenDiagnosticMessageText(d.messageText,'\n'));}});assert(simConfig);
 const paths=Object.fromEntries(Object.entries(installedPkg.exports).filter(([,e])=>e.types).map(([key,e])=>['@hollow-wake/engine'+(key==='.'?'':key.slice(1)),[path.join(installed,e.types)]])),typed=new Map([...overlay,...[...courses.values()].map(c=>[c.virtual,c.source])]);
 const options={...simConfig.options,baseUrl:root,paths,typeRoots:[path.join(ref,'node_modules/@types')]},typeHost=ts.createCompilerHost(options),readFile=typeHost.readFile.bind(typeHost),existsFile=typeHost.fileExists.bind(typeHost);
 typeHost.readFile=p=>typed.get(path.resolve(p))??readFile(p);typeHost.fileExists=p=>typed.has(path.resolve(p))||existsFile(p);
 const issues=ts.getPreEmitDiagnostics(ts.createProgram([...new Set([...simConfig.fileNames,...typed.keys()])],options,typeHost));assert.equal(issues.length,0,ts.formatDiagnostics(issues,{getCurrentDirectory:()=>ref,getCanonicalFileName:p=>p,getNewLine:()=>'\n'}));report.types=true;
 const modules=['summon-birth','summon-offspring','aura-ticking','aura-activation','aura-ledgers','aura-retirement','companion-recovery','body-levels','companion-bonds','companion-bond-rules','minion-inheritance','attribute-bequests'];
 report.installedModuleHashes=Object.fromEntries(modules.map(name=>[name,sha256(fs.readFileSync(path.join(installed,'dist/'+name+'.js')))]));
 async function replay(name,label,fault){
  const course=courses.get(name),entry=path.join(work,label+'.cjs'),output=path.join(work,label+'.json');
  const bundled=await build({stdin:{contents:course.source,loader:'ts',resolveDir:path.join(ref,'balance')},bundle:true,platform:'node',format:'cjs',logLevel:'silent',metafile:true,outfile:entry,plugins:[{name:'installed-summon-game',setup(b){
   b.onResolve({filter:/^@hollow-wake\/engine(?:\/|$)/},args=>{const key='.'+args.path.slice('@hollow-wake/engine'.length),entry=installedPkg.exports[key]?.import;assert(entry);return{path:path.join(installed,entry)};});
   b.onLoad({filter:/\.(ts|js)$/},args=>{const file=path.resolve(args.path);let contents=overlay.get(file);if(fault&&file===(fault.file==='world.ts'?worldFile:path.join(installed,'dist',fault.file))){contents??=fs.readFileSync(file,'utf8');assert.equal(contents.split(fault.from).length,2,label+' selector');contents=contents.replace(fault.from,fault.to);}if(contents!==undefined)return{contents,loader:file.endsWith('.ts')?'ts':'js'};});
  }}]});
  const loaded=new Set(Object.keys(bundled.metafile.inputs).map(p=>path.resolve(p)));for(const name of modules)assert(loaded.has(path.join(installed,'dist/'+name+'.js')),'Replay bypassed installed '+name);
  const child=run(label,[entry,output],ref),matched=child.status===0&&(course.expected?fs.readFileSync(output).equals(course.expected):logs[label]===course.expectedLogs);
  if(fault){assert(!matched,'Fault escaped '+label);if(child.status!==0){assert.equal(child.status,1);assert.match(logs[label],/ERR_ASSERTION/);}report.faults.push({name:label,course:name,detected:true,logSha256:sha256(logs[label])});}
  else assert(matched,label+': '+logs[label].slice(-6000));
 }
 report.courses=[];
 for(const[name,c]of courses){for(let i=1;i<=2;i++)await replay(name,name+'-'+i);report.courses.push({name,observations:c.observations,privateCourses:c.privateCourses,privateStages:c.privateStages,freshProcesses:2});}
 for(const[name,course,file,from,to]of [
  ['birth-binding-skipped','summon-nested','world.ts','return this.engineSummonBirth.spawn(caster,inst,overrides);','return null;'],
  ['offspring-binding-skipped','summon-nested','world.ts','this.engineSummonOffspring.spawn(parent,act);','void parent;'],
  ['child-flag-lost','summon-nested','summon-birth.js','minion.summonOffspring = !!overrides?.offspring;','minion.summonOffspring = false;'],
  ['child-cap-lost','summon-nested','summon-birth.js','.length >= overrides.offspring.maxActive','.length > overrides.offspring.maxActive'],
  ['child-contract-retained','summon-nested','summon-offspring.js','persistent: undefined,','persistent: delivery.persistent,'],
  ['child-shell-retained','summon-nested','summon-offspring.js','shell: undefined','shell: delivery.shell'],
  ['explicit-override-kind-lost','summon-birth-boundary','summon-birth.js',"if (!d || (requested != null && d.type !== 'summon'))",'if (!d)'],
  ['tick-binding-skipped','aura-ticking','world.ts','this.engineAuraTick.update(dt);','void dt;'],
  ['activation-binding-skipped','aura-activation','world.ts','this.engineAuraActivation.activate(caster,inst,d,aoeScale);','void caster;'],
  ['inheritance-binding-skipped','summon-birth-contact','world.ts','inheritStats:(a,owner,i)=>this.bakeMinionOwnerStats(a,owner,i)','inheritStats:(_a,_owner,_i)=>{}'],
 ])await replay(course,name,{file,from,to});
 await replay('summon-nested','restored-nested');await replay('summon-birth-boundary','restored-boundary');report.restored=true;
 report.observations=report.courses.reduce((sum,c)=>sum+(c.observations??0),0);assert.equal(report.observations,345);report.loadedInstalledModules=modules;report.passed=true;

}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 try{verifyReference(ref,lock);report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(read(file))===hash);report.passed=report.passed&&report.inputsUnchanged;}catch(error){report.passed=false;report.failure=String(error);process.exitCode=1;}
 finally{assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;const bytes=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(bytes);fs.writeFileSync(path.join(owned,'summons-game.logs.json.gz'),bytes);fs.writeFileSync(path.join(owned,'summons-game.json'),JSON.stringify(report,null,2)+'\n');}
}
assert(report.passed,report.failure??'Input changed');console.log({passed:true,observations:report.observations,courses:report.courses,faults:report.faults.length,guards:report.adapterGuards,types:report.types,cleaned:true});
