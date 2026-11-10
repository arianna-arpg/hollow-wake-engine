import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {gzipSync} from 'node:zlib';import ts from 'typescript';import {build} from 'esbuild';
import {root,sha256} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';
assert.equal(process.argv.length,2);
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const stem='aura-retirement-package',owned=fs.realpathSync(path.join(root,'.artifacts'));
const read=file=>fs.readFileSync(path.join(root,file)),inputs=['src/aura-retirement.ts','test/aura-retirement.test.mjs','test/aura-retirement-consumer.ts','scripts/test-aura-retirement-package.mjs','package.json','package-lock.json','tsconfig.json'];
const work=fs.mkdtempSync(path.join(owned,'aura-retirement-package-owned-')),consumer=path.join(work,'consumer');fs.mkdirSync(consumer);
const report={passed:false,contracts:20,sources:Object.fromEntries(inputs.map(file=>[file,sha256(read(file))])),faults:[]},logs={};
const run=(label,args,cwd=consumer)=>{const c=spawnSync(process.execPath,args,{cwd,windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_PATH:'',NODE_COMPILE_CACHE:path.join(work,'compile-cache'),NPM_CONFIG_CACHE:path.join(work,'npm-cache')}});logs[label]=(c.stdout??'')+'\n'+(c.stderr??'');assert(!c.error&&!c.signal,label+': '+c.error);return c;};
const success=(label,args,cwd)=>assert.equal(run(label,args,cwd).status,0,logs[label]);
const contracts=(label,file='contracts.test.mjs')=>{success(label,['--test',file]);assert(/(?:#|ℹ) pass 20\b/.test(logs[label]));};
try{
 success('pack',[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work],root);
 const archive=path.join(work,JSON.parse(logs.pack)[0].filename);report.archiveSha256=sha256(fs.readFileSync(archive));
 fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));success('install',[npmCli(),'install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund']);
 const runtime=read('src/aura-retirement.ts').toString(),virtual=path.join(root,'src/aura-retirement.ts');
 const config=ts.getParsedCommandLineOfConfigFile(path.join(root,'tsconfig.json'),{}, {...ts.sys,onUnRecoverableConfigFileDiagnostic:d=>{throw Error(ts.flattenDiagnosticMessageText(d.messageText,'\n'));}});assert(config);
 const tests=read('test/aura-retirement.test.mjs').toString().replace("'../dist/aura-retirement.js'","'@hollow-wake/engine/auras/retirement'");fs.writeFileSync(path.join(consumer,'contracts.test.mjs'),tests);contracts('installed');
 fs.writeFileSync(path.join(consumer,'entry.mjs'),"export * from '@hollow-wake/engine/auras/retirement';\n");
 const bundle=await build({entryPoints:[path.join(consumer,'entry.mjs')],bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,metafile:true,write:false});assert(Object.values(bundle.metafile.outputs).every(row=>!row.imports.length));report.browserBytes=bundle.outputFiles[0].contents.length;assert(report.browserBytes<4*1024);
 fs.writeFileSync(path.join(consumer,'browser-built.mjs'),bundle.outputFiles[0].contents);fs.writeFileSync(path.join(consumer,'browser.test.mjs'),tests.replace("'@hollow-wake/engine/auras/retirement'","'./browser-built.mjs'"));
 fs.writeFileSync(path.join(consumer,'hostile.test.mjs'),"Math.random=()=>{throw Error('ambient RNG')};globalThis.fetch=()=>{throw Error('network')};for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw Error(key)}});await import('./browser.test.mjs');\n");contracts('browser','hostile.test.mjs');
 const typeSource=read('test/aura-retirement-consumer.ts').toString();fs.writeFileSync(path.join(consumer,'types.ts'),typeSource);success('types',[path.join(root,'node_modules/typescript/bin/tsc'),'--strict','--noEmit','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','types.ts']);report.types=true;
 const relative=path.relative(consumer,path.join(root,'src/aura-retirement.js')).split(path.sep).join('/');fs.writeFileSync(path.join(consumer,'source-types.ts'),typeSource.replace("'@hollow-wake/engine/auras/retirement'",JSON.stringify(relative.startsWith('.')?relative:'./'+relative)));success('source-types',[path.join(root,'node_modules/typescript/bin/tsc'),'--strict','--noEmit','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','source-types.ts']);report.sourceTypes=true;
 const module=path.join(consumer,'node_modules/@hollow-wake/engine/dist/aura-retirement.js'),source=fs.readFileSync(module,'utf8');report.moduleBytes=Buffer.byteLength(source);report.moduleSha256=sha256(source);assert(report.moduleBytes<6*1024);
 const faults=[
  ['bash-skipped','this.p.bash(bearer,inst,bash,pool);','void bearer;'],
  ['affected-source-skipped','if(aura.affected.has(actor.id))this.p.removeSource(actor,sourceName);','void actor;'],
  ['mana-release-skipped','bearer.reservedMana=Math.max(0,bearer.reservedMana-aura.reserved);','void bearer.reservedMana;'],
  ['stacked-seal-unlocked','if(!otherSeal)bearer.lifeSealAt=undefined;','bearer.lifeSealAt=undefined;'],
  ['stale-time','held=this.p.time()-(aura.since??this.p.time())','held=0'],
  ['stale-wounds','missing=1-bearer.life/Math.max(1,this.p.maxLife(bearer))','missing=0'],
  ['payload-skipped','this.p.payload(bearer,inst,mult);','void inst;'],
  ['quiet-ledger-skipped','if(delivery.ledger&&aura.ledger&&!bearer.dead)','if(!quietTreeRelease&&delivery.ledger&&aura.ledger&&!bearer.dead)'],
  ['dead-ledger-settled','if(delivery.ledger&&aura.ledger&&!bearer.dead)','if(delivery.ledger&&aura.ledger)'],
  ['foreign-debt-freed','if(debt&&debt.inst.def.id===skillId){','if(debt){'],
  ['stale-delivery','\n  const delivery=aura.inst.def.delivery;','\n  const delivery=this.p.skill(skillId)?.delivery??aura.inst.def.delivery;'],
  ['early-map-delete','if(!aura)return;','if(!aura)return;bearer.activeAuras.delete(skillId);'],
  ['replacement-row-retained','bearer.activeAuras.delete(skillId);','if(bearer.activeAuras.get(skillId)===aura)bearer.activeAuras.delete(skillId);'],
 ];assert.equal(faults.length,13);
 for(const[name,from,to]of faults){assert.equal(runtime.split(from).length,2,name+' selector');const fault=ts.transpileModule(runtime.replace(from,to),{compilerOptions:{...config.options,module:ts.ModuleKind.ESNext},fileName:virtual}).outputText;fs.writeFileSync(module,fault);try{assert.equal(run(name,['--test','contracts.test.mjs']).status,1,name+' escaped');assert.match(logs[name],/ERR_ASSERTION/);report.faults.push({name,detected:true,logSha256:sha256(logs[name])});}finally{fs.writeFileSync(module,source);}}
 contracts('restored');report.restored=true;report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(read(file))===hash);report.passed=report.passed&&report.inputsUnchanged;
 assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;const data=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(data);fs.writeFileSync(path.join(owned,stem+'.logs.json.gz'),data);fs.writeFileSync(path.join(owned,stem+'.json'),JSON.stringify(report,null,2)+'\n');
}
assert(report.passed,report.failure??'Inputs changed');
console.log({passed:report.passed,contracts:report.contracts,types:report.types,sourceTypes:report.sourceTypes,browserBytes:report.browserBytes,moduleBytes:report.moduleBytes,faults:report.faults.length,restored:report.restored,cleaned:true,failure:report.failure});
