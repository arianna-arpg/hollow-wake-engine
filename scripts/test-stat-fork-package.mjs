import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';import {build} from 'esbuild';
import {root,sha256} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';
const owned=path.join(root,'.artifacts');fs.mkdirSync(owned,{recursive:true});
const work=fs.mkdtempSync(path.join(owned,'stat-fork-package-owned-')),consumer=path.join(work,'consumer');fs.mkdirSync(consumer);
const report={passed:false,contracts:21,faults:[],sources:{}},logs={};
for(const file of ['src/stats.ts','src/stat-rules.ts','src/tag-context-cache.ts','src/validation.ts','test/stat-fork.test.mjs','scripts/test-stat-fork-package.mjs',
 'baseline/build-context/acceptance.json','baseline/build-context/observations.json.gz','content/milestone-one.json','package.json','package-lock.json'])report.sources[file]=sha256(fs.readFileSync(path.join(root,file)));
const run=(label,args,cwd=consumer)=>{const c=spawnSync(process.execPath,args,{cwd,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:4*1024*1024,
 env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_PATH:'',NODE_COMPILE_CACHE:path.join(work,'compile-cache')}});
 logs[label]=(c.stdout??'')+'\n'+(c.stderr??'');assert(!c.error&&!c.signal,label+': '+c.error);return c;};
const success=(label,args,cwd)=>assert.equal(run(label,args,cwd).status,0,logs[label]);
const contracts=(label,file='test/stat-fork.test.mjs')=>{success(label,['--test',file]);assert(new RegExp('(?:#|ℹ) pass '+report.contracts+'\\b').test(logs[label]));};
try{
 success('pack',[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work,'--cache',path.join(work,'npm-cache')],root);
 const archive=path.join(work,JSON.parse(logs.pack)[0].filename);report.archiveSha256=sha256(fs.readFileSync(archive));
 fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
 success('install',[npmCli(),'install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(work,'npm-cache')]);
 for(const file of ['baseline/build-context/observations.json.gz','content/milestone-one.json']){const to=path.join(consumer,file);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(root,file),to);}
 fs.mkdirSync(path.join(consumer,'test'));const test=fs.readFileSync(path.join(root,'test/stat-fork.test.mjs'),'utf8').replace("'../dist/index.js'","'@hollow-wake/engine'");
 fs.writeFileSync(path.join(consumer,'test/stat-fork.test.mjs'),test);contracts('installed');
 fs.writeFileSync(path.join(consumer,'entry.mjs'),"export {StatSheet,StatRules} from '@hollow-wake/engine';\n");
 const bundle=await build({entryPoints:[path.join(consumer,'entry.mjs')],bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,metafile:true,write:false});
 assert(Object.values(bundle.metafile.outputs).every(output=>!output.imports.length));report.browserBytes=bundle.outputFiles[0].contents.length;assert(report.browserBytes<16*1024);
 fs.writeFileSync(path.join(consumer,'browser-built.mjs'),bundle.outputFiles[0].contents);
 fs.writeFileSync(path.join(consumer,'test/browser-contracts.mjs'),test.replace("'@hollow-wake/engine'","'../browser-built.mjs'"));
 fs.writeFileSync(path.join(consumer,'hostile.test.mjs'),"Math.random=()=>{throw Error('ambient RNG')};globalThis.fetch=()=>{throw Error('network')};for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw Error(key)}});await import('./test/browser-contracts.mjs');");contracts('browser','hostile.test.mjs');
 fs.writeFileSync(path.join(consumer,'types.ts'),"import {StatSheet,StatRules} from '@hollow-wake/engine';const live=new StatSheet(new StatRules({life:{base:100}}),2,1);const candidate:StatSheet=live.fork();candidate.setBase('life',50);const revision:number=candidate.revision;void revision;");
 success('types',[path.join(root,'node_modules/typescript/bin/tsc'),'--strict','--noEmit','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','types.ts']);report.types=true;
 const module=path.join(consumer,'node_modules/@hollow-wake/engine/dist/stats.js'),source=fs.readFileSync(module,'utf8');report.moduleBytes=Buffer.byteLength(source);assert(report.moduleBytes<20*1024);
 const faults=[
  ['no-sources','fork.sources = new Map(this.sources);',''],['no-bases','fork.baseOverrides = new Map(this.baseOverrides);',''],
  ['no-conditions','fork.conditions = new Set(this.conditions);',''],['no-gauges','fork.gauges = new Map(this.gauges);',''],
  ['no-condition-key','fork.conditionKey = this.conditionKey;',''],['no-gauge-key','fork.gaugeKey = this.gaugeKey;',''],
  ['no-revision','fork.generation = this.generation;',''],['shared-warm-cache','fork.generation = this.generation;','fork.generation = this.generation; fork.cache = this.cache;'],
  ['shared-source-map','fork.sources = new Map(this.sources);','fork.sources = this.sources;'],['shared-base-map','fork.baseOverrides = new Map(this.baseOverrides);','fork.baseOverrides = this.baseOverrides;'],
  ['lost-value-bound','new StatSheet(this.rules, this.maxCacheEntries, this.maxContextCacheEntries)','new StatSheet(this.rules, 256, this.maxContextCacheEntries)'],
  ['lost-context-bound','new StatSheet(this.rules, this.maxCacheEntries, this.maxContextCacheEntries)','new StatSheet(this.rules, this.maxCacheEntries, 16)'],
  ['return-source','return fork;','return this;'],
 ];
 for(const[name,from,to]of faults){assert.equal(source.split(from).length,2,name+' selector');fs.writeFileSync(module,source.replace(from,to));
  try{assert.equal(run('fault-'+name,['--test','test/stat-fork.test.mjs']).status,1,name+' escaped');assert.match(logs['fault-'+name],/ERR_ASSERTION/);report.faults.push({name,detected:true,logSha256:sha256(logs['fault-'+name])});}
  finally{fs.writeFileSync(module,source);}
 }
 contracts('restored');report.restored=true;report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 try{report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(fs.readFileSync(path.join(root,file)))===hash);report.passed=report.passed&&report.inputsUnchanged;
  const bytes=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(bytes);fs.writeFileSync(path.join(owned,'stat-fork-package.logs.json.gz'),bytes);
 }finally{assert.equal(path.dirname(fs.realpathSync(work)),fs.realpathSync(owned));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;fs.writeFileSync(path.join(owned,'stat-fork-package.json'),JSON.stringify(report,null,2)+'\n');}
}
assert(report.passed,report.failure);console.log({passed:true,contracts:report.contracts,faults:report.faults.length,browserBytes:report.browserBytes,moduleBytes:report.moduleBytes,cleaned:true});
