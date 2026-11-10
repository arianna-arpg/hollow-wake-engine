import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {gzipSync,gunzipSync} from 'node:zlib';import ts from 'typescript';import {build} from 'esbuild';
import {root,sha256,verifyReference} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';
import {integrateCompanionRecovery,renderCompanionRecovery} from '../adapters/hollow-wake/integrate-companion-recovery.mjs';
import {renderBodyLevels} from '../adapters/hollow-wake/integrate-body-levels.mjs';
import {companionBondsBindings} from '../adapters/hollow-wake/integrate-companion-bonds.mjs';
assert.equal(process.argv.length,2);
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const owned=fs.realpathSync(path.join(root,'.artifacts')),ref=path.join(root,'.reference'),read=file=>fs.readFileSync(file,'utf8'),logs={},report={passed:false,sources:{},courses:[],faults:[],adapterGuards:0};
function tracked(file){const bytes=fs.readFileSync(path.join(root,file));report.sources[file]=sha256(bytes);return bytes;}
const lock=JSON.parse(tracked('baseline/source-lock.json'));
for(const file of ['src/body-levels.ts','adapters/hollow-wake/integrate-body-levels.mjs','src/companion-recovery.ts','src/companion-bonds.ts','src/companion-bond-rules.ts','src/minion-inheritance.ts','src/attribute-bequests.ts','adapters/hollow-wake/integrate-companion-recovery.mjs','adapters/hollow-wake/integrate-companion-bonds.mjs','adapters/hollow-wake/install-character-sources.mjs','scripts/prepare-game-adapter.mjs','scripts/test-game-companion-recovery.mjs','package.json','package-lock.json',...['companionBonds','companionSpec','minionInheritance','bequests'].map(n=>'adapters/hollow-wake/'+n+'.ts')])tracked(file);
const work=fs.mkdtempSync(path.join(owned,'companion-recovery-game-owned-')),consumer=path.join(work,'consumer');fs.mkdirSync(consumer);
const run=(label,args,cwd=consumer)=>{const c=spawnSync(process.execPath,args,{cwd,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:4*1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_PATH:'',NODE_COMPILE_CACHE:path.join(work,'compile-cache')}});logs[label]={stdout:c.stdout??'',stderr:c.stderr??''};assert(!c.error&&!c.signal,label+': '+c.error);return c;};
const success=(label,args,cwd)=>{const c=run(label,args,cwd);assert.equal(c.status,0,JSON.stringify(logs[label]));return c;};
try{
 verifyReference(ref,lock);success('pack',[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work,'--cache',path.join(work,'npm-cache')],root);
 const archive=path.join(work,JSON.parse(logs.pack.stdout)[0].filename);report.archiveSha256=sha256(fs.readFileSync(archive));fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));success('install',[npmCli(),'install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(work,'npm-cache')]);
 const installed=path.join(consumer,'node_modules/@hollow-wake/engine'),pkg=JSON.parse(read(path.join(installed,'package.json'))),file='src/engine/world.ts',original=read(path.join(ref,file)),rendered=renderCompanionRecovery(original,original);
 assert(rendered.includes('this.engineCompanionRecovery.revive(a,frac)')&&rendered.includes('this.engineCompanionRecovery.recover(a)'));report.adapterGuards++;
 assert(!rendered.includes('companionRecoverySeconds'));report.adapterGuards++;
 const extra='\nexport const unrelatedHostExtension=17;\n';assert(renderCompanionRecovery(original+extra,original).endsWith(extra));report.adapterGuards++;
 assert.equal(renderCompanionRecovery(original.replaceAll('\n','\r\n'),original),rendered.replaceAll('\n','\r\n'));report.adapterGuards++;
 for(const order of [0,1]){const combined=order?renderCompanionRecovery(renderBodyLevels(original,original),original):renderBodyLevels(rendered,original);assert(combined.includes('engineBodyLevels.relevel(a,level)'));assert(combined.includes('this.engineCompanionRecovery.recover(a)'));report.adapterGuards++;}
 for(const[name,source]of [
  ['duplicate installation',rendered],['binding collision',original+'\nconst engineCompanionRecovery=0;'],['import collision',original+'\nconst EngineCompanionRecovery=0;'],
  ['changed revive',original.replace('a.life = Math.max(1, a.maxLife() * frac);','a.life = a.maxLife();')],
  ['changed recovery',original.replace('a.endStatus(cfg.status);','void cfg.status;')],
  ['missing method',original.replace('recoverCompanion(a: Actor): void','removedRecovery(a: Actor): void')],
  ['missing helper import',original.replace('companionBondOf, companionRecoverySeconds, COMPANION_CFG','companionBondOf, COMPANION_CFG')],
  ['aliased helper import',original.replace('companionBondOf, companionRecoverySeconds, COMPANION_CFG','companionBondOf, companionRecoverySeconds as renamed, COMPANION_CFG')],
  ['duplicate World',original+'\nclass World {}'],
 ]){assert.notEqual(source,original,name+' selector');assert.throws(()=>renderCompanionRecovery(source,original));report.adapterGuards++;}
 const fixture=path.join(work,'fixture'),worldFile=path.join(fixture,file);fs.mkdirSync(path.dirname(worldFile),{recursive:true});fs.writeFileSync(worldFile,original);integrateCompanionRecovery(fixture,false);assert.equal(read(worldFile),original);report.adapterGuards++;
 const unreviewed=original.replace('a.endStatus(cfg.status);','void cfg.status;');fs.writeFileSync(worldFile,unreviewed);assert.throws(()=>integrateCompanionRecovery(fixture));assert.equal(read(worldFile),unreviewed);report.adapterGuards++;
 fs.writeFileSync(worldFile,original);integrateCompanionRecovery(fixture);assert.equal(read(worldFile),rendered);assert.throws(()=>integrateCompanionRecovery(fixture));report.adapterGuards++;
 const overlay=new Map([[path.join(ref,file),renderBodyLevels(rendered,original)],...[...companionBondsBindings()].map(([file,binding])=>[path.join(ref,file),binding])]),courses=new Map();
 for(const name of ['companion-recovery','body-levels','companion-continuation']){
  const manifest=JSON.parse(tracked('baseline/'+name+'/acceptance.json')),source=tracked(manifest.source).toString(),packed=tracked('baseline/'+name+'/observations.json.gz'),expected=gunzipSync(packed);
  assert.equal(sha256(source),manifest.sourceSha256);assert.equal(manifest.sourceLockSha256,report.sources['baseline/source-lock.json']);assert.equal(sha256(packed),manifest.gzipSha256);assert.equal(sha256(expected),manifest.sha256);courses.set(name,{source,expected,manifest,virtual:path.join(ref,'balance/hwe-'+name+'.ts')});
 }
 const known=JSON.parse(gunzipSync(tracked('baseline/companion-continuation/original.logs.json.gz')))['original-1'];
 courses.set('private-companion',{source:tracked('test/companion-continuation-game.ts').toString(),expectedLogs:{stdout:'Companion private game continuation: 4 courses, 15 stages passed\n',stderr:known.stderr},manifest:{courses:4,stages:15},virtual:path.join(ref,'balance/hwe-body-private.ts'),installedOnly:true});
 const config=ts.getParsedCommandLineOfConfigFile(path.join(ref,'tsconfig.sim.json'),{}, {...ts.sys,onUnRecoverableConfigFileDiagnostic:d=>{throw Error(ts.flattenDiagnosticMessageText(d.messageText,'\n'));}});assert(config);
 const paths=Object.fromEntries(Object.entries(pkg.exports).filter(([,e])=>e.types).map(([key,e])=>['@hollow-wake/engine'+(key==='.'?'':key.slice(1)),[path.join(installed,e.types)]])),typed=new Map([...overlay,...[...courses.values()].map(c=>[c.virtual,c.source])]),options={...config.options,baseUrl:root,paths,typeRoots:[path.join(ref,'node_modules/@types')]},host=ts.createCompilerHost(options),readFile=host.readFile.bind(host),exists=host.fileExists.bind(host);
 host.readFile=p=>typed.get(path.resolve(p))??readFile(p);host.fileExists=p=>typed.has(path.resolve(p))||exists(p);const diagnostics=ts.getPreEmitDiagnostics(ts.createProgram([...new Set([...config.fileNames,...typed.keys()])],options,host));assert.equal(diagnostics.length,0,ts.formatDiagnostics(diagnostics,{getCurrentDirectory:()=>ref,getCanonicalFileName:p=>p,getNewLine:()=>'\n'}));report.types=true;
 async function replay(name,label,originalOnly=false,fault){
  const course=courses.get(name),entry=path.join(work,label+'.cjs'),output=path.join(work,label+'.json');
  const bundled=await build({stdin:{contents:course.source,loader:'ts',resolveDir:path.join(ref,'balance')},bundle:true,platform:'node',format:'cjs',logLevel:'silent',metafile:true,outfile:entry,plugins:originalOnly?[]:[{name:'installed-companion-recovery',setup(b){
   b.onResolve({filter:/^@hollow-wake\/engine(?:\/|$)/},args=>{const key='.'+args.path.slice('@hollow-wake/engine'.length),entry=pkg.exports[key]?.import;assert(entry);return{path:path.join(installed,entry)};});
   b.onLoad({filter:/\.ts$/},args=>{let contents=overlay.get(path.resolve(args.path));if(contents===undefined)return;if(fault?.file==='world.ts'&&path.basename(args.path)==='world.ts'){assert.equal(contents.split(fault.from).length,2);contents=contents.replace(fault.from,fault.to);}return{contents,loader:'ts'};});
   if(fault?.file==='companion-recovery.js')b.onLoad({filter:/[\\/]dist[\\/]companion-recovery\.js$/},args=>{const source=read(args.path);assert.equal(source.split(fault.from).length,2);return{contents:source.replace(fault.from,fault.to),loader:'js'};});
  }}]});
  if(!originalOnly){const inputs=new Set(Object.keys(bundled.metafile.inputs).map(p=>path.resolve(p)));for(const name of ['companion-recovery','body-levels','companion-bonds','companion-bond-rules','minion-inheritance','attribute-bequests'])assert(inputs.has(path.join(installed,'dist/'+name+'.js')),'Replay bypassed installed '+name);}
  const c=run(label,[entry,output],ref),matched=c.status===0&&(course.expected?fs.readFileSync(output).equals(course.expected):JSON.stringify(logs[label])===JSON.stringify(course.expectedLogs));
  if(fault){assert(!matched,'Fault escaped '+label);if(c.status!==0){assert.equal(c.status,1);assert.match(JSON.stringify(logs[label]),/ERR_ASSERTION/);}report.faults.push({name:label,detected:true,logSha256:sha256(JSON.stringify(logs[label]))});}else assert(matched,label+': '+JSON.stringify(logs[label]).slice(-6000));
 }
 for(const[name,c]of courses){if(!c.installedOnly)await replay(name,'original-'+name,true);await replay(name,'installed-'+name);report.courses.push({name,observations:c.manifest.observations,privateCourses:c.manifest.courses,privateStages:c.manifest.stages,modes:c.installedOnly?['installed']:['original','installed']});}
 for(const[name,file,from,to]of [
  ['pending-expiry-survives','companion-recovery.js','a.expiredStatuses = a.expiredStatuses.filter(s => this.p.status(s.id)?.beneficial);','void a.expiredStatuses;'],
  ['downed-body-evades-budget','companion-recovery.js','b.companion && !b.dead && !b.companionDormant','b.companion && !b.dead && !b.downed && !b.companionDormant'],
  ['retained-long-shelter','companion-recovery.js','this.p.endStatus(a, cfg.status);','void cfg.status;'],
  ['refilled-life','companion-recovery.js','this.p.maxLife(a) * fraction','this.p.maxLife(a)'],
  ['obsolete-revival-clock','companion-recovery.js','a.companionReviveRemaining = undefined;','void a.companionReviveRemaining;'],
  ['no-cleanse','companion-recovery.js','this.p.cleanse(a);','void a;'],
  ['no-revival-cue','companion-recovery.js','this.p.revivalCue(a);','void a;'],
  ['ownerless-revival-refused','companion-recovery.js','!a.companion || a.dead || !a.downed || a.companionDormant','!a.companion || a.dead || !a.downed || a.companionDormant || !a.owner'],
  ['missing-recovery-binding','world.ts','this.engineCompanionRecovery.recover(a);','void a;'],
  ['missing-revival-binding','world.ts','this.engineCompanionRecovery.revive(a,frac);','void a;'],
 ])await replay('companion-recovery','fault-'+name,false,{file,from,to});
 await replay('private-companion','fault-private-cleanse',false,{file:'companion-recovery.js',from:'this.p.cleanse(a);',to:'void a;'});
 for(const name of courses.keys())await replay(name,'restored-'+name);
 report.restored=true;report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 try{verifyReference(ref,lock);report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(fs.readFileSync(path.join(root,file)))===hash);report.passed=report.passed&&report.inputsUnchanged;}catch(error){report.passed=false;report.failure=String(error);process.exitCode=1;}
 finally{assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;const bytes=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(bytes);fs.writeFileSync(path.join(owned,'companion-recovery-game.logs.json.gz'),bytes);fs.writeFileSync(path.join(owned,'companion-recovery-game.json'),JSON.stringify(report,null,2)+'\n');}
}
assert(report.passed,report.failure);console.log({passed:true,types:report.types,courses:report.courses,faults:report.faults.length,guards:report.adapterGuards,cleaned:report.cleaned});
