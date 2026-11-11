import {renderSequenceRecovery,sequenceRecoveryFile} from '../adapters/hollow-wake/integrate-sequence-recovery.mjs';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {gzipSync,gunzipSync} from 'node:zlib';import ts from 'typescript';import {build} from 'esbuild';import {root,sha256,verifyReference} from '../scripts/reference-utils.mjs';import {attackSequenceFiles,renderAttackSequenceFile} from '../adapters/hollow-wake/integrate-attack-sequences.mjs';
const attempt=process.argv[2];assert(/^r\d+$/.test(attempt));const owned=fs.realpathSync(path.join(root,'.artifacts')),ref=path.join(root,'.reference'),stem='sequence-recovery-private-faults-'+attempt;assert(!fs.existsSync(path.join(owned,stem+'.json')));
const read=file=>fs.readFileSync(path.join(root,file)),source=read('.artifacts/attack-sequences-continuation.ts').toString(),course=read('.artifacts/sequence-recovery-private-game.ts').toString(),lock=JSON.parse(read('baseline/source-lock.json')),accepted=JSON.parse(read('.artifacts/sequence-recovery-ownership-original-r3.json'));
assert(accepted.passed&&accepted.originalOnly&&accepted.restored&&accepted.cleaned);
const expected=gunzipSync(read('.artifacts/sequence-recovery-ownership-original-r3.observations.json.gz'));assert.equal(sha256(expected),accepted.sha256);const originalLogs=JSON.parse(gunzipSync(read('.artifacts/sequence-recovery-ownership-original-r3.logs.json.gz')))['original-1'],expectedLogs={stdout:'Sequence private recovery continuation: 4 courses, 20 stages passed\n',stderr:originalLogs.stderr};
const virtuals=new Map(attackSequenceFiles.map(file=>[path.join(ref,file),renderAttackSequenceFile(file,file===sequenceRecoveryFile?renderSequenceRecovery(read('.reference/'+file).toString()):read('.reference/'+file).toString())]));virtuals.set(path.join(root,'src/attack-sequences.ts'),source);const virtual=path.join(ref,'balance/hwe-sequence-continuation.ts');virtuals.set(virtual,course);
const entries={'@hollow-wake/engine/combat/attack-sequences':path.join(root,'src/attack-sequences.ts'),'@hollow-wake/engine/combat/attack-sequence-content':path.join(root,'src/attack-sequence-content.ts')};
const inputs=['.artifacts/attack-sequences-continuation.ts','.artifacts/sequence-recovery-private-game.ts','.artifacts/sequence-recovery-ownership-original-r3.json','.artifacts/qualify-sequence-private-recovery-faults.mjs','baseline/source-lock.json','src/attack-sequences.ts','src/attack-sequence-types.ts','src/attack-sequence-content.ts','src/sequence-recovery.ts','adapters/hollow-wake/attack-sequences.ts','adapters/hollow-wake/attack-sequence-spec.ts','adapters/hollow-wake/integrate-attack-sequences.mjs','adapters/hollow-wake/integrate-sequence-recovery.mjs'];
const report={passed:false,candidateOnly:true,installed:false,sources:Object.fromEntries(inputs.map(f=>[f,sha256(read(f))]))},logs={},work=fs.mkdtempSync(path.join(owned,'sequence-recovery-private-faults-owned-'));
try{
 verifyReference(ref,lock);const config=ts.getParsedCommandLineOfConfigFile(path.join(ref,'tsconfig.sim.json'),{}, {...ts.sys,onUnRecoverableConfigFileDiagnostic:d=>{throw Error(ts.flattenDiagnosticMessageText(d.messageText,'\n'));}});assert(config);
 const options={...config.options,baseUrl:root,paths:Object.fromEntries(Object.entries(entries).map(([k,v])=>[k,[v]])),typeRoots:[path.join(ref,'node_modules/@types')]},host=ts.createCompilerHost(options),oldRead=host.readFile.bind(host),exists=host.fileExists.bind(host);host.readFile=file=>virtuals.get(path.resolve(file))??oldRead(file);host.fileExists=file=>virtuals.has(path.resolve(file))||exists(file);
 const errors=ts.getPreEmitDiagnostics(ts.createProgram([...new Set([...config.fileNames.filter(file=>Object.hasOwn(lock.files,path.relative(ref,file).replaceAll('\\','/'))),...virtuals.keys()])],options,host));assert.equal(errors.length,0,ts.formatDiagnostics(errors,{getCurrentDirectory:()=>ref,getCanonicalFileName:p=>p,getNewLine:()=>'\n'}));report.types=true;
 async function replay(label,fault){
  let candidate=source;if(fault){assert.equal(source.split(fault.from).length,2,fault.name+' selector');candidate=source.replace(fault.from,fault.to);}virtuals.set(entries['@hollow-wake/engine/combat/attack-sequences'],candidate);
  const entry=path.join(work,label+'.cjs'),output=path.join(work,label+'.json');
  const built=await build({stdin:{contents:course,loader:'ts',resolveDir:path.join(ref,'balance')},bundle:true,platform:'node',format:'cjs',outfile:entry,metafile:true,logLevel:'silent',plugins:[{name:'candidate-sequence',setup(b){b.onResolve({filter:/^@hollow-wake\/engine\//},args=>{assert(entries[args.path]);return{path:entries[args.path]};});b.onLoad({filter:/\.ts$/},args=>{const contents=virtuals.get(path.resolve(args.path));if(contents!==undefined)return{contents,loader:'ts'};});}}]});
  assert(Object.keys(built.metafile.inputs).some(f=>path.resolve(f)===entries['@hollow-wake/engine/combat/attack-sequences']));
  const c=spawnSync(process.execPath,[entry,output],{cwd:ref,windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_COMPILE_CACHE:path.join(work,'compile-cache')}});logs[label]={stdout:c.stdout??'',stderr:c.stderr??''};assert(!c.error&&!c.signal);
  if(fault){assert.equal(c.status,1,label+' escaped');assert.match(logs[label].stderr,/ERR_ASSERTION/);report.faults.push({name:fault.name,detected:true,detection:'independent assertion'});}
  else{assert.equal(c.status,0,JSON.stringify(logs[label]).slice(-7000));assert.deepEqual(logs[label],expectedLogs);assert(!fs.existsSync(output));}fs.unlinkSync(entry);
 }
 await replay('private-1');await replay('private-2');
 report.faults=[];
 const faults=[
  {
    "name": "recovery-retains-live-target",
    "from": "target:r.target?actor(r.target):undefined",
    "to": "target:r.target"
  },
  {
    "name": "recovery-retains-live-marker",
    "from": "marker:r.marker?actor(r.marker):undefined",
    "to": "marker:r.marker"
  },
  {
    "name": "recovery-retains-live-projectile",
    "from": "projectile:projectile(r.projectile)",
    "to": "projectile:r.projectile"
  },
  {
    "name": "recovery-breaks-cast-alias",
    "from": "cast:cast(r.cast)",
    "to": "cast:{...cast(r.cast)}"
  },
  {
    "name": "scheduled-repeats-dropped",
    "from": "runtime.scheduled=scheduled;",
    "to": "runtime.scheduled=[];"
  },
  {
    "name": "scheduled-aim-retains-live-object",
    "from": "inst:skill(j.inst),aim:aim(j.aim)",
    "to": "inst:skill(j.inst),aim:j.aim"
  },
  {
    "name": "recovery-elapsed-clock-reset",
    "from": "...r,cast:cast(r.cast)",
    "to": "...r,elapsed:0,cast:cast(r.cast)"
  }
];
 for(const fault of faults)await replay(fault.name,fault);await replay('restored');report.restored=true;
 report.originalObservations=0;report.privateCourses=4;report.privateStages=20;report.freshProcesses=2;report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{try{verifyReference(ref,lock);report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(read(file))===hash);report.passed=report.passed&&report.inputsUnchanged;}finally{assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;const bytes=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(bytes);fs.writeFileSync(path.join(owned,stem+'.logs.json.gz'),bytes,{flag:'wx'});fs.writeFileSync(path.join(owned,stem+'.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}}
assert(report.passed,report.failure??'Inputs changed');console.log({passed:true,candidateOnly:true,privateCourses:4,privateStages:20,faults:report.faults.length,freshProcesses:2,types:true,cleaned:true});
