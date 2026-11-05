import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import ts from 'typescript';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';
import {root,sha256,writeJSON,listFiles} from './reference-utils.mjs';
import {buildEmbeddedExecutable,buildEmbeddedLibrary,buildEmbeddedManagedConsumer} from './embedded-native-tools.mjs';
import {prepareUnlockNativeInputs} from './prepare-unlock-native-inputs.mjs';
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file)));
const args=process.argv.slice(2),options={};
assert.equal(args.length%2,0,'Use --amalgam-dir <pinned QuickJS source> [--package-verification <receipt>]');
for(let index=0;index<args.length;index+=2){
 assert(['--amalgam-dir','--package-verification'].includes(args[index])&&!Object.hasOwn(options,args[index]),'Unknown or repeated option');
 options[args[index]]=path.resolve(args[index+1]);
}
assert(options['--amalgam-dir'],'Supply --amalgam-dir <pinned QuickJS source>');
const packages=JSON.parse(fs.readFileSync(options['--package-verification']??path.join(root,'.artifacts/unlock-package-latest.json')));
const inputs=prepareUnlockNativeInputs();
assert(packages.passed&&inputs.passed);
for(const row of packages.archives)assert.equal(sha256(fs.readFileSync(path.join(packages.directory,row.filename))),row.sha256);
const installed=fs.realpathSync(path.join(packages.consumer,'node_modules/@hollow-wake/engine'));
const snapshot=()=>Object.fromEntries(listFiles(installed).map(file=>[file,sha256(fs.readFileSync(path.join(installed,file)))]));
const installedBefore=snapshot();
const consumerSnapshot=()=>Object.fromEntries(listFiles(packages.consumer).map(file=>[file,sha256(fs.readFileSync(path.join(packages.consumer,file)))]));
const consumerBefore=consumerSnapshot();
const sources=new Map(['unlock-lifecycle','unlock-predicates','rune-script'].map(name=>{
 const file=path.join(installed,'dist',name+'.js');return [name,{file,bytes:fs.readFileSync(file)}];
}));
const upstream=options['--amalgam-dir'],lock=read('experiments/embedded-js/host-source-lock.json');
for(const [file,digest]of Object.entries(lock.files))assert.equal(sha256(fs.readFileSync(path.join(upstream,file))),digest);
const directory=fs.mkdtempSync(path.join(root,'.artifacts/unlock-native-'));
const lines=file=>fs.readFileSync(file,'utf8').trim().split(/\r?\n/).map(JSON.parse);
const requestFile=path.join(inputs.directory,'requests.jsonl'),expectedFile=path.join(inputs.directory,'expected.jsonl'),content=path.join(inputs.directory,'content.json');
for(const [file,digest]of [[requestFile,inputs.requestSha256],[expectedFile,inputs.expectedSha256],[content,inputs.contentSha256]])assert.equal(sha256(fs.readFileSync(file)),digest);
const requests=lines(requestFile),expected=lines(expectedFile),names=JSON.parse(fs.readFileSync(path.join(inputs.directory,'names.json')));
assert.equal(requests.length,expected.length);assert.equal(requests.length,inputs.requests);
const report={passed:false,directory,observedAt:new Date().toISOString(),archiveSha256:packages.archives[0].sha256,
 runtimeVersion:lock.version,requests:requests.length,inputProof:inputs,
 platform:process.platform,architecture:process.arch,
 scope:'Selected unlock, memory, progression, relic and storage policies plus compiled data through embedded C, C++ and .NET hosts. Item geometry callbacks are explicitly outside this replay. Physical-device, actual engine-editor, full-frame and total-process memory acceptance remain separate.',runs:[]};
