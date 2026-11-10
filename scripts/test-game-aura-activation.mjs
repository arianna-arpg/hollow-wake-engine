import {renderAuraActivation,integrateAuraActivation} from '../adapters/hollow-wake/integrate-aura-activation.mjs';
import {renderAuraLedgerWorld,renderAuraLedgerActor} from '../adapters/hollow-wake/integrate-aura-ledgers.mjs';
import {renderAuraRetirement} from '../adapters/hollow-wake/integrate-aura-retirement.mjs';
import {renderCompanionRecovery} from '../adapters/hollow-wake/integrate-companion-recovery.mjs';
import {renderBodyLevels} from '../adapters/hollow-wake/integrate-body-levels.mjs';
import {companionBondsBindings} from '../adapters/hollow-wake/integrate-companion-bonds.mjs';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {gzipSync,gunzipSync} from 'node:zlib';import ts from 'typescript';import {build} from 'esbuild';
import {root,sha256,verifyReference} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';
assert.equal(process.argv.length,2);
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const stem='aura-activation-game',owned=fs.realpathSync(path.join(root,'.artifacts'));
const read=file=>fs.readFileSync(path.join(root,file)),inputs=['src/aura-activation.ts','src/aura-ledgers.ts','src/aura-retirement.ts','src/companion-recovery.ts','src/body-levels.ts','src/companion-bonds.ts','src/companion-bond-rules.ts','src/minion-inheritance.ts','src/attribute-bequests.ts','scripts/test-game-aura-activation.mjs','scripts/prepare-game-adapter.mjs','package.json','package-lock.json'];
const work=fs.mkdtempSync(path.join(owned,'aura-activation-game-owned-')),consumer=path.join(work,'consumer');fs.mkdirSync(consumer);
const report={passed:false,courses:[],sources:Object.fromEntries(inputs.map(file=>[file,sha256(read(file))])),faults:[],adapterGuards:0},logs={};
const run=(label,args,cwd=consumer)=>{const c=spawnSync(process.execPath,args,{cwd,windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_PATH:'',NODE_COMPILE_CACHE:path.join(work,'compile-cache'),NPM_CONFIG_CACHE:path.join(work,'npm-cache')}});logs[label]=(c.stdout??'')+'\n'+(c.stderr??'');assert(!c.error&&!c.signal,label+': '+c.error);return c;};
const success=(label,args,cwd)=>assert.equal(run(label,args,cwd).status,0,logs[label]);
function verifyGuards(original){
const rendered=renderAuraActivation(original,original),guards=[];
assert(rendered.includes('this.engineAuraActivation.activate(caster,inst,d,aoeScale);'));guards.push('complete-command-delegation');
const method=(source,name)=>{const ast=ts.createSourceFile('world.ts',source,ts.ScriptTarget.Latest,true),world=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');assert(world);const methods=world.members.filter(n=>ts.isMethodDeclaration(n)&&n.name?.getText(ast)===name);assert.equal(methods.length,1);return methods[0].getText(ast);};
for(const name of ['deactivateAura','settleLedger','updateActorLedgers','guardBash','recoverCompanion','reviveCompanion','stampMonsterLevel','relevelActor']){assert.equal(method(rendered,name),method(original,name));guards.push('preserve-'+name);}
const extension='\nexport const unrelatedHostExtension=38;\n';assert(renderAuraActivation(original+extension,original).endsWith(extension));guards.push('preserve-extension');assert.equal(renderAuraActivation(original.replaceAll('\n','\r\n'),original),rendered.replaceAll('\n','\r\n'));guards.push('preserve-crlf');
for(const[label,render,marker]of [['body',renderBodyLevels,'engineBodyLevels.relevel('],['recovery',renderCompanionRecovery,'this.engineCompanionRecovery.revive('],['retirement',renderAuraRetirement,'this.engineAuraRetirement.retire('],['ledgers',renderAuraLedgerWorld,'this.engineAuraLedgers.update(']])for(const order of [0,1]){const combined=order?renderAuraActivation(render(original,original),original):render(rendered,original);assert(combined.includes('this.engineAuraActivation.activate(caster,inst,d,aoeScale);')&&combined.includes(marker));guards.push(label+'-composition-'+order);}
for(const[label,source]of [
 ['duplicate-installation',rendered],['binding-collision',original+'\nconst engineAuraActivation=0;'],['type-collision',original+'\nconst EngineAuraActivation=0;'],
 ['changed-method',original.replace('if (caster.activeAuras.has(inst.def.id)) return;','if (false) return;')],
 ['changed-signature',original.replace('d: AuraDelivery, aoeScale: number): void','d: AuraDelivery, aoeScale = 1): void')],
 ['missing-method',original.replace('private activateAura(caster: Actor,','private otherActivation(caster: Actor,')],['duplicate-world',original+'\nclass World {}'],
 ]){assert.notEqual(source,original,label);assert.throws(()=>renderAuraActivation(source,original));guards.push(label);}
assert.equal(guards.length,26);return guards.length;
}
try{
 success('pack',[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work],root);
 const archive=path.join(work,JSON.parse(logs.pack)[0].filename);report.archiveSha256=sha256(fs.readFileSync(archive));
 fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));success('install',[npmCli(),'install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund']);
 const track=file=>{const data=read(file);report.sources[file]=sha256(data);return data;};
 const ref=path.join(root,'.reference'),lock=JSON.parse(track('baseline/source-lock.json'));verifyReference(ref,lock);
 for(const file of ['adapters/hollow-wake/integrate-aura-activation.mjs','adapters/hollow-wake/integrate-aura-ledgers.mjs','adapters/hollow-wake/integrate-aura-retirement.mjs','adapters/hollow-wake/integrate-companion-recovery.mjs','adapters/hollow-wake/integrate-body-levels.mjs','adapters/hollow-wake/integrate-companion-bonds.mjs','adapters/hollow-wake/install-character-sources.mjs',...['companionBonds','companionSpec','minionInheritance','bequests'].map(n=>'adapters/hollow-wake/'+n+'.ts')])track(file);
 for(const file of ['aura-ledgers','aura-retirement','companion-recovery','body-levels','companion-bonds','companion-bond-rules','minion-inheritance','attribute-bequests'])track('src/'+file+'.ts');
 const installed=path.join(consumer,'node_modules/@hollow-wake/engine'),installedPkg=JSON.parse(fs.readFileSync(path.join(installed,'package.json'))),worldFile=path.join(ref,'src/engine/world.ts'),originalWorld=fs.readFileSync(worldFile,'utf8'),rendered=renderAuraActivation(renderAuraLedgerWorld(renderAuraRetirement(renderCompanionRecovery(renderBodyLevels(originalWorld,originalWorld),originalWorld),originalWorld),originalWorld),originalWorld);
 const actorFile=path.join(ref,'src/engine/actor.ts'),originalActor=fs.readFileSync(actorFile,'utf8'),renderedActor=renderAuraLedgerActor(originalActor,originalActor);
 report.adapterGuards=verifyGuards(originalWorld);
 const fixture=path.join(work,'fixture'),fixtureWorld=path.join(fixture,'src/engine/world.ts');fs.mkdirSync(path.dirname(fixtureWorld),{recursive:true});
 const unchangedFixture=expected=>{assert.equal(fs.readFileSync(fixtureWorld,'utf8'),expected);assert(!fs.existsSync(path.join(fixture,'.hollow-wake-character-install')));};
 fs.writeFileSync(fixtureWorld,originalWorld);integrateAuraActivation(fixture,false);unchangedFixture(originalWorld);report.adapterGuards++;
 const changedWorld=originalWorld.replace('if (caster.activeAuras.has(inst.def.id)) return;','if (false) return;');assert.notEqual(changedWorld,originalWorld);fs.writeFileSync(fixtureWorld,changedWorld);assert.throws(()=>integrateAuraActivation(fixture));unchangedFixture(changedWorld);report.adapterGuards++;
 fs.writeFileSync(fixtureWorld,originalWorld);integrateAuraActivation(fixture);const installedFixture=renderAuraActivation(originalWorld,originalWorld);unchangedFixture(installedFixture);report.adapterGuards++;
 assert.throws(()=>integrateAuraActivation(fixture));unchangedFixture(installedFixture);report.adapterGuards++;
 const overlay=new Map([[worldFile,rendered],[actorFile,renderedActor],...[...companionBondsBindings()].map(([file,binding])=>[path.join(ref,file),binding])]),courses=new Map();
 for(const name of ['body-levels','companion-recovery','companion-continuation','aura-retirement','aura-ledgers','retirement-contact','aura-activation']){
  const manifest=JSON.parse(track('baseline/'+name+'/acceptance.json')),source=track(manifest.source).toString(),packed=track('baseline/'+name+'/observations.json.gz'),expected=gunzipSync(packed);
  assert.equal(sha256(source),manifest.sourceSha256);assert.equal(manifest.sourceLockSha256,report.sources['baseline/source-lock.json']);assert.equal(sha256(packed),manifest.gzipSha256);assert.equal(sha256(expected),manifest.sha256);courses.set(name,{source,expected,observations:manifest.observations,virtual:path.join(ref,'balance/hwe-'+name+'.ts')});
 }
 const known=JSON.parse(gunzipSync(track('baseline/companion-continuation/original.logs.json.gz')))['original-1'];
 courses.set('private-companion',{source:track('test/companion-continuation-game.ts').toString(),expectedLogs:'Companion private game continuation: 4 courses, 15 stages passed\n\n'+known.stderr,privateCourses:4,privateStages:15,virtual:path.join(ref,'balance/hwe-private-recovery.ts')});
 const simConfig=ts.getParsedCommandLineOfConfigFile(path.join(ref,'tsconfig.sim.json'),{}, {...ts.sys,onUnRecoverableConfigFileDiagnostic:d=>{throw Error(ts.flattenDiagnosticMessageText(d.messageText,'\n'));}});assert(simConfig);
 const paths=Object.fromEntries(Object.entries(installedPkg.exports).filter(([,e])=>e.types).map(([key,e])=>['@hollow-wake/engine'+(key==='.'?'':key.slice(1)),[path.join(installed,e.types)]])),typed=new Map([...overlay,...[...courses.values()].map(c=>[c.virtual,c.source])]),options={...simConfig.options,baseUrl:root,paths,typeRoots:[path.join(ref,'node_modules/@types')]},typeHost=ts.createCompilerHost(options),readFile=typeHost.readFile.bind(typeHost),existsFile=typeHost.fileExists.bind(typeHost);
 typeHost.readFile=p=>typed.get(path.resolve(p))??readFile(p);typeHost.fileExists=p=>typed.has(path.resolve(p))||existsFile(p);const issues=ts.getPreEmitDiagnostics(ts.createProgram([...new Set([...simConfig.fileNames,...typed.keys()])],options,typeHost));assert.equal(issues.length,0,ts.formatDiagnostics(issues,{getCurrentDirectory:()=>ref,getCanonicalFileName:p=>p,getNewLine:()=>'\n'}));report.types=true;
 async function replay(name,label,fault,originalOnly=false){
  const course=courses.get(name),entry=path.join(work,label+'.cjs'),output=path.join(work,label+'.json');
  const bundled=await build({stdin:{contents:course.source,loader:'ts',resolveDir:path.join(ref,'balance')},bundle:true,platform:'node',format:'cjs',logLevel:'silent',metafile:true,outfile:entry,plugins:originalOnly?[]:[{name:'installed-aura-activation',setup(b){
   b.onResolve({filter:/^@hollow-wake\/engine(?:\/|$)/},args=>{const key='.'+args.path.slice('@hollow-wake/engine'.length),entry=installedPkg.exports[key]?.import;assert(entry);return{path:path.join(installed,entry)};});
   b.onLoad({filter:/\.(ts|js)$/},args=>{const file=path.resolve(args.path);let contents=overlay.get(file);if(fault&&file===(fault.file==='world.ts'?worldFile:fault.file==='actor.ts'?actorFile:path.join(installed,'dist',fault.file))){contents??=fs.readFileSync(file,'utf8');assert.equal(contents.split(fault.from).length,2,label+' selector');contents=contents.replace(fault.from,fault.to);}if(contents!==undefined)return{contents,loader:file.endsWith('.ts')?'ts':'js'};});
  }}]});
  const loaded=new Set(Object.keys(bundled.metafile.inputs).map(p=>path.resolve(p)));if(!originalOnly)for(const file of ['aura-activation','aura-ledgers','aura-retirement','companion-recovery','body-levels','companion-bonds','companion-bond-rules','minion-inheritance','attribute-bequests'])assert(loaded.has(path.join(installed,'dist/'+file+'.js')),'Replay bypassed installed '+file);
  const c=run(label,[entry,output],ref),matched=c.status===0&&(course.expected?fs.readFileSync(output).equals(course.expected):logs[label]===course.expectedLogs);
  if(fault){assert(!matched,'Fault escaped '+label);if(c.status!==0){assert.equal(c.status,1);assert.match(logs[label],/ERR_ASSERTION/);}report.faults.push({name:label,detected:true,logSha256:sha256(logs[label])});}else assert(matched,label+': '+logs[label].slice(-6000));
 }
 for(const[name,c]of courses){if(c.expected)await replay(name,'original-'+name,undefined,true);for(let i=1;i<=2;i++)await replay(name,name+'-'+i);report.courses.push({name,observations:c.observations,privateCourses:c.privateCourses,privateStages:c.privateStages,freshProcesses:2});}
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
 assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;const data=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(data);fs.writeFileSync(path.join(owned,stem+'.logs.json.gz'),data);fs.writeFileSync(path.join(owned,stem+'.json'),JSON.stringify(report,null,2)+'\n');
}
assert(report.passed,report.failure??'Inputs changed');
console.log({passed:report.passed,types:report.types,courses:report.courses,faults:report.faults.length,adapterGuards:report.adapterGuards,restored:report.restored,cleaned:true,failure:report.failure});
