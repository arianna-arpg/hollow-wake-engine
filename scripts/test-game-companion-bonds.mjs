import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {gzipSync,gunzipSync} from 'node:zlib';
import ts from 'typescript';import {build} from 'esbuild';import {root,sha256,verifyReference} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';
import {integrateCompanionBonds,renderCompanionBonds,companionBondsBindings} from '../adapters/hollow-wake/integrate-companion-bonds.mjs';
assert.equal(process.argv.length,2);
const owned=path.join(root,'.artifacts');fs.mkdirSync(owned,{recursive:true});
const work=fs.mkdtempSync(path.join(owned,'companion-bonds-game-owned-')),consumer=path.join(work,'consumer');fs.mkdirSync(consumer);
const ref=path.join(root,'.reference'),read=file=>fs.readFileSync(file,'utf8'),logs={},report={passed:false,sources:{},courses:[],faults:[],adapterGuards:0};
function tracked(file){const bytes=fs.readFileSync(path.join(root,file));report.sources[file]=sha256(bytes);return bytes;}
const lock=JSON.parse(tracked('baseline/source-lock.json'));
for(const file of ['src/companion-bonds.ts','src/companion-bond-rules.ts','src/minion-inheritance.ts','src/attribute-bequests.ts','adapters/hollow-wake/companionBonds.ts','adapters/hollow-wake/companionSpec.ts','adapters/hollow-wake/minionInheritance.ts','adapters/hollow-wake/bequests.ts','adapters/hollow-wake/integrate-companion-bonds.mjs','adapters/hollow-wake/install-character-sources.mjs','scripts/prepare-game-adapter.mjs','scripts/test-game-companion-bonds.mjs','package.json','package-lock.json'])tracked(file);
const run=(label,args,cwd=consumer)=>{const c=spawnSync(process.execPath,args,{cwd,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:4*1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_PATH:'',NODE_COMPILE_CACHE:path.join(work,'compile-cache')}});logs[label]={stdout:c.stdout??'',stderr:c.stderr??''};assert(!c.error&&!c.signal,label+': '+c.error);return c;};
const success=(label,args,cwd)=>{const c=run(label,args,cwd);assert.equal(c.status,0,JSON.stringify(logs[label]));return c;};
try{
 verifyReference(ref,lock);
 success('pack',[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work,'--cache',path.join(work,'npm-cache')],root);
 const archive=path.join(work,JSON.parse(logs.pack.stdout)[0].filename);report.archiveSha256=sha256(fs.readFileSync(archive));
 fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
 success('install',[npmCli(),'install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(work,'npm-cache')]);
 const installed=path.join(consumer,'node_modules/@hollow-wake/engine'),pkg=JSON.parse(read(path.join(installed,'package.json')));
 const bindings=companionBondsBindings(),fixture=path.join(work,'fixture'),originals=new Map();
 for(const[file,binding]of bindings){
  const original=read(path.join(ref,file));originals.set(file,original);fs.mkdirSync(path.dirname(path.join(fixture,file)),{recursive:true});fs.writeFileSync(path.join(fixture,file),original);
  for(const nl of ['\n','\r\n']){const raw=original.replace(/\r?\n/g,nl),extra=nl+'// unrelated host extension'+nl,rendered=renderCompanionBonds(raw+extra,raw,binding);
   assert(rendered.endsWith(extra));assert.equal(rendered.includes('\r\n'),nl==='\r\n');assert.throws(()=>renderCompanionBonds('/* unreviewed */'+raw,raw,binding),/Unreviewed/);report.adapterGuards+=3;}
 }
 integrateCompanionBonds(fixture,false);for(const[file,original]of originals)assert.equal(read(path.join(fixture,file)),original);report.adapterGuards++;
 const specFile='src/engine/companionSpec.ts';fs.appendFileSync(path.join(fixture,specFile),'\n');fs.writeFileSync(path.join(fixture,specFile),'/* changed */'+originals.get(specFile));
 assert.throws(()=>integrateCompanionBonds(fixture),/Unreviewed/);assert.equal(read(path.join(fixture,'src/engine/companionBonds.ts')),originals.get('src/engine/companionBonds.ts'));report.adapterGuards++;
 fs.writeFileSync(path.join(fixture,specFile),originals.get(specFile));integrateCompanionBonds(fixture);assert.throws(()=>integrateCompanionBonds(fixture),/already installed/);report.adapterGuards++;
 const overlay=new Map([...bindings.keys()].map(file=>[path.join(ref,file),read(path.join(fixture,file))]));
 const courses=new Map();
 for(const name of ['guard-build','bond-build','companion-world-build']){
  const manifest=JSON.parse(tracked('baseline/'+name+'/acceptance.json')),source=tracked(manifest.source).toString(),packed=tracked('baseline/'+name+'/observations.json.gz'),expected=gunzipSync(packed);
  assert.equal(sha256(source),manifest.sourceSha256);assert.equal(manifest.sourceLockSha256,report.sources['baseline/source-lock.json']);assert.equal(sha256(packed),manifest.gzipSha256);assert.equal(sha256(expected),manifest.sha256);
  courses.set(name,{source,expected,manifest,virtual:path.join(ref,'balance/hwe-'+name+'.ts')});
 }
 const mechanics=JSON.parse(tracked('baseline/bond-mechanics/acceptance.json')),packed=tracked('baseline/bond-mechanics/original.logs.json.gz'),expectedLogs=JSON.parse(gunzipSync(packed));
 assert.equal(sha256(packed),mechanics.logsSha256);assert.equal(mechanics.sourceLockSha256,report.sources['baseline/source-lock.json']);
 for(const course of mechanics.courses){const source=read(path.join(ref,course.source)),name=path.basename(course.source,'.ts');assert.equal(sha256(source),mechanics.sources[course.source]);assert.deepEqual(expectedLogs[name+'-1'],expectedLogs[name+'-2']);
  courses.set(name,{source,expectedLogs:expectedLogs[name+'-1'],manifest:course,virtual:path.join(ref,course.source)});
 }
 courses.set('ownership',{source:tracked('test/companion-bonds-binding-game.ts').toString(),expectedLogs:{stdout:'Companion binding ownership: 9 assertions passed\n',stderr:expectedLogs['probe_companioninheritance-1'].stderr},manifest:{assertions:9},virtual:path.join(ref,'balance/hwe-companion-binding.ts')});
 const config=ts.getParsedCommandLineOfConfigFile(path.join(ref,'tsconfig.sim.json'),{}, {...ts.sys,onUnRecoverableConfigFileDiagnostic:d=>{throw Error(ts.flattenDiagnosticMessageText(d.messageText,'\n'));}});assert(config);
 const paths=Object.fromEntries(Object.entries(pkg.exports).filter(([,entry])=>entry.types).map(([key,entry])=>['@hollow-wake/engine'+(key==='.'?'':key.slice(1)),[path.join(installed,entry.types)]]));
 const typed=new Map([...overlay,...[...courses.values()].map(c=>[c.virtual,c.source])]),options={...config.options,baseUrl:root,paths,typeRoots:[path.join(ref,'node_modules/@types')]},host=ts.createCompilerHost(options),readFile=host.readFile.bind(host),exists=host.fileExists.bind(host);
 host.readFile=p=>typed.get(path.resolve(p))??readFile(p);host.fileExists=p=>typed.has(path.resolve(p))||exists(p);
 const program=ts.createProgram([...new Set([...config.fileNames,...typed.keys()])],options,host),diagnostics=ts.getPreEmitDiagnostics(program);
 assert.equal(diagnostics.length,0,ts.formatDiagnostics(diagnostics,{getCurrentDirectory:()=>ref,getCanonicalFileName:p=>p,getNewLine:()=>'\n'}));report.types=true;
 async function replay(name,label,original=false,fault){
  const course=courses.get(name),entry=path.join(work,label+'.cjs'),output=path.join(work,label+'.json');
  const result=await build({stdin:{contents:course.source,loader:'ts',resolveDir:path.join(ref,'balance')},bundle:true,platform:'node',format:'cjs',logLevel:'silent',metafile:true,outfile:entry,plugins:original?[]:[{name:'installed-companion-bonds',setup(b){
   b.onResolve({filter:/^@hollow-wake\/engine(?:\/|$)/},args=>{const key='.'+args.path.slice('@hollow-wake/engine'.length),entry=pkg.exports[key]?.import;assert(entry);return{path:path.join(installed,entry)};});
   b.onLoad({filter:/(?:companionBonds|companionSpec|minionInheritance|bequests)\.ts$/},args=>{let contents=overlay.get(path.resolve(args.path));if(contents===undefined)return;if(fault?.file===path.basename(args.path)){assert.equal(contents.split(fault.from).length,2);contents=contents.replace(fault.from,fault.to);}return{contents,loader:'ts'};});
   if(fault?.file.endsWith('.js'))b.onLoad({filter:/[\\/]dist[\\/](?:companion-bonds|companion-bond-rules|minion-inheritance|attribute-bequests)\.js$/},args=>{if(path.basename(args.path)!==fault.file)return;const source=read(args.path);assert.equal(source.split(fault.from).length,2);return{contents:source.replace(fault.from,fault.to),loader:'js'};});
  }}]});
  if(!original)for(const name of ['companion-bonds','companion-bond-rules','minion-inheritance','attribute-bequests'])assert(Object.keys(result.metafile.inputs).map(p=>path.resolve(p)).includes(path.join(installed,'dist/'+name+'.js')),'Replay bypassed installed '+name);
  const child=run(label,[entry,output],ref),matched=child.status===0&&(course.expected?fs.readFileSync(output).equals(course.expected):JSON.stringify(logs[label])===JSON.stringify(course.expectedLogs));
  if(fault){assert(!matched,'Fault escaped '+label);if(child.status!==0){assert.equal(child.status,1);assert.match(JSON.stringify(logs[label]),/ERR_ASSERTION|FAIL /);}report.faults.push({name:label,detected:true,logSha256:sha256(JSON.stringify(logs[label]))});}
  else assert(matched,label+' differs from original: '+JSON.stringify(logs[label]).slice(-6000));
 }
 for(const[name,course]of courses){await replay(name,'original-'+name,true);await replay(name,'installed-'+name);report.courses.push({name,observations:course.manifest.observations,groups:course.manifest.groups,assertions:course.manifest.assertions,modes:['original','installed']});}
 const faults=[
  ['unretired-payloads','ownership','companion-bonds.js','this.p.retirePayloads(beast, owned);',''],
  ['missing-caster-scope','ownership','companionBonds.ts','caster===beast&&owned.has(inst)','owned.has(inst)'],
  ['missing-skill-scope','ownership','companionBonds.ts','caster===beast&&owned.has(inst)','caster===beast'],
  ['stale-body-level','probe_companionstance','companion-bonds.js','this.p.relevel(beast, level);','void beast;'],
  ['refilled-armor','probe_companioninheritance','minion-inheritance.js','minion.pliesMax - spent','minion.pliesMax'],
  ['lost-scoped-bequest','probe_companioninheritance','bequests.ts','runtime.sync(recipient,scale,tags,extra)','runtime.sync(recipient,scale,tags)'],
  ['multiplied-recovery-budget','probe_companionrecovery','companion-bond-rules.js','cfg.divideByPack ? Math.max(1, activeBodies) : 1','1'],
 ];
 for(const[name,course,file,from,to]of faults)await replay(course,'fault-'+name,false,{file,from,to});
 await replay('bond-build','restored-build');await replay('ownership','restored-ownership');report.restored=true;report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 try{verifyReference(ref,lock);report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(fs.readFileSync(path.join(root,file)))===hash);report.passed=report.passed&&report.inputsUnchanged;
  const bytes=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(bytes);fs.writeFileSync(path.join(owned,'companion-bonds-game.logs.json.gz'),bytes);
 }catch(error){report.passed=false;report.failure=String(error);process.exitCode=1;}
 finally{assert.equal(path.dirname(fs.realpathSync(work)),fs.realpathSync(owned));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;fs.writeFileSync(path.join(owned,'companion-bonds-game.json'),JSON.stringify(report,null,2)+'\n');}
}
assert(report.passed,report.failure);console.log({passed:true,types:report.types,courses:report.courses,faults:report.faults.length,guards:report.adapterGuards,cleaned:true});
