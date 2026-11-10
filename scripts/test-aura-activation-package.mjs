import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {gzipSync} from 'node:zlib';import ts from 'typescript';import {build} from 'esbuild';
import {root,sha256} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';
assert.equal(process.argv.length,2);
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const stem='aura-activation-package',owned=fs.realpathSync(path.join(root,'.artifacts'));
const read=file=>fs.readFileSync(path.join(root,file)),inputs=['src/aura-activation.ts','test/aura-activation.test.mjs','test/aura-activation-consumer.ts','scripts/test-aura-activation-package.mjs','package.json','package-lock.json','tsconfig.json'];
const work=fs.mkdtempSync(path.join(owned,'aura-activation-package-owned-')),consumer=path.join(work,'consumer');fs.mkdirSync(consumer);
const report={passed:false,contracts:38,sources:Object.fromEntries(inputs.map(file=>[file,sha256(read(file))])),faults:[]},logs={};
const run=(label,args,cwd=consumer)=>{const c=spawnSync(process.execPath,args,{cwd,windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_PATH:'',NODE_COMPILE_CACHE:path.join(work,'compile-cache'),NPM_CONFIG_CACHE:path.join(work,'npm-cache')}});logs[label]=(c.stdout??'')+'\n'+(c.stderr??'');assert(!c.error&&!c.signal,label+': '+c.error);return c;};
const success=(label,args,cwd)=>assert.equal(run(label,args,cwd).status,0,logs[label]);
const contracts=(label,file='contracts.test.mjs')=>{success(label,['--test',file]);assert(/(?:#|ℹ) pass 38\b/.test(logs[label]));};
try{
 success('pack',[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work],root);
 const archive=path.join(work,JSON.parse(logs.pack)[0].filename);report.archiveSha256=sha256(fs.readFileSync(archive));
 fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));success('install',[npmCli(),'install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund']);
 const runtime=read('src/aura-activation.ts').toString(),virtual=path.join(root,'src/aura-activation.ts');
 const config=ts.getParsedCommandLineOfConfigFile(path.join(root,'tsconfig.json'),{}, {...ts.sys,onUnRecoverableConfigFileDiagnostic:d=>{throw Error(ts.flattenDiagnosticMessageText(d.messageText,'\n'));}});assert(config);
 const tests=read('test/aura-activation.test.mjs').toString().replace("'../dist/aura-activation.js'","'@hollow-wake/engine/auras/activation'");fs.writeFileSync(path.join(consumer,'contracts.test.mjs'),tests);contracts('installed');
 fs.writeFileSync(path.join(consumer,'entry.mjs'),"export * from '@hollow-wake/engine/auras/activation';\n");
 const bundle=await build({entryPoints:[path.join(consumer,'entry.mjs')],bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,metafile:true,write:false});assert(Object.values(bundle.metafile.outputs).every(row=>!row.imports.length));report.browserBytes=bundle.outputFiles[0].contents.length;assert(report.browserBytes<4*1024);
 fs.writeFileSync(path.join(consumer,'browser-built.mjs'),bundle.outputFiles[0].contents);fs.writeFileSync(path.join(consumer,'browser.test.mjs'),tests.replace("'@hollow-wake/engine/auras/activation'","'./browser-built.mjs'"));
 fs.writeFileSync(path.join(consumer,'hostile.test.mjs'),"Math.random=()=>{throw Error('ambient RNG')};globalThis.fetch=()=>{throw Error('network')};for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw Error(key)}});await import('./browser.test.mjs');\n");contracts('browser','hostile.test.mjs');
 const typeSource=read('test/aura-activation-consumer.ts').toString();fs.writeFileSync(path.join(consumer,'types.ts'),typeSource);success('types',[path.join(root,'node_modules/typescript/bin/tsc'),'--strict','--noEmit','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','types.ts']);report.types=true;
 const relative=path.relative(consumer,path.join(root,'src/aura-activation.js')).split(path.sep).join('/');fs.writeFileSync(path.join(consumer,'source-types.ts'),typeSource.replace("'@hollow-wake/engine/auras/activation'",JSON.stringify(relative.startsWith('.')?relative:'./'+relative)));success('source-types',[path.join(root,'node_modules/typescript/bin/tsc'),'--strict','--noEmit','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','source-types.ts']);report.sourceTypes=true;
 const module=path.join(consumer,'node_modules/@hollow-wake/engine/dist/aura-activation.js'),source=fs.readFileSync(module,'utf8');report.moduleBytes=Buffer.byteLength(source);report.moduleSha256=sha256(source);assert(report.moduleBytes<6*1024);
 const faults=[
  [
    "existing-row-refreshed",
    "if(actor.activeAuras.has(inst.def.id))return;",
    "if(false)return;"
  ],
  [
    "duplicate-lane-admitted",
    "if(delivery.overdrive&&actor.overdrive[delivery.overdrive.lane])",
    "if(false)"
  ],
  [
    "mana-equality-refused",
    "actor.reservedMana+reserved>this.p.maxMana(actor)",
    "actor.reservedMana+reserved>=this.p.maxMana(actor)"
  ],
  [
    "life-equality-refused",
    "actor.reservedLife+reserved>this.p.maxLife(actor)*.9",
    "actor.reservedLife+reserved>=this.p.maxLife(actor)*.9"
  ],
  [
    "price-lost",
    "delivery.upkeep.reserveMana*this.p.stat(actor,'manaCost',context)",
    "delivery.upkeep.reserveMana"
  ],
  [
    "mana-clamp-lost",
    "actor.mana=Math.min(actor.mana,this.p.availableMaxMana(actor));",
    "void actor.mana;"
  ],
  [
    "life-clamp-lost",
    "actor.life=Math.min(actor.life,this.p.lifeCeiling(actor));",
    "void actor.life;"
  ],
  [
    "duration-life-precedence-lost",
    "bloodPact=!asDuration&&this.p.reserveLife(inst)",
    "bloodPact=this.p.reserveLife(inst)"
  ],
  [
    "cap-rounded-down",
    "Math.round(this.p.stat(actor,'durationAuraCap',context))",
    "Math.floor(this.p.stat(actor,'durationAuraCap',context))"
  ],
  [
    "newest-evicted",
    "burning[i]![0]",
    "burning[burning.length-1-i]![0]"
  ],
  [
    "infinite-rows-counted",
    "Number.isFinite(row.remaining)",
    "row.remaining!==undefined"
  ],
  [
    "snapshot-cap-requeried",
    "burning.length-i>=cap",
    "burning.length-i>=this.p.stat(actor,'durationAuraCap',context)"
  ],
  [
    "ally-definition-mutated",
    "allyMods=[...(allyMods??[])];",
    "allyMods=allyMods??[];"
  ],
  [
    "delay-sign-lost",
    "this.p.modifier('esRechargeDelay',-delay)",
    "this.p.modifier('esRechargeDelay',delay)"
  ],
  [
    "radius-scale-lost",
    "radius:delivery.aura.radius*aoeScale",
    "radius:delivery.aura.radius"
  ],
  [
    "shape-query-skipped",
    "shape:this.p.stat(actor,'aoeShape',context)",
    "shape:0"
  ],
  [
    "native-duration-default-changed",
    "(delivery.duration??5)",
    "(delivery.duration??6)"
  ],
  [
    "zero-duration-lost",
    "(delivery.duration??5)",
    "(delivery.duration||5)"
  ],
  [
    "borrowed-spec-cloned",
    "inst,spec:delivery.aura,",
    "inst,spec:{...delivery.aura},"
  ],
  [
    "life-lane-lost",
    "lifeLane:bloodPact||undefined",
    "lifeLane:undefined"
  ],
  [
    "pulse-start-changed",
    "reserved,pulseTimer:0",
    "reserved,pulseTimer:1"
  ],
  [
    "affected-set-reused",
    "affected:new Set(),",
    "affected:actor.activeAuras.values().next().value?.affected??new Set(),"
  ],
  [
    "time-stale",
    "since:this.p.time()",
    "since:0"
  ],
  [
    "ledger-not-opened",
    "ledger:delivery.ledger?{balance:0}:undefined",
    "ledger:undefined"
  ],
  [
    "seal-raised",
    "Math.min(actor.lifeSealAt??Infinity,actor.life)",
    "Math.max(actor.lifeSealAt??Infinity,actor.life)"
  ],
  [
    "self-source-skipped",
    "this.p.setSource(actor,'auraself:'+inst.def.id,delivery.aura.selfMods)",
    "void delivery.aura.selfMods"
  ],
  [
    "shell-strength-lost",
    "max=s.max*strength",
    "max=s.max"
  ],
  [
    "shell-zero-arc-lost",
    "arcDeg:s.arcDeg??180",
    "arcDeg:s.arcDeg||180"
  ],
  [
    "shell-zero-delay-lost",
    "regenDelay:s.regenDelay??3",
    "regenDelay:s.regenDelay||3"
  ],
  [
    "shell-zero-rate-lost",
    "regenRate:s.regenRate??max/5",
    "regenRate:s.regenRate||max/5"
  ],
  [
    "shell-default-rate-unscaled",
    "regenRate:s.regenRate??max/5",
    "regenRate:s.regenRate??s.max/5"
  ]
];assert.equal(faults.length,31);
 const start=runtime.indexOf('actor.activeAuras.set(inst.def.id,{'),end=runtime.indexOf('\n  });',start);assert(start>=0&&end>start);const call=runtime.slice(start,end+6),object=call.slice(call.indexOf('{'),-2);assert(object.endsWith('}'));faults.push(['map-key-read-after-row',call,'const row='+object+';actor.activeAuras.set(inst.def.id,row);']);assert.equal(faults.length,32);
 for(const[name,from,to]of faults){assert.equal(runtime.split(from).length,2,name+' selector');const fault=ts.transpileModule(runtime.replace(from,to),{compilerOptions:{...config.options,module:ts.ModuleKind.ESNext},fileName:virtual}).outputText;fs.writeFileSync(module,fault);try{assert.equal(run(name,['--test','contracts.test.mjs']).status,1,name+' escaped');assert.match(logs[name],/ERR_ASSERTION/);report.faults.push({name,detected:true,logSha256:sha256(logs[name])});}finally{fs.writeFileSync(module,source);}}
 contracts('restored');report.restored=true;report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(read(file))===hash);report.passed=report.passed&&report.inputsUnchanged;
 assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;const data=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(data);fs.writeFileSync(path.join(owned,stem+'.logs.json.gz'),data);fs.writeFileSync(path.join(owned,stem+'.json'),JSON.stringify(report,null,2)+'\n');
}
assert(report.passed,report.failure??'Inputs changed');
console.log({passed:report.passed,contracts:report.contracts,types:report.types,sourceTypes:report.sourceTypes,browserBytes:report.browserBytes,moduleBytes:report.moduleBytes,faults:report.faults.length,restored:report.restored,cleaned:true,failure:report.failure});
