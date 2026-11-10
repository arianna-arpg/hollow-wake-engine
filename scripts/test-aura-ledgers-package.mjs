import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {gzipSync} from 'node:zlib';import ts from 'typescript';import {build} from 'esbuild';
import {root,sha256} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';
assert.equal(process.argv.length,2);
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const stem='aura-ledgers-package',owned=fs.realpathSync(path.join(root,'.artifacts'));
const read=file=>fs.readFileSync(path.join(root,file)),inputs=['src/aura-ledgers.ts','test/aura-ledgers.test.mjs','test/aura-ledgers-consumer.ts','scripts/test-aura-ledgers-package.mjs','package.json','package-lock.json','tsconfig.json'];
const work=fs.mkdtempSync(path.join(owned,'aura-ledgers-package-owned-')),consumer=path.join(work,'consumer');fs.mkdirSync(consumer);
const report={passed:false,contracts:28,sources:Object.fromEntries(inputs.map(file=>[file,sha256(read(file))])),faults:[]},logs={};
const run=(label,args,cwd=consumer)=>{const c=spawnSync(process.execPath,args,{cwd,windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_PATH:'',NODE_COMPILE_CACHE:path.join(work,'compile-cache'),NPM_CONFIG_CACHE:path.join(work,'npm-cache')}});logs[label]=(c.stdout??'')+'\n'+(c.stderr??'');assert(!c.error&&!c.signal,label+': '+c.error);return c;};
const success=(label,args,cwd)=>assert.equal(run(label,args,cwd).status,0,logs[label]);
const contracts=(label,file='contracts.test.mjs')=>{success(label,['--test',file]);assert(/(?:#|ℹ) pass 28\b/.test(logs[label]));};
try{
 success('pack',[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work],root);
 const archive=path.join(work,JSON.parse(logs.pack)[0].filename);report.archiveSha256=sha256(fs.readFileSync(archive));
 fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));success('install',[npmCli(),'install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund']);
 const runtime=read('src/aura-ledgers.ts').toString(),virtual=path.join(root,'src/aura-ledgers.ts');
 const config=ts.getParsedCommandLineOfConfigFile(path.join(root,'tsconfig.json'),{}, {...ts.sys,onUnRecoverableConfigFileDiagnostic:d=>{throw Error(ts.flattenDiagnosticMessageText(d.messageText,'\n'));}});assert(config);
 const tests=read('test/aura-ledgers.test.mjs').toString().replace("'../dist/aura-ledgers.js'","'@hollow-wake/engine/auras/ledgers'");fs.writeFileSync(path.join(consumer,'contracts.test.mjs'),tests);contracts('installed');
 fs.writeFileSync(path.join(consumer,'entry.mjs'),"export * from '@hollow-wake/engine/auras/ledgers';\n");
 const bundle=await build({entryPoints:[path.join(consumer,'entry.mjs')],bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,metafile:true,write:false});assert(Object.values(bundle.metafile.outputs).every(row=>!row.imports.length));report.browserBytes=bundle.outputFiles[0].contents.length;assert(report.browserBytes<4*1024);
 fs.writeFileSync(path.join(consumer,'browser-built.mjs'),bundle.outputFiles[0].contents);fs.writeFileSync(path.join(consumer,'browser.test.mjs'),tests.replace("'@hollow-wake/engine/auras/ledgers'","'./browser-built.mjs'"));
 fs.writeFileSync(path.join(consumer,'hostile.test.mjs'),"Math.random=()=>{throw Error('ambient RNG')};globalThis.fetch=()=>{throw Error('network')};for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw Error(key)}});await import('./browser.test.mjs');\n");contracts('browser','hostile.test.mjs');
 const typeSource=read('test/aura-ledgers-consumer.ts').toString();fs.writeFileSync(path.join(consumer,'types.ts'),typeSource);success('types',[path.join(root,'node_modules/typescript/bin/tsc'),'--strict','--noEmit','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','types.ts']);report.types=true;
 const relative=path.relative(consumer,path.join(root,'src/aura-ledgers.js')).split(path.sep).join('/');fs.writeFileSync(path.join(consumer,'source-types.ts'),typeSource.replace("'@hollow-wake/engine/auras/ledgers'",JSON.stringify(relative.startsWith('.')?relative:'./'+relative)));success('source-types',[path.join(root,'node_modules/typescript/bin/tsc'),'--strict','--noEmit','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','source-types.ts']);report.sourceTypes=true;
 const module=path.join(consumer,'node_modules/@hollow-wake/engine/dist/aura-ledgers.js'),source=fs.readFileSync(module,'utf8');report.moduleBytes=Buffer.byteLength(source);report.moduleSha256=sha256(source);assert(report.moduleBytes<6*1024);
 const faults=[
  [
    "uncapped-is-zero",
    "if(!spec.cap)return Infinity;",
    "if(!spec.cap)return 0;"
  ],
  [
    "missing-life-cap",
    "(spec.cap.maxLifePct??0)*actor.maxLife()",
    "0"
  ],
  [
    "zero-cap-read-skipped",
    "(spec.cap.maxLifePct??0)*actor.maxLife()",
    "(spec.cap.maxLifePct?spec.cap.maxLifePct*actor.maxLife():0)"
  ],
  [
    "full-ledger-restores-regen",
    "rate-=skim;",
    "rate-=banked/dt;"
  ],
  [
    "regen-map-snapshot",
    "of actor.activeAuras.values()",
    "of [...actor.activeAuras.values()]"
  ],
  [
    "regen-rate-unbounded",
    "rate*Math.min(1,ledger.rate)",
    "rate*ledger.rate"
  ],
  [
    "regen-bank-skipped",
    "aura.ledger.balance+=banked;",
    "void aura.ledger.balance;"
  ],
  [
    "settlement-balance-retained",
    "state.balance=0;",
    "void state.balance;"
  ],
  [
    "half-point-dropped",
    "due<.5||actor.dead",
    "due<=.5||actor.dead"
  ],
  [
    "corpse-charged",
    "due<.5||actor.dead",
    "due<.5"
  ],
  [
    "callback-death-ignored",
    "actor.life<=0&&!actor.dead",
    "actor.life<=0"
  ],
  [
    "overflow-damage-lost",
    "due*vent.perPoint",
    "Math.min(due,this.p.availableMaxMana(actor)-actor.mana)*vent.perPoint"
  ],
  [
    "upkeep-equality-closes",
    "actor.mana<bill",
    "actor.mana<=bill"
  ],
  [
    "upkeep-map-snapshot",
    "of actor.activeAuras)",
    "of [...actor.activeAuras])"
  ],
  [
    "vent-threshold-inclusive",
    "actor.mana<ledger.ventBelowMana",
    "actor.mana<=ledger.ventBelowMana"
  ],
  [
    "upkeep-not-debited",
    "actor.mana-=bill;",
    "void actor.mana;"
  ]
];assert.equal(faults.length,16);
 for(const[name,from,to]of faults){assert.equal(runtime.split(from).length,2,name+' selector');const fault=ts.transpileModule(runtime.replace(from,to),{compilerOptions:{...config.options,module:ts.ModuleKind.ESNext},fileName:virtual}).outputText;fs.writeFileSync(module,fault);try{assert.equal(run(name,['--test','contracts.test.mjs']).status,1,name+' escaped');assert.match(logs[name],/ERR_ASSERTION/);report.faults.push({name,detected:true,logSha256:sha256(logs[name])});}finally{fs.writeFileSync(module,source);}}
 contracts('restored');report.restored=true;report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(read(file))===hash);report.passed=report.passed&&report.inputsUnchanged;
 assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;const data=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(data);fs.writeFileSync(path.join(owned,stem+'.logs.json.gz'),data);fs.writeFileSync(path.join(owned,stem+'.json'),JSON.stringify(report,null,2)+'\n');
}
assert(report.passed,report.failure??'Inputs changed');
console.log({passed:report.passed,contracts:report.contracts,types:report.types,sourceTypes:report.sourceTypes,browserBytes:report.browserBytes,moduleBytes:report.moduleBytes,faults:report.faults.length,restored:report.restored,cleaned:true,failure:report.failure});