function execute(command,args,cwd,env,log,output){
 const errors=fs.openSync(log,'wx'),stdout=output?fs.openSync(output,'wx'):errors;let result;
 try{result=spawnSync(command,args,{cwd,env,stdio:['ignore',stdout,errors],windowsHide:true,timeout:600000});}
 finally{if(output)fs.closeSync(stdout);fs.closeSync(errors);}
 assert(!result.error,result.error?.message);assert.equal(result.signal,null);assert.equal(result.status,0,log);
 return JSON.parse(fs.readFileSync(log,'utf8').trim().split(/\r?\n/).at(-1));
}
try{
 const nativeDir=path.join(directory,'native');fs.mkdirSync(nativeDir);
 const built=buildEmbeddedExecutable(nativeDir,upstream,path.join(root,'experiments/embedded-js/session-host.c'),'unlock-host');
 const libraryDir=path.join(directory,'library');fs.mkdirSync(libraryDir);
 const library=buildEmbeddedLibrary(libraryDir,upstream),managed=buildEmbeddedManagedConsumer(directory);
 report.binaries={c:sha256(fs.readFileSync(built.binary)),cpp:sha256(fs.readFileSync(library.native)),library:sha256(fs.readFileSync(library.library)),
  managed:sha256(fs.readFileSync(managed.dll)),compiler:built.compilerBanner,dotnetSdk:managed.sdk};
 const entryDirectory=path.join(directory,'consumer');fs.mkdirSync(entryDirectory);
 // A distinct package scope prevents the repository's self-reference export
 // from shadowing the installed archive when resolving @hollow-wake/engine.
 writeJSON(path.join(entryDirectory,'package.json'),{name:'hollow-unlock-native-consumer',private:true,type:'module'});
 fs.symlinkSync(fs.realpathSync(path.join(packages.consumer,'node_modules')),path.join(entryDirectory,'node_modules'),process.platform==='win32'?'junction':'dir');
 const entry=path.join(entryDirectory,'entry.mjs');
 assert(!fs.existsSync(entry));fs.copyFileSync(path.join(root,'reference/native-unlock-session.mjs'),entry,fs.constants.COPYFILE_EXCL);
 for(const label of ['control','finite-currency','predicate-read-order','rune-completion']){
  const outputDirectory=path.join(directory,label);fs.mkdirSync(outputDirectory);
  const bundle=path.join(outputDirectory,'bundle.js');let mutations=0;
  const module=label==='finite-currency'?'unlock-lifecycle':label==='predicate-read-order'?'unlock-predicates':'rune-script';
  const plugins=label==='control'?[]:[{name:'unlock-fault',setup(api){
   api.onLoad({filter:/[\\/]dist[\\/](unlock-lifecycle|unlock-predicates|rune-script)\.js$/},loaded=>{
    const original=sources.get(module);if(fs.realpathSync(loaded.path)!==original.file)return;
    const source=original.bytes.toString();let changed;
    if(label==='predicate-read-order'){
     const ast=ts.createSourceFile(loaded.path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
     const method=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='testUnlockPredicate');
     const clause=method.body.statements.find(ts.isSwitchStatement).caseBlock.clauses.find(n=>ts.isCaseClause(n)&&n.expression.text==='any');
     assert(clause);changed=source.slice(0,clause.getStart(ast))+"case 'any': return predicate.terms.map(term => testUnlockPredicate(term, input)).some(Boolean);"+source.slice(clause.end);
    }else{
     const needle=label==='finite-currency'?'Number.isFinite(a.credits) &&':'fraction >= 1',replacement=label==='finite-currency'?'':'fraction > 1';
     assert.equal(source.split(needle).length,2,label);changed=source.replace(needle,replacement);
    }
    assert.equal(ts.createSourceFile(loaded.path,changed,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS).parseDiagnostics.length,0);
    mutations++;return {contents:changed,loader:'js'};
   });
  }}];
  const compiled=await build({absWorkingDir:entryDirectory,entryPoints:[entry],bundle:true,platform:'neutral',format:'iife',
   globalName:'HollowWakeSession',target:'es2022',keepNames:true,metafile:true,outfile:bundle,plugins,tsconfigRaw:{}});
  assert.equal(mutations,label==='control'?0:1);
  assert(Object.values(compiled.metafile.outputs).every(output=>output.imports.length===0));
  for(const name of Object.keys(compiled.metafile.inputs)){
   const absolute=path.resolve(entryDirectory,name);assert(absolute===entry||absolute.startsWith(path.join(installed,'dist')+path.sep),name);
  }
  const context=vm.createContext({});vm.runInContext(fs.readFileSync(bundle,'utf8'),context);
  context.input=JSON.parse(fs.readFileSync(content));vm.runInContext('const controller=HollowWakeSession.create(JSON.parse(JSON.stringify(input)));',context);
  const node=[],changed=[];
  for(let index=0;index<requests.length;index++){
   context.request=requests[index];const value=JSON.parse(vm.runInContext('JSON.stringify(HollowWakeSession.dispatch(controller,JSON.parse(JSON.stringify(request))))',context));
   node.push(value);if(!isDeepStrictEqual(value,expected[index]))changed.push({index,name:names[index]});
   if(label==='control')assert.deepEqual(value,expected[index],names[index]);
  }
  if(label!=='control'){
   assert(changed.length>0,label+' survived');
   const prefix=label==='finite-currency'?'purchase/':label==='predicate-read-order'?'predicate/':'rune/';
   assert(changed.some(row=>row.name.startsWith(prefix)),label+' missed its intended boundary');
   if(label==='finite-currency')assert(changed.some(row=>row.name.includes('credits-NaN')));
  }else assert.equal(changed.length,0);
  const run={label,passed:false,bundleBytes:fs.statSync(bundle).size,bundleSha256:sha256(fs.readFileSync(bundle)),changed,consumers:[]};
  for(const host of ['c','cpp','dotnet']){
   const output=path.join(outputDirectory,host+'.jsonl'),log=path.join(outputDirectory,host+'.txt');
   const metrics=host==='c'?execute(built.binary,[bundle,content,requestFile],outputDirectory,built.env,log,output):
    host==='cpp'?execute(library.native,[library.library,bundle,content,requestFile,output],outputDirectory,library.env,log):
    execute('dotnet',[managed.dll,library.library,bundle,content,requestFile,output],directory,managed.env,log);
   assert.equal(metrics[host==='c'?'completedRequests':'requests'],requests.length);
   assert.equal(metrics[host==='c'?'liveRequestedBytesAfterDispose':'liveBytesAfterDispose'],0);assert.equal(metrics.liveBlocksAfterDispose,0);
   const values=lines(output);assert.equal(values.length,node.length);
   for(let index=0;index<values.length;index++)assert.deepEqual(values[index],node[index],label+'/'+host+'/'+names[index]);
   run.consumers.push({host,passed:true,metrics,outputSha256:sha256(fs.readFileSync(output))});console.log({label,host,requests:values.length});
  }
  run.passed=true;report.runs.push(run);writeJSON(path.join(directory,'progress.json'),report);
 }
 report.passed=true;
}finally{
 assert.deepEqual(snapshot(),installedBefore,'Installed package changed during native verification');
 assert.deepEqual(consumerSnapshot(),consumerBefore,'Accepted package consumer changed during native verification');
 for(const {file,bytes}of sources.values())assert(fs.readFileSync(file).equals(bytes));
 for(const [file,digest]of Object.entries(lock.files))assert.equal(sha256(fs.readFileSync(path.join(upstream,file))),digest);
 writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/unlock-native-latest.json',report);
 console.log({passed:report.passed,directory,runs:report.runs.length});
}
