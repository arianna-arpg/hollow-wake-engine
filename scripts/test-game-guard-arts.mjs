import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {gzipSync,gunzipSync} from 'node:zlib';
import ts from 'typescript';import {build} from 'esbuild';import {root,sha256,verifyReference} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';
import {integrateGuardArts,renderGuardArts,guardArtsBindings} from '../adapters/hollow-wake/integrate-guard-arts.mjs';
assert.equal(process.argv.length,2);
const owned=path.join(root,'.artifacts');fs.mkdirSync(owned,{recursive:true});
const work=fs.mkdtempSync(path.join(owned,'guard-arts-game-owned-')),consumer=path.join(work,'consumer');fs.mkdirSync(consumer);
const ref=path.join(root,'.reference'),read=file=>fs.readFileSync(file,'utf8'),logs={},report={passed:false,sources:{},courses:[],faults:[],adapterGuards:0};
function tracked(file){const bytes=fs.readFileSync(path.join(root,file));report.sources[file]=sha256(bytes);return bytes;}
const lock=JSON.parse(tracked('baseline/source-lock.json'));
for(const file of ['src/guard-arts.ts','adapters/hollow-wake/guardArts.ts','adapters/hollow-wake/guardArtsSpec.ts','adapters/hollow-wake/integrate-guard-arts.mjs','adapters/hollow-wake/install-character-sources.mjs','scripts/prepare-game-adapter.mjs','scripts/test-game-guard-arts.mjs','package.json','package-lock.json'])tracked(file);
const run=(label,args,cwd=consumer)=>{const c=spawnSync(process.execPath,args,{cwd,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:4*1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_PATH:'',NODE_COMPILE_CACHE:path.join(work,'compile-cache')}});logs[label]={stdout:c.stdout??'',stderr:c.stderr??''};assert(!c.error&&!c.signal,label+': '+c.error);return c;};
const success=(label,args,cwd)=>{const c=run(label,args,cwd);assert.equal(c.status,0,JSON.stringify(logs[label]));return c;};
try{
 verifyReference(ref,lock);
 success('pack',[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work,'--cache',path.join(work,'npm-cache')],root);
 const archive=path.join(work,JSON.parse(logs.pack.stdout)[0].filename);report.archiveSha256=sha256(fs.readFileSync(archive));
 fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
 success('install',[npmCli(),'install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(work,'npm-cache')]);
 const installed=path.join(consumer,'node_modules/@hollow-wake/engine'),pkg=JSON.parse(read(path.join(installed,'package.json'))),runtime=path.join(installed,'dist/guard-arts.js'),runtimeSource=read(runtime);
 const bindings=guardArtsBindings(),fixture=path.join(work,'fixture'),originals=new Map();
 for(const[file,binding]of bindings){
  const original=read(path.join(ref,file));originals.set(file,original);fs.mkdirSync(path.dirname(path.join(fixture,file)),{recursive:true});fs.writeFileSync(path.join(fixture,file),original);
  for(const nl of ['\n','\r\n']){const raw=original.replace(/\r?\n/g,nl),extra=nl+'// unrelated host extension'+nl,rendered=renderGuardArts(raw+extra,raw,binding);
   assert(rendered.endsWith(extra));assert.equal(rendered.includes('\r\n'),nl==='\r\n');assert.throws(()=>renderGuardArts('/* unreviewed */'+raw,raw,binding),/Unreviewed/);report.adapterGuards+=3;}
 }
 integrateGuardArts(fixture,false);for(const[file,original]of originals)assert.equal(read(path.join(fixture,file)),original);report.adapterGuards++;
 const specFile='src/engine/guardArtsSpec.ts';fs.appendFileSync(path.join(fixture,specFile),'\n');fs.writeFileSync(path.join(fixture,specFile),'/* changed */'+originals.get(specFile));
 assert.throws(()=>integrateGuardArts(fixture),/Unreviewed/);assert.equal(read(path.join(fixture,'src/engine/guardArts.ts')),originals.get('src/engine/guardArts.ts'));report.adapterGuards++;
 fs.writeFileSync(path.join(fixture,specFile),originals.get(specFile));integrateGuardArts(fixture);assert.throws(()=>integrateGuardArts(fixture),/already installed/);report.adapterGuards++;
 const overlay=new Map([...bindings.keys()].map(file=>[path.join(ref,file),read(path.join(fixture,file))]));
 const courses=new Map();
 for(const name of ['guard-build','bond-build','companion-world-build']){
  const manifest=JSON.parse(tracked('baseline/'+name+'/acceptance.json')),source=tracked(manifest.source).toString(),packed=tracked('baseline/'+name+'/observations.json.gz'),expected=gunzipSync(packed);
  assert.equal(sha256(source),manifest.sourceSha256);assert.equal(manifest.sourceLockSha256,report.sources['baseline/source-lock.json']);assert.equal(sha256(packed),manifest.gzipSha256);assert.equal(sha256(expected),manifest.sha256);
  courses.set(name,{source,expected,manifest,virtual:path.join(ref,'balance/hwe-'+name+'.ts')});
 }
 const mechanics=JSON.parse(tracked('baseline/guard-mechanics/acceptance.json')),packed=tracked('baseline/guard-mechanics/original.logs.json.gz');
 assert.equal(sha256(packed),mechanics.logsSha256);assert.equal(mechanics.sourceLockSha256,report.sources['baseline/source-lock.json']);const mechanicsSource=read(path.join(ref,mechanics.source));assert.equal(sha256(mechanicsSource),mechanics.sourceSha256);
 courses.set('mechanics',{source:mechanicsSource,expectedLogs:JSON.parse(gunzipSync(packed))[0],manifest:mechanics,virtual:path.join(ref,mechanics.source)});
 courses.set('ownership',{source:tracked('test/guard-arts-binding-game.ts').toString(),expectedLogs:{stdout:'Guard binding ownership: 5 assertions passed\n',stderr:''},manifest:{assertions:5},virtual:path.join(ref,'balance/hwe-guard-binding.ts')});
 const config=ts.getParsedCommandLineOfConfigFile(path.join(ref,'tsconfig.sim.json'),{}, {...ts.sys,onUnRecoverableConfigFileDiagnostic:d=>{throw Error(ts.flattenDiagnosticMessageText(d.messageText,'\n'));}});assert(config);
 const paths=Object.fromEntries(Object.entries(pkg.exports).filter(([,entry])=>entry.types).map(([key,entry])=>['@hollow-wake/engine'+(key==='.'?'':key.slice(1)),[path.join(installed,entry.types)]]));
 const typed=new Map([...overlay,...[...courses.values()].map(c=>[c.virtual,c.source])]),options={...config.options,baseUrl:root,paths,typeRoots:[path.join(ref,'node_modules/@types')]},host=ts.createCompilerHost(options),readFile=host.readFile.bind(host),exists=host.fileExists.bind(host);
 host.readFile=p=>typed.get(path.resolve(p))??readFile(p);host.fileExists=p=>typed.has(path.resolve(p))||exists(p);
 const program=ts.createProgram([...new Set([...config.fileNames,...typed.keys()])],options,host),diagnostics=ts.getPreEmitDiagnostics(program);
 assert.equal(diagnostics.length,0,ts.formatDiagnostics(diagnostics,{getCurrentDirectory:()=>ref,getCanonicalFileName:p=>p,getNewLine:()=>'\n'}));report.types=true;
 async function replay(name,label,original=false,fault){
  const course=courses.get(name),entry=path.join(work,label+'.cjs'),output=path.join(work,label+'.json');
  const result=await build({stdin:{contents:course.source,loader:'ts',resolveDir:path.join(ref,'balance')},bundle:true,platform:'node',format:'cjs',logLevel:'silent',metafile:true,outfile:entry,plugins:original?[]:[{name:'installed-guard-arts',setup(b){
   b.onResolve({filter:/^@hollow-wake\/engine(?:\/|$)/},args=>{const key='.'+args.path.slice('@hollow-wake/engine'.length),entry=pkg.exports[key]?.import;assert(entry);return{path:path.join(installed,entry)};});
   b.onLoad({filter:/guardArts(?:Spec)?\.ts$/},args=>{let contents=overlay.get(path.resolve(args.path));if(contents===undefined)return;if(fault?.file===path.basename(args.path)){assert.equal(contents.split(fault.from).length,2);contents=contents.replace(fault.from,fault.to);}return{contents,loader:'ts'};});
   if(fault?.file==='runtime')b.onLoad({filter:/[\\/]dist[\\/]guard-arts\.js$/},args=>{assert.equal(path.resolve(args.path),runtime);assert.equal(runtimeSource.split(fault.from).length,2);return{contents:runtimeSource.replace(fault.from,fault.to),loader:'js'};});
  }}]});
  if(!original)assert(Object.keys(result.metafile.inputs).map(p=>path.resolve(p)).includes(runtime),'Replay bypassed installed guard runtime');
  const child=run(label,[entry,output],ref),matched=child.status===0&&(course.expected?fs.readFileSync(output).equals(course.expected):JSON.stringify(logs[label])===JSON.stringify(course.expectedLogs));
  if(fault){assert(!matched,'Fault escaped '+label);if(child.status!==0){assert.equal(child.status,1);assert.match(JSON.stringify(logs[label]),/ERR_ASSERTION/);}report.faults.push({name:label,detected:true,logSha256:sha256(JSON.stringify(logs[label]))});}
  else assert(matched,label+' differs from original: '+JSON.stringify(logs[label]).slice(-6000));
 }
 for(const[name,course]of courses){await replay(name,'original-'+name,true);await replay(name,'installed-'+name);report.courses.push({name,observations:course.manifest.observations,groups:course.manifest.groups,assertions:course.manifest.assertions,modes:['original','installed']});}
 const faults=[
  ['no-plates','mechanics','runtime','s.plates = Math.min(p.max, s.plates + 1);','s.plates = 0;'],
  ['no-intervention','mechanics','runtime','this.p.spendAbsorb(a, amount)','amount'],
  ['cold-rebuild','guard-build','runtime','state.policy !== policy','true'],
  ['missing-projectile-owner','ownership','guardArts.ts','p.caster!==a||p.inst.guardArtsHost!==host','p.caster!==a'],
  ['missing-node-rules','mechanics','guardArtsSpec.ts','id=>treeNodeOf(inst.def,id)?.guardArts','()=>undefined'],
 ];
 for(const[name,course,file,from,to]of faults)await replay(course,'fault-'+name,false,{file,from,to});
 await replay('guard-build','restored-build');await replay('mechanics','restored-mechanics');report.restored=true;report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 try{verifyReference(ref,lock);report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(fs.readFileSync(path.join(root,file)))===hash);report.passed=report.passed&&report.inputsUnchanged;
  const bytes=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(bytes);fs.writeFileSync(path.join(owned,'guard-arts-game.logs.json.gz'),bytes);
 }catch(error){report.passed=false;report.failure=String(error);process.exitCode=1;}
 finally{assert.equal(path.dirname(fs.realpathSync(work)),fs.realpathSync(owned));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;fs.writeFileSync(path.join(owned,'guard-arts-game.json'),JSON.stringify(report,null,2)+'\n');}
}
assert(report.passed,report.failure);console.log({passed:true,types:report.types,courses:report.courses,faults:report.faults.length,guards:report.adapterGuards,cleaned:true});
