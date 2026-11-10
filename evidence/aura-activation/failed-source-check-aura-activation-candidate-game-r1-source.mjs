import {renderAuraActivation} from './aura-activation-adapter-prototype.mjs';
import {renderAuraLedgerWorld,renderAuraLedgerActor} from '../adapters/hollow-wake/integrate-aura-ledgers.mjs';
import {renderAuraRetirement} from '../adapters/hollow-wake/integrate-aura-retirement.mjs';
import {renderCompanionRecovery} from '../adapters/hollow-wake/integrate-companion-recovery.mjs';
import {renderBodyLevels} from '../adapters/hollow-wake/integrate-body-levels.mjs';
import {companionBondsBindings} from '../adapters/hollow-wake/integrate-companion-bonds.mjs';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {gzipSync,gunzipSync} from 'node:zlib';import ts from 'typescript';import {build} from 'esbuild';
import {root,sha256,verifyReference} from '../scripts/reference-utils.mjs';import {npmCli} from '../scripts/npm-cli.mjs';
const attempt=process.argv[2];assert(/^r\d+$/.test(attempt));const stem='aura-activation-candidate-game-'+attempt,owned=fs.realpathSync(path.join(root,'.artifacts'));assert(!fs.existsSync(path.join(owned,stem+'.json')));
const read=file=>fs.readFileSync(path.join(root,file)),inputs=['.artifacts/aura-activation-prototype.ts','.artifacts/aura-activation-contracts.mjs','.artifacts/aura-activation-consumer.ts','.artifacts/qualify-aura-activation-prototype.mjs','.artifacts/aura-activation-docs.txt','.artifacts/check-aura-activation-candidate-game.mjs','package.json','package-lock.json','tsconfig.json'];
const work=fs.mkdtempSync(path.join(owned,'aura-activation-candidate-game-owned-')),seed=path.join(work,'seed'),consumer=path.join(work,'consumer');fs.mkdirSync(seed);fs.mkdirSync(consumer);
const report={passed:false,candidateOnly:true,promoted:false,courses:[],sources:Object.fromEntries(inputs.map(file=>[file,sha256(read(file))])),faults:[]},logs={};
const run=(label,args,cwd=consumer)=>{const c=spawnSync(process.execPath,args,{cwd,windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_PATH:'',NODE_COMPILE_CACHE:path.join(work,'compile-cache'),NPM_CONFIG_CACHE:path.join(work,'npm-cache')}});logs[label]=(c.stdout??'')+'\n'+(c.stderr??'');assert(!c.error&&!c.signal,label+': '+c.error);return c;};
const success=(label,args,cwd)=>assert.equal(run(label,args,cwd).status,0,logs[label]);
try{
 // Assemble a future-entry candidate entirely inside owned scratch space. The
 // verified checkout and its dist outputs remain unchanged throughout.
 success('pack-base',[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work],root);
 const base=path.join(work,JSON.parse(logs['pack-base'])[0].filename);report.baseArchiveSha256=sha256(fs.readFileSync(base));
 fs.writeFileSync(path.join(seed,'package.json'),JSON.stringify({private:true,type:'module'}));success('install-base',[npmCli(),'install',base,'--offline','--ignore-scripts','--no-audit','--no-fund'],seed);
 const packageRoot=path.join(seed,'node_modules/@hollow-wake/engine'),virtual=path.join(root,'src/aura-activation.ts'),runtime=read('.artifacts/aura-activation-prototype.ts').toString();
 const config=ts.getParsedCommandLineOfConfigFile(path.join(root,'tsconfig.json'),{}, {...ts.sys,onUnRecoverableConfigFileDiagnostic:d=>{throw Error(ts.flattenDiagnosticMessageText(d.messageText,'\n'));}});assert(config);
 const host=ts.createCompilerHost(config.options),originalRead=host.readFile.bind(host),exists=host.fileExists.bind(host),emitted=new Map();host.readFile=file=>path.resolve(file)===virtual?runtime:originalRead(file);host.fileExists=file=>path.resolve(file)===virtual||exists(file);host.writeFile=(file,contents)=>emitted.set(path.basename(file),contents);
 const program=ts.createProgram([virtual],config.options,host),diagnostics=ts.getPreEmitDiagnostics(program);assert.equal(diagnostics.length,0,ts.formatDiagnostics(diagnostics,{getCurrentDirectory:()=>root,getCanonicalFileName:p=>p,getNewLine:()=>'\n'}));assert(!program.emit().emitSkipped);report.compiled=true;
 for(const name of ['aura-activation.js','aura-activation.d.ts','aura-activation.js.map']){assert(emitted.has(name));fs.writeFileSync(path.join(packageRoot,'dist',name),emitted.get(name),{flag:'wx'});}
 const manifestFile=path.join(packageRoot,'package.json'),pkg=JSON.parse(fs.readFileSync(manifestFile));assert(!pkg.exports['./auras/activation']);pkg.exports['./auras/activation']={types:'./dist/aura-activation.d.ts',import:'./dist/aura-activation.js'};fs.writeFileSync(manifestFile,JSON.stringify(pkg,null,2)+'\n');fs.writeFileSync(path.join(packageRoot,'docs/aura-activation.md'),read('.artifacts/aura-activation-docs.txt'),{flag:'wx'});
 const archiveDir=path.join(work,'candidate');fs.mkdirSync(archiveDir);success('pack-candidate',[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',archiveDir],packageRoot);const archive=path.join(archiveDir,JSON.parse(logs['pack-candidate'])[0].filename);report.candidateArchiveSha256=sha256(fs.readFileSync(archive));
 fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));success('install-candidate',[npmCli(),'install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund']);
 const packageProof=JSON.parse(read('.artifacts/aura-activation-candidate-package-r1.json'));assert(packageProof.passed&&packageProof.candidateOnly&&packageProof.cleaned&&packageProof.inputsUnchanged);assert.equal(report.candidateArchiveSha256,packageProof.candidateArchiveSha256);assert.equal(report.baseArchiveSha256,packageProof.baseArchiveSha256);
 const track=file=>{const data=read(file);report.sources[file]=sha256(data);return data;};
 const ref=path.join(root,'.reference'),lock=JSON.parse(track('baseline/source-lock.json'));verifyReference(ref,lock);
 for(const file of ['.artifacts/aura-activation-adapter-prototype.mjs','adapters/hollow-wake/integrate-aura-ledgers.mjs','adapters/hollow-wake/integrate-aura-retirement.mjs','adapters/hollow-wake/integrate-companion-recovery.mjs','adapters/hollow-wake/integrate-body-levels.mjs','adapters/hollow-wake/integrate-companion-bonds.mjs','adapters/hollow-wake/install-character-sources.mjs',...['companionBonds','companionSpec','minionInheritance','bequests'].map(n=>'adapters/hollow-wake/'+n+'.ts')])track(file);
 for(const file of ['aura-activation','aura-ledgers','aura-retirement','companion-recovery','body-levels','companion-bonds','companion-bond-rules','minion-inheritance','attribute-bequests'])track('src/'+file+'.ts');
 const installed=path.join(consumer,'node_modules/@hollow-wake/engine'),installedPkg=JSON.parse(fs.readFileSync(path.join(installed,'package.json'))),worldFile=path.join(ref,'src/engine/world.ts'),originalWorld=fs.readFileSync(worldFile,'utf8'),rendered=renderAuraActivation(renderAuraLedgerWorld(renderAuraRetirement(renderCompanionRecovery(renderBodyLevels(originalWorld,originalWorld),originalWorld),originalWorld),originalWorld),originalWorld).replaceAll('@hollow-wake/aura-activation-prototype','@hollow-wake/engine/auras/activation');
 const actorFile=path.join(ref,'src/engine/actor.ts'),originalActor=fs.readFileSync(actorFile,'utf8'),renderedActor=renderAuraLedgerActor(originalActor,originalActor);
 const overlay=new Map([[worldFile,rendered],[actorFile,renderedActor],...[...companionBondsBindings()].map(([file,binding])=>[path.join(ref,file),binding])]),courses=new Map();
 for(const name of ['body-levels','companion-recovery','companion-continuation','aura-retirement','aura-ledgers','retirement-contact']){
  const manifest=JSON.parse(track('baseline/'+name+'/acceptance.json')),source=track(manifest.source).toString(),packed=track('baseline/'+name+'/observations.json.gz'),expected=gunzipSync(packed);
  assert.equal(sha256(source),manifest.sourceSha256);assert.equal(manifest.sourceLockSha256,report.sources['baseline/source-lock.json']);assert.equal(sha256(packed),manifest.gzipSha256);assert.equal(sha256(expected),manifest.sha256);courses.set(name,{source,expected,observations:manifest.observations,virtual:path.join(ref,'balance/hwe-'+name+'.ts')});
 }
 for(const[name,stem,sourceFile]of [['aura-activation','aura-activation-original-r2','.artifacts/export-aura-activation.ts']]){
  const accepted=JSON.parse(track('.artifacts/'+stem+'.json')),source=track(sourceFile).toString(),packed=track('.artifacts/'+stem+'.observations.json.gz'),expected=gunzipSync(packed);
  assert(accepted.passed&&accepted.originalOnly&&accepted.cleaned&&accepted.inputsUnchanged&&accepted.restored);assert.equal(sha256(expected),accepted.sha256);assert.equal(sha256(packed),accepted.gzipSha256);assert.equal(sha256(source),accepted.sourceSha256);assert.equal(accepted.sourceLockSha256,report.sources['baseline/source-lock.json']);
  courses.set(name,{source,expected,observations:accepted.observations,virtual:path.join(ref,'balance/hwe-'+name+'.ts')});
 }
 const known=JSON.parse(gunzipSync(track('baseline/companion-continuation/original.logs.json.gz')))['original-1'];
 courses.set('private-companion',{source:track('test/companion-continuation-game.ts').toString(),expectedLogs:'Companion private game continuation: 4 courses, 15 stages passed\n\n'+known.stderr,privateCourses:4,privateStages:15,virtual:path.join(ref,'balance/hwe-private-recovery.ts')});
 const simConfig=ts.getParsedCommandLineOfConfigFile(path.join(ref,'tsconfig.sim.json'),{}, {...ts.sys,onUnRecoverableConfigFileDiagnostic:d=>{throw Error(ts.flattenDiagnosticMessageText(d.messageText,'\n'));}});assert(simConfig);
 const paths=Object.fromEntries(Object.entries(installedPkg.exports).filter(([,e])=>e.types).map(([key,e])=>['@hollow-wake/engine'+(key==='.'?'':key.slice(1)),[path.join(installed,e.types)]])),typed=new Map([...overlay,...[...courses.values()].map(c=>[c.virtual,c.source])]),options={...simConfig.options,baseUrl:root,paths,typeRoots:[path.join(ref,'node_modules/@types')]},typeHost=ts.createCompilerHost(options),readFile=typeHost.readFile.bind(typeHost),existsFile=typeHost.fileExists.bind(typeHost);
 typeHost.readFile=p=>typed.get(path.resolve(p))??readFile(p);typeHost.fileExists=p=>typed.has(path.resolve(p))||existsFile(p);const issues=ts.getPreEmitDiagnostics(ts.createProgram([...new Set([...simConfig.fileNames,...typed.keys()])],options,typeHost));assert.equal(issues.length,0,ts.formatDiagnostics(issues,{getCurrentDirectory:()=>ref,getCanonicalFileName:p=>p,getNewLine:()=>'\n'}));report.types=true;
 async function replay(name,label,fault){
  const course=courses.get(name),entry=path.join(work,label+'.cjs'),output=path.join(work,label+'.json');
  const bundled=await build({stdin:{contents:course.source,loader:'ts',resolveDir:path.join(ref,'balance')},bundle:true,platform:'node',format:'cjs',logLevel:'silent',metafile:true,outfile:entry,plugins:[{name:'installed-activation-candidate',setup(b){
   b.onResolve({filter:/^@hollow-wake\/engine(?:\/|$)/},args=>{const key='.'+args.path.slice('@hollow-wake/engine'.length),entry=installedPkg.exports[key]?.import;assert(entry);return{path:path.join(installed,entry)};});
   b.onLoad({filter:/\.(ts|js)$/},args=>{const file=path.resolve(args.path);let contents=overlay.get(file);if(fault&&file===(fault.file==='world.ts'?worldFile:fault.file==='actor.ts'?actorFile:path.join(installed,'dist',fault.file))){contents??=fs.readFileSync(file,'utf8');assert.equal(contents.split(fault.from).length,2,label+' selector');contents=contents.replace(fault.from,fault.to);}if(contents!==undefined)return{contents,loader:file.endsWith('.ts')?'ts':'js'};});
  }}]});
  const loaded=new Set(Object.keys(bundled.metafile.inputs).map(p=>path.resolve(p)));for(const file of ['aura-ledgers','aura-retirement','companion-recovery','body-levels','companion-bonds','companion-bond-rules','minion-inheritance','attribute-bequests'])assert(loaded.has(path.join(installed,'dist/'+file+'.js')),'Replay bypassed installed '+file);
  const c=run(label,[entry,output],ref),matched=c.status===0&&(course.expected?fs.readFileSync(output).equals(course.expected):logs[label]===course.expectedLogs);
  if(fault){assert(!matched,'Fault escaped '+label);if(c.status!==0){assert.equal(c.status,1);assert.match(logs[label],/ERR_ASSERTION/);}report.faults.push({name:label,detected:true,logSha256:sha256(logs[label])});}else assert(matched,label+': '+logs[label].slice(-6000));
 }
 for(const[name,c]of courses){for(let i=1;i<=2;i++)await replay(name,name+'-'+i);report.courses.push({name,observations:c.observations,privateCourses:c.privateCourses,privateStages:c.privateStages,freshProcesses:2});}
 for(const[name,course,file,from,to]of [
  [
    "activation-binding-skipped",
    "aura-activation",
    "world.ts",
    "this.engineAuraActivation.activate(caster,inst,d,aoeScale);",
    "void caster;"
  ],
  [
    "retirement-binding-skipped",
    "aura-activation",
    "world.ts",
    "this.engineAuraRetirement.retire(bearer,skillId,quietTreeRelease);",
    "void bearer;"
  ],
  [
    "evicted-ledger-settlement-lost",
    "aura-activation",
    "aura-ledgers.js",
    "actor.life -= due;",
    "void actor.life;"
  ],
  [
    "reservation-not-recorded",
    "aura-activation",
    "aura-activation.js",
    "actor.reservedMana += reserved;",
    "void actor.reservedMana;"
  ],
  [
    "pulse-start-changed",
    "aura-activation",
    "aura-activation.js",
    "pulseTimer: 0",
    "pulseTimer: 1"
  ],
  [
    "zero-native-duration-lost",
    "aura-activation",
    "aura-activation.js",
    "(delivery.duration ?? 5)",
    "(delivery.duration || 5)"
  ],
  [
    "shell-strength-lost",
    "aura-activation",
    "aura-activation.js",
    "max = s.max * strength",
    "max = s.max"
  ],
  [
    "activation-time-stale",
    "aura-activation",
    "aura-activation.js",
    "since: this.p.time()",
    "since: 0"
  ]
])await replay(course,'fault-'+name,{file,from,to});
 for(const name of courses.keys())await replay(name,'restored-'+name);report.restored=true;verifyReference(ref,lock);report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(read(file))===hash);report.passed=report.passed&&report.inputsUnchanged;
 assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;const data=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(data);fs.writeFileSync(path.join(owned,stem+'.logs.json.gz'),data,{flag:'wx'});fs.writeFileSync(path.join(owned,stem+'.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
}
assert(report.passed,report.failure??'Inputs changed');
console.log({passed:report.passed,candidateOnly:true,compiled:report.compiled,types:report.types,courses:report.courses,faults:report.faults.length,restored:report.restored,cleaned:true,failure:report.failure});
