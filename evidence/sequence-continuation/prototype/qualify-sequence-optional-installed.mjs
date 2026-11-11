import {npmCli} from '../scripts/npm-cli.mjs';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {gzipSync,gunzipSync} from 'node:zlib';import ts from 'typescript';import {build} from 'esbuild';import {root,sha256,verifyReference} from '../scripts/reference-utils.mjs';import {renderSequenceRecovery,sequenceRecoveryFile} from '../adapters/hollow-wake/integrate-sequence-recovery.mjs';import {attackSequenceFiles,renderAttackSequenceFile} from '../adapters/hollow-wake/integrate-attack-sequences.mjs';
const attempt=process.argv[2];assert(/^r\d+$/.test(attempt));const stem='sequence-optional-installed-'+attempt,owned=fs.realpathSync(path.join(root,'.artifacts')),ref=path.join(root,'.reference'),read=f=>fs.readFileSync(path.join(root,f));assert(!fs.existsSync(path.join(owned,stem+'.json')));
const originals=[['cast','export-sequence-continuation.ts','sequence-continuation-original-r1',5],['flight','export-sequence-flight-ownership.ts','sequence-flight-ownership-original-r1',6],['recovery','export-sequence-recovery-ownership.ts','sequence-recovery-ownership-original-r3',9],['deferred','export-sequence-deferred-ownership.ts','sequence-deferred-ownership-original-r1',8]];
const privates=[['cast','sequence-continuation-game-identities.ts','Sequence private component continuation: 3 courses, 21 stages passed',3,21],['flight','sequence-flight-private-game.ts','Sequence private flight continuation: 2 courses, 14 stages passed',2,14],['recovery','sequence-recovery-private-game.ts','Sequence private recovery continuation: 4 courses, 20 stages passed',4,20],['deferred','sequence-deferred-private-game.ts','Sequence private deferred continuation: 3 courses, 15 stages passed',3,15]];
const candidateNames={'attack-sequences':'attack-sequences-optional','attack-sequence-continuation':'attack-sequence-continuation','attack-sequence-owned':'attack-sequence-owned'},lock=JSON.parse(read('baseline/source-lock.json'));
const virtuals=new Map(attackSequenceFiles.map(f=>[path.join(ref,f),renderAttackSequenceFile(f,f===sequenceRecoveryFile?renderSequenceRecovery(read('.reference/'+f).toString()):read('.reference/'+f).toString())]));for(const[n,f]of Object.entries(candidateNames))virtuals.set(path.join(root,'src',n+'.ts'),read('.artifacts/'+f+'.ts').toString());
const entries=Object.fromEntries(['attack-sequences','attack-sequence-content','attack-sequence-continuation'].map(n=>['@hollow-wake/engine/combat/'+n,path.join(root,'src',n+'.ts')]));
const inputs=['.artifacts/sequence-optional-package-r1.json','.artifacts/sequence-optional-candidate-r1.tgz','.artifacts/qualify-sequence-optional-installed.mjs','.artifacts/sequence-optional-r2.json','.artifacts/sequence-continuation-courses-review.json','baseline/source-lock.json','tsconfig.json','src/attack-sequence-types.ts','src/sequence-recovery.ts','src/attack-sequence-content.ts','adapters/hollow-wake/attack-sequences.ts','adapters/hollow-wake/attack-sequence-spec.ts','adapters/hollow-wake/integrate-attack-sequences.mjs','adapters/hollow-wake/integrate-sequence-recovery.mjs',...Object.values(candidateNames).map(f=>'.artifacts/'+f+'.ts')];
const courses=[];
for(const[name,file,baseline,count]of originals){const report=JSON.parse(read('.artifacts/'+baseline+'.json'));assert(report.passed&&report.cleaned&&report.originalOnly);const source=read('.artifacts/'+file).toString();assert.equal(sha256(Buffer.from(source)),report.sources['.artifacts/'+file]);const expected=gunzipSync(read('.artifacts/'+baseline+'.observations.json.gz'));assert.equal(sha256(expected),report.sha256);const log=JSON.parse(gunzipSync(read('.artifacts/'+baseline+'.logs.json.gz')))['original-1'];courses.push({name:'original-'+name,source,expected,log,count});inputs.push('.artifacts/'+file,'.artifacts/'+baseline+'.json','.artifacts/'+baseline+'.observations.json.gz','.artifacts/'+baseline+'.logs.json.gz');}
for(const[name,file,stdout,contexts,stages]of privates){let source=read('.artifacts/'+file).toString();const from='source.w.attackSequences.copyOwnedStateTo(';assert.equal(source.split(from).length,2,file);source="import {copyAttackSequenceState} from '@hollow-wake/engine/combat/attack-sequence-continuation';\n"+source.replace(from,'copyAttackSequenceState(source.w.attackSequences,');courses.push({name:'private-'+name,source,log:{stdout:stdout+'\n',stderr:courses.find(c=>c.name==='original-'+name).log.stderr},contexts,stages});inputs.push('.artifacts/'+file);}
for(const c of courses){c.virtual=path.join(ref,'balance/hwe-optional-sequence-'+c.name+'.ts');virtuals.set(c.virtual,c.source);}
const report={passed:false,candidateOnly:true,installed:true,binding:"guarded virtual original-game bindings over the installed archive",normalComposed:false,faults:[],sources:Object.fromEntries(inputs.map(f=>[f,sha256(read(f))])),courses:[]},logs={},work=fs.mkdtempSync(path.join(owned,'sequence-optional-installed-owned-'));
try{
 const pkg=JSON.parse(read('.artifacts/sequence-optional-package-r1.json'));assert(pkg.passed&&pkg.cleaned&&pkg.restored&&pkg.types&&pkg.hostileBrowser);const archive=path.join(root,pkg.retainedArchive.file);assert.equal(sha256(fs.readFileSync(archive)),pkg.archiveSha256);
 fs.writeFileSync(path.join(work,'package.json'),JSON.stringify({private:true,type:'module'}));const installed=spawnSync(process.execPath,[npmCli(),'install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund'],{cwd:work,windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NPM_CONFIG_CACHE:path.join(work,'npm-cache'),NODE_COMPILE_CACHE:path.join(work,'compile-cache')}});logs.install={stdout:installed.stdout??'',stderr:installed.stderr??''};assert(!installed.error&&!installed.signal);assert.equal(installed.status,0,JSON.stringify(logs.install));report.archiveSha256=pkg.archiveSha256;
 const dist=path.join(work,'node_modules/@hollow-wake/engine/dist');for(const[n,details]of Object.entries(pkg.modules)){assert.equal(sha256(fs.readFileSync(path.join(dist,n+'.js'))),details.sha256);assert.equal(sha256(fs.readFileSync(path.join(dist,n+'.d.ts'))),details.typesSha256);}for(const n of Object.keys(candidateNames))virtuals.delete(path.join(root,'src',n+'.ts'));for(const key of Object.keys(entries))entries[key]=path.join(dist,key.slice(key.lastIndexOf('/')+1)+'.js');
 const faults=[
  {
    "course": "private-cast",
    "name": "retired-cast-revived",
    "from": "retired:source.retired",
    "to": "retired:false"
  },
  {
    "course": "private-cast",
    "name": "variant-cast-alias-lost",
    "from": "const found=casts.get(source);if(found)return found;",
    "to": "const found=casts.get(source);if(false&&found)return found;"
  },
  {
    "course": "private-cast",
    "name": "live-controller-owner-retained",
    "from": "owner:actor(source.owner),host:skill(source.host)",
    "to": "owner:source.owner,host:skill(source.host)"
  },
  {
    "course": "private-cast",
    "name": "live-receipt-target-retained",
    "from": "{...source.receipt,target:actor(source.receipt.target)}",
    "to": "{...source.receipt,target:source.receipt.target}"
  },
  {
    "course": "private-cast",
    "name": "source-counter-restarted",
    "from": "serial:owned.serial,continuationImported:true",
    "to": "serial:0,continuationImported:true"
  },
  {
    "course": "private-flight",
    "name": "flight-clock-bank-discarded",
    "from": "rainAt,deferredContacts,serial:",
    "to": "rainAt:new WeakMap(),deferredContacts,serial:"
  },
  {
    "course": "private-flight",
    "name": "flight-clock-retains-live-projectile-key",
    "from": "rainAt.set(target,owned.rainAt.get(source)!)",
    "to": "rainAt.set(source,owned.rainAt.get(source)!)"
  },
  {
    "course": "private-flight",
    "name": "absent-receipt-slot-materialized",
    "from": "casts.set(source,target);return target;",
    "to": "target.receipt ??= undefined; casts.set(source,target);return target;"
  },
  {
    "course": "private-flight",
    "name": "active-flight-cast-lost",
    "from": "casts:ownedCasts,active,recoveries,scheduled,",
    "to": "casts:ownedCasts,active:new Set(),recoveries,scheduled,"
  },
  {
    "course": "private-flight",
    "name": "flight-controller-keeps-live-owner",
    "from": "owner:actor(source.owner),host:skill(source.host)",
    "to": "owner:source.owner,host:skill(source.host)"
  },
  {
    "course": "private-recovery",
    "name": "recovery-retains-live-target",
    "from": "target:r.target?actor(r.target):undefined",
    "to": "target:r.target"
  },
  {
    "course": "private-recovery",
    "name": "recovery-retains-live-marker",
    "from": "marker:r.marker?actor(r.marker):undefined",
    "to": "marker:r.marker"
  },
  {
    "course": "private-recovery",
    "name": "recovery-retains-live-projectile",
    "from": "projectile:projectile(r.projectile)",
    "to": "projectile:r.projectile"
  },
  {
    "course": "private-recovery",
    "name": "recovery-breaks-cast-alias",
    "from": "cast:cast(r.cast)",
    "to": "cast:{...cast(r.cast)}"
  },
  {
    "course": "private-recovery",
    "name": "scheduled-repeats-dropped",
    "from": "active,recoveries,scheduled,",
    "to": "active,recoveries,scheduled:[],"
  },
  {
    "course": "private-recovery",
    "name": "scheduled-aim-retains-live-object",
    "from": "inst:skill(j.inst),aim:aim(j.aim)",
    "to": "inst:skill(j.inst),aim:j.aim"
  },
  {
    "course": "private-recovery",
    "name": "recovery-elapsed-clock-reset",
    "from": "...r,cast:cast(r.cast)",
    "to": "...r,elapsed:0,cast:cast(r.cast)"
  },
  {
    "course": "private-deferred",
    "name": "deferred-target-retains-live-actor",
    "from": "projectile:projectile(c.projectile),target:actor(c.target)",
    "to": "projectile:projectile(c.projectile),target:c.target"
  },
  {
    "course": "private-deferred",
    "name": "deferred-projectile-retains-live-carrier",
    "from": "projectile:projectile(c.projectile),target:actor(c.target)",
    "to": "projectile:c.projectile,target:actor(c.target)"
  },
  {
    "course": "private-deferred",
    "name": "deferred-contacts-discarded",
    "from": "rainAt,deferredContacts,serial:",
    "to": "rainAt,deferredContacts:[],serial:"
  },
  {
    "course": "private-deferred",
    "name": "deferred-cast-associations-discarded",
    "from": "states:ownedStates,casts:ownedCasts,active,",
    "to": "states:ownedStates,casts:new WeakMap(),active,"
  },
  {
    "course": "private-deferred",
    "name": "delayed-opening-retains-live-state",
    "from": "state:state(j.state),inst:skill(j.inst)",
    "to": "state:j.state,inst:skill(j.inst)"
  }
],service=read('.artifacts/attack-sequence-continuation.ts').toString(),serviceFile=path.join(dist,'attack-sequence-continuation.js'),serviceBytes=fs.readFileSync(serviceFile);for(const f of faults)assert.equal(service.split(f.from).length,2,f.name+' selector');
 verifyReference(ref,lock);const config=ts.getParsedCommandLineOfConfigFile(path.join(ref,'tsconfig.sim.json'),{}, {...ts.sys,onUnRecoverableConfigFileDiagnostic:d=>{throw Error(ts.flattenDiagnosticMessageText(d.messageText,'\n'));}});assert(config);
 const options={...config.options,baseUrl:root,paths:Object.fromEntries(Object.entries(entries).map(([k,v])=>[k,[v.replace(/\.js$/,'.d.ts')]])),typeRoots:[path.join(ref,'node_modules/@types')]},host=ts.createCompilerHost(options),oldRead=host.readFile.bind(host),exists=host.fileExists.bind(host);host.readFile=f=>virtuals.get(path.resolve(f))??oldRead(f);host.fileExists=f=>virtuals.has(path.resolve(f))||exists(f);
 const errors=ts.getPreEmitDiagnostics(ts.createProgram([...new Set([...config.fileNames.filter(f=>Object.hasOwn(lock.files,path.relative(ref,f).replaceAll('\\','/'))),...virtuals.keys()])],options,host));assert.equal(errors.length,0,ts.formatDiagnostics(errors,{getCurrentDirectory:()=>ref,getCanonicalFileName:p=>p,getNewLine:()=>'\n'}));report.types=true;
 const plugin={name:'optional-sequence-game',setup(b){b.onResolve({filter:/^@hollow-wake\/engine\//},args=>{assert(entries[args.path]);return{path:entries[args.path]};});b.onResolve({filter:/\.js$/},args=>{const f=path.resolve(args.resolveDir,args.path.replace(/\.js$/,'.ts'));if(virtuals.has(f))return{path:f};});b.onLoad({filter:/\.ts$/},args=>{const contents=virtuals.get(path.resolve(args.path));if(contents!==undefined)return{contents,loader:'ts'};});}};
 async function replay(c,label,fault){
  if(fault)fs.writeFileSync(serviceFile,ts.transpileModule(service.replace(fault.from,fault.to),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},fileName:'attack-sequence-continuation.ts'}).outputText);
  const entry=path.join(work,label+'.cjs'),output=path.join(work,label+'.json');try{
   const built=await build({stdin:{contents:c.source,loader:'ts',resolveDir:path.join(ref,'balance')},bundle:true,platform:'node',format:'cjs',outfile:entry,metafile:true,plugins:[plugin],logLevel:'silent'});assert(Object.keys(built.metafile.inputs).some(f=>path.resolve(f)===entries['@hollow-wake/engine/combat/attack-sequences']));if(c.contexts)assert(Object.keys(built.metafile.inputs).some(f=>path.resolve(f)===serviceFile));
   const child=spawnSync(process.execPath,[entry,output],{cwd:ref,windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_COMPILE_CACHE:path.join(work,'compile-cache')}});logs[label]={stdout:child.stdout??'',stderr:child.stderr??''};assert(!child.error&&!child.signal);
   if(fault){assert.equal(child.status,1,label+' escaped');assert.match(logs[label].stderr,/ERR_ASSERTION/);report.faults.push({name:fault.name,course:c.name,detected:true});}
   else{assert.equal(child.status,0,label+': '+JSON.stringify(logs[label]).slice(-7000));assert.deepEqual(logs[label],c.log);if(c.expected)assert(fs.readFileSync(output).equals(c.expected));else assert(!fs.existsSync(output));}
  }finally{fs.writeFileSync(serviceFile,serviceBytes);if(fs.existsSync(entry))fs.unlinkSync(entry);if(fs.existsSync(output))fs.unlinkSync(output);}
 }
 for(const c of courses){await replay(c,c.name+'-1');await replay(c,c.name+'-2');for(const f of faults.filter(f=>f.course===c.name))await replay(c,f.name,f);if(c.contexts)await replay(c,c.name+'-restored');report.courses.push({name:c.name,observations:c.count,privateCourses:c.contexts,privateStages:c.stages,freshProcesses:2});}
 assert(fs.readFileSync(serviceFile).equals(serviceBytes));assert.equal(report.faults.length,22);report.restored=true;

 report.originalObservations=report.courses.reduce((n,c)=>n+(c.observations??0),0);report.privateCourses=report.courses.reduce((n,c)=>n+(c.privateCourses??0),0);report.privateStages=report.courses.reduce((n,c)=>n+(c.privateStages??0),0);assert.equal(report.originalObservations,28);assert.equal(report.privateCourses,12);assert.equal(report.privateStages,70);report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{try{verifyReference(ref,lock);report.inputsUnchanged=Object.entries(report.sources).every(([f,h])=>sha256(read(f))===h);report.passed=report.passed&&report.inputsUnchanged;}finally{assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;const bytes=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(bytes);fs.writeFileSync(path.join(owned,stem+'.logs.json.gz'),bytes,{flag:'wx'});fs.writeFileSync(path.join(owned,stem+'.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}}
assert(report.passed,report.failure??'Inputs changed');console.log({passed:true,candidateOnly:true,installed:true,originalObservations:28,privateCourses:12,privateStages:70,faults:report.faults.length,types:true,cleaned:true});
