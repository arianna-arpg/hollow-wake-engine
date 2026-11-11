import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {gzipSync} from 'node:zlib';import ts from 'typescript';import {build} from 'esbuild';import {root,sha256,verifyReference} from '../scripts/reference-utils.mjs';
const attempt=process.argv[2];assert(/^r\d+$/.test(attempt));const owned=fs.realpathSync(path.join(root,'.artifacts')),ref=path.join(root,'.reference'),stem='sequence-continuation-original-'+attempt;assert(!fs.existsSync(path.join(owned,stem+'.json')));
const read=file=>fs.readFileSync(path.join(root,file)),sourceFile='.artifacts/export-sequence-continuation.ts',source=read(sourceFile).toString(),lock=JSON.parse(read('baseline/source-lock.json'));
const inputs=[sourceFile,'.artifacts/capture-sequence-continuation.mjs','baseline/source-lock.json',...['actor','world','skills','attackSequences'].map(n=>'.reference/src/engine/'+n+'.ts')],sources=Object.fromEntries(inputs.map(file=>[file,sha256(read(file))]));
const work=fs.mkdtempSync(path.join(owned,'sequence-continuation-original-owned-')),logs={},report={passed:false,originalOnly:true,sources,faults:[]};
try{
 verifyReference(ref,lock);const virtual=path.join(ref,'balance/hwe-sequence-continuation.ts'),config=ts.getParsedCommandLineOfConfigFile(path.join(ref,'tsconfig.sim.json'),{}, {...ts.sys,onUnRecoverableConfigFileDiagnostic:d=>{throw Error(ts.flattenDiagnosticMessageText(d.messageText,'\n'));}});assert(config);
 const host=ts.createCompilerHost(config.options),oldRead=host.readFile.bind(host),oldExists=host.fileExists.bind(host);host.readFile=file=>path.resolve(file)===virtual?source:oldRead(file);host.fileExists=file=>path.resolve(file)===virtual||oldExists(file);
 const errors=ts.getPreEmitDiagnostics(ts.createProgram([...config.fileNames,virtual],config.options,host));assert.equal(errors.length,0,ts.formatDiagnostics(errors,{getCurrentDirectory:()=>ref,getCanonicalFileName:p=>p,getNewLine:()=>'\n'}));report.types=true;
 let expected;async function replay(label,fault){
  const entry=path.join(work,label+'.cjs'),output=path.join(work,label+'.json');let changed;if(fault){changed=fs.readFileSync(path.join(ref,fault.file),'utf8');assert.equal(changed.split(fault.from).length,2,label+' selector');changed=changed.replace(fault.from,fault.to);}
  await build({stdin:{contents:source,loader:'ts',resolveDir:path.join(ref,'balance')},bundle:true,platform:'node',format:'cjs',logLevel:'silent',outfile:entry,plugins:fault?[{name:'ownership-fault',setup(b){b.onLoad({filter:/\.ts$/},args=>path.resolve(args.path)===path.join(ref,fault.file)?{contents:changed,loader:'ts'}:undefined);}}]:[]});
  const c=spawnSync(process.execPath,[entry,output],{cwd:ref,windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_COMPILE_CACHE:path.join(work,'compile-cache')}});logs[label]={stdout:c.stdout??'',stderr:c.stderr??''};assert(!c.error&&!c.signal,label+': '+c.error);
  if(fault){assert.equal(c.status,1,label+' escaped');assert.match(logs[label].stderr,/ERR_ASSERTION/);report.faults.push({name:label,detected:true,detection:'independent assertion'});}
  else{assert.equal(c.status,0,label+': '+JSON.stringify(logs[label]).slice(-7000));const bytes=fs.readFileSync(output);if(expected)assert(bytes.equals(expected),'Original ownership changed between fresh processes');else expected=bytes;}
  fs.unlinkSync(entry);if(fs.existsSync(output))fs.unlinkSync(output);
 }
 await replay('original-1');await replay('original-2');assert.deepEqual(logs['original-1'],logs['original-2']);
 const faults=[
  {
    "name": "hit-alias-copies-captured-cast",
    "file": "src/engine/attackSequences.ts",
    "from": "this.casts.set(hit, cast); return hit;",
    "to": "this.casts.set(hit, {...cast}); return hit;"
  },
  {
    "name": "receipt-does-not-advance",
    "file": "src/engine/attackSequences.ts",
    "from": "cast.receipt = { target, dealt, physical };",
    "to": "cast.receipt ??= { target, dealt, physical };"
  },
  {
    "name": "buff-map-loses-identity",
    "file": "src/engine/attackSequences.ts",
    "from": "s.buffs.set(owner, buff);",
    "to": "s.buffs.set(owner, {...buff});"
  },
  {
    "name": "retirement-flag-omitted",
    "file": "src/engine/attackSequences.ts",
    "from": "s.retired = true; this.states.delete(s);",
    "to": "this.states.delete(s);"
  },
  {
    "name": "retired-capture-ignored",
    "file": "src/engine/attackSequences.ts",
    "from": "if (captured) return captured.state.retired ? undefined : captured.state;",
    "to": "if (captured && !captured.state.retired) return captured.state;"
  }
];
 for(const fault of faults)await replay(fault.name,fault);await replay('restored');assert.deepEqual(logs.restored,logs['original-1']);report.restored=true;
 const data=JSON.parse(expected);report.scope=data.scope;report.observations=data.observations.length;report.labels=data.observations.map(o=>o.name);assert.equal(report.observations,5);report.freshProcesses=2;report.sha256=sha256(expected);const packed=gzipSync(expected,{level:9});report.gzipSha256=sha256(packed);fs.writeFileSync(path.join(owned,stem+'.observations.json.gz'),packed,{flag:'wx'});report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{try{verifyReference(ref,lock);report.inputsUnchanged=Object.entries(sources).every(([file,hash])=>sha256(read(file))===hash);report.passed=report.passed&&report.inputsUnchanged;}finally{assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;const bytes=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(bytes);fs.writeFileSync(path.join(owned,stem+'.logs.json.gz'),bytes,{flag:'wx'});fs.writeFileSync(path.join(owned,stem+'.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}}
assert(report.passed,report.failure??'Inputs changed');console.log({passed:true,originalOnly:true,observations:report.observations,faults:report.faults.length,cleaned:true});
