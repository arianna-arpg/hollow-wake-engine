import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import ts from 'typescript';
import {build} from 'esbuild';
import {root,sha256} from '../scripts/reference-utils.mjs';
import {npmCli} from '../scripts/npm-cli.mjs';
import {bodyFactoryContracts} from './body-factory-contracts.mjs';
const attempt=process.argv[2];assert(/^r\d+$/.test(attempt));
const owned=fs.realpathSync(path.join(root,'.artifacts')),stem='body-factory-candidate-package-'+attempt,read=file=>fs.readFileSync(path.join(root,file));
assert(!fs.existsSync(path.join(owned,stem+'.json')));
const reviewFile='.artifacts/body-factory-candidate-review.json',review=JSON.parse(read(reviewFile));assert(review.passed&&review.candidateOnly&&!review.promoted);
for(const[file,hash]of Object.entries(review.sources))assert.equal(sha256(read(file)),hash,file);
const inputs=[reviewFile,'.artifacts/check-body-factory-candidate-package.mjs','.artifacts/body-factory-package-consumer.ts','.artifacts/body-factory-candidate-package-r1-correction.json','package.json','package-lock.json','tsconfig.json',...Object.keys(review.sources)],sources=Object.fromEntries(inputs.map(file=>[file,sha256(read(file))]));
// Snapshot the qualified summon archive. Do not rebuild or repack this checkout
// while the full reference verification still owns its build outputs.
const baseBytes=read('.artifacts/hollow-wake-engine-0.59.0-candidate.0.tgz'),baseHash='aadc91a371d3b37dae01d95bf6d8830823b825580b85e4fccf3febc20e8a4b5c';assert.equal(sha256(baseBytes),baseHash);
const work=fs.mkdtempSync(path.join(owned,'body-factory-candidate-package-owned-')),seed=path.join(work,'seed'),consumer=path.join(work,'consumer');
const report={passed:false,candidateOnly:true,promoted:false,sources,baseArchiveSha256:baseHash,faults:[],rootBuildOutputsTouched:false},logs={};
const run=(label,args,cwd=consumer)=>{const c=spawnSync(process.execPath,args,{cwd,windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_PATH:'',NODE_COMPILE_CACHE:path.join(work,'compile-cache'),NPM_CONFIG_CACHE:path.join(work,'npm-cache')}});logs[label]={stdout:c.stdout??'',stderr:c.stderr??''};assert(!c.error&&!c.signal,label+': '+c.error);return c;};
const success=(label,args,cwd)=>{const c=run(label,args,cwd);assert.equal(c.status,0,label+': '+JSON.stringify(logs[label]).slice(-7000));return c;};
const entry='@hollow-wake/engine/bodies/factory',source=read('.artifacts/body-factory.ts').toString();
try{
 fs.mkdirSync(seed);fs.mkdirSync(consumer);const base=path.join(work,'base.tgz');fs.writeFileSync(base,baseBytes);
 fs.writeFileSync(path.join(seed,'package.json'),JSON.stringify({private:true,type:'module'}));success('install-base',[npmCli(),'install',base,'--offline','--ignore-scripts','--no-audit','--no-fund'],seed);
 const packageRoot=path.join(seed,'node_modules/@hollow-wake/engine');
 const config=ts.getParsedCommandLineOfConfigFile(path.join(root,'tsconfig.json'),{}, {...ts.sys,onUnRecoverableConfigFileDiagnostic:d=>{throw Error(ts.flattenDiagnosticMessageText(d.messageText,'\n'));}});assert(config);
 const virtual=path.join(root,'src/body-factory.ts'),host=ts.createCompilerHost(config.options),originalRead=host.readFile.bind(host),originalExists=host.fileExists.bind(host),emitted=new Map();
 host.readFile=file=>path.resolve(file)===virtual?source:originalRead(file);host.fileExists=file=>path.resolve(file)===virtual||originalExists(file);
 host.writeFile=(file,text)=>{assert.equal(path.dirname(path.resolve(file)),path.join(root,'dist'));assert(!emitted.has(path.basename(file)));emitted.set(path.basename(file),text);};
 const program=ts.createProgram([virtual],config.options,host),ds=ts.getPreEmitDiagnostics(program);assert.equal(ds.length,0,ts.formatDiagnostics(ds,{getCurrentDirectory:()=>root,getCanonicalFileName:p=>p,getNewLine:()=>'\n'}));assert(!program.emit().emitSkipped);assert.equal(emitted.size,3);
 const sourceConsumer=ts.createProgram([path.join(owned,'body-factory.ts'),path.join(owned,'body-factory-package-consumer.ts')],{...config.options,rootDir:owned,noEmit:true,noUncheckedIndexedAccess:true}),sourceErrors=ts.getPreEmitDiagnostics(sourceConsumer);assert.equal(sourceErrors.length,0,ts.formatDiagnostics(sourceErrors,{getCurrentDirectory:()=>root,getCanonicalFileName:p=>p,getNewLine:()=>'\n'}));report.sourceTypes=true;
 for(const[name,text]of emitted)fs.writeFileSync(path.join(packageRoot,'dist',name),text,{flag:'wx'});
 const manifest=path.join(packageRoot,'package.json'),pkg=JSON.parse(fs.readFileSync(manifest));assert(!pkg.exports['./bodies/factory']);pkg.exports['./bodies/factory']={types:'./dist/body-factory.d.ts',import:'./dist/body-factory.js'};fs.writeFileSync(manifest,JSON.stringify(pkg,null,2)+'\n');
 const archiveDir=path.join(work,'candidate');fs.mkdirSync(archiveDir);success('pack-candidate',[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',archiveDir],packageRoot);const archive=path.join(archiveDir,JSON.parse(logs['pack-candidate'].stdout)[0].filename),packed=fs.readFileSync(archive);report.archiveSha256=sha256(packed);
 fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));success('install-candidate',[npmCli(),'install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund']);
 fs.writeFileSync(path.join(consumer,'contracts.mjs'),read('.artifacts/body-factory-contracts.mjs'));
 fs.writeFileSync(path.join(consumer,'consumer.mjs'),"import * as api from '"+entry+"';\nimport {bodyFactoryContracts} from './contracts.mjs';\nconsole.log(JSON.stringify(bodyFactoryContracts(api)));\n");
 const accepted=JSON.parse(success('installed',['consumer.mjs']).stdout);assert.equal(accepted.contracts,27);report.contracts=accepted.contracts;
 const module=path.join(consumer,'node_modules/@hollow-wake/engine/dist/body-factory.js'),moduleBytes=fs.readFileSync(module),types=fs.readFileSync(module.replace(/\.js$/,'.d.ts'));
 assert(moduleBytes.equals(Buffer.from(emitted.get('body-factory.js'))));assert.equal(sha256(types),JSON.parse(read('.artifacts/body-factory-types-r2.json')).declarationSha256);
 report.moduleBytes=moduleBytes.length;report.moduleSha256=sha256(moduleBytes);report.typesSha256=sha256(types);
 fs.writeFileSync(path.join(consumer,'entry.mjs'),"export * from '"+entry+"';\n");
 const bundle=await build({entryPoints:[path.join(consumer,'entry.mjs')],bundle:true,platform:'browser',format:'iife',globalName:'BodyFactoryApi',target:'es2022',minify:true,metafile:true,write:false,logLevel:'silent'});assert.equal(bundle.outputFiles.length,1);assert(Object.values(bundle.metafile.outputs).every(row=>!row.imports.length));report.browserBytes=bundle.outputFiles[0].contents.length;
 const context=vm.createContext({});new vm.Script("for(const name of ['window','document','process','require','fetch','setTimeout','setInterval'])Object.defineProperty(globalThis,name,{get(){throw Error('Forbidden host global: '+name)}});Math.random=()=>{throw Error('Forbidden ambient RNG')};Date.now=()=>{throw Error('Forbidden ambient clock')};").runInContext(context);new vm.Script(bundle.outputFiles[0].text).runInContext(context);assert.deepEqual(bodyFactoryContracts(context.BodyFactoryApi),accepted);report.hostileBrowser=true;
 const typeText=read('.artifacts/body-factory-package-consumer.ts').toString(),local="'./body-factory.js'";assert.equal(typeText.split(local).length,2);fs.writeFileSync(path.join(consumer,'consumer.ts'),typeText.replace(local,"'"+entry+"'"));report.negativeTypeCases=(typeText.match(/@ts-expect-error/g)??[]).length;assert.equal(report.negativeTypeCases,11);
 fs.writeFileSync(path.join(consumer,'tsconfig.json'),JSON.stringify({compilerOptions:{strict:true,noUncheckedIndexedAccess:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',types:[],lib:['ES2022']},files:['consumer.ts']}));success('types',[path.join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.json']);report.types=true;
 const helper=ts.createSourceFile('faults.mjs',read('.artifacts/qualify-body-factory-contracts.mjs').toString(),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),arrays=[];function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(helper)==='faults'&&n.initializer&&ts.isArrayLiteralExpression(n.initializer))arrays.push(n.initializer);ts.forEachChild(n,visit);}visit(helper);assert.equal(arrays.length,1);
 const faults=arrays[0].elements.map(row=>{assert(ts.isObjectLiteralExpression(row));return Object.fromEntries(row.properties.map(p=>{assert(ts.isPropertyAssignment(p)&&ts.isStringLiteral(p.initializer));return[p.name.getText(helper),p.initializer.text];}));});assert.equal(faults.length,27);
 for(const fault of faults){assert.equal(source.split(fault.from).length,2,fault.name+' selector');fs.writeFileSync(module,ts.transpileModule(source.replace(fault.from,fault.to),{compilerOptions:{...config.options,module:ts.ModuleKind.ESNext},fileName:'body-factory.ts'}).outputText);
  try{assert.equal(run(fault.name,['consumer.mjs']).status,1,fault.name+' escaped');assert.match(logs[fault.name].stderr,/ERR_ASSERTION/);report.faults.push({name:fault.name,detected:true,logSha256:sha256(JSON.stringify(logs[fault.name]))});}finally{fs.writeFileSync(module,moduleBytes);}}
 assert.deepEqual(JSON.parse(success('restored',['consumer.mjs']).stdout),accepted);assert(fs.readFileSync(module).equals(moduleBytes));report.restored=true;
 // Retain this single small archive for installed-game qualification. It is
 // private evidence, not a package registry or production publication.
 const retained='body-factory-candidate-'+attempt+'.tgz';fs.writeFileSync(path.join(owned,retained),packed,{flag:'wx'});report.retainedArchive={file:'.artifacts/'+retained,bytes:packed.length,sha256:report.archiveSha256};report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 report.inputsUnchanged=Object.entries(sources).every(([file,hash])=>sha256(read(file))===hash);report.passed=report.passed&&report.inputsUnchanged;
 assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;
 const packed=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(packed);fs.writeFileSync(path.join(owned,stem+'.logs.json.gz'),packed,{flag:'wx'});fs.writeFileSync(path.join(owned,stem+'.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
}
assert(report.passed,report.failure??'Inputs changed');console.log({passed:true,candidateOnly:true,contracts:report.contracts,faults:report.faults.length,types:report.types,negativeTypeCases:report.negativeTypeCases,moduleBytes:report.moduleBytes,browserBytes:report.browserBytes,retainedArchive:report.retainedArchive,cleaned:true});
