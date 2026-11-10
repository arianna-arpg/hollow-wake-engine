import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {gzipSync} from 'node:zlib';import {build} from 'esbuild';import {root,sha256} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';
assert.equal(process.argv.length,2);
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const owned=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(owned,'companion-recovery-package-owned-')),consumer=path.join(work,'consumer');fs.mkdirSync(consumer);
const files=['src/companion-bond-rules.ts','src/companion-recovery.ts','test/companion-recovery.test.mjs','test/companion-recovery-consumer.ts','scripts/test-companion-recovery-package.mjs','package.json','package-lock.json'],report={passed:false,contracts:18,faults:[],sources:Object.fromEntries(files.map(file=>[file,sha256(fs.readFileSync(path.join(root,file)))]))},logs={};
const run=(label,args,cwd=consumer)=>{const c=spawnSync(process.execPath,args,{cwd,windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_PATH:'',NODE_COMPILE_CACHE:path.join(work,'compile-cache')}});logs[label]=(c.stdout??'')+'\n'+(c.stderr??'');assert(!c.error&&!c.signal,label+': '+c.error);return c;};
const success=(label,args,cwd)=>assert.equal(run(label,args,cwd).status,0,logs[label]);
const contracts=(label,file='contracts.test.mjs')=>{success(label,['--test',file]);assert(/(?:#|ℹ) pass 18\b/.test(logs[label]));};
try{
 success('pack',[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work,'--cache',path.join(work,'npm-cache')],root);
 const archive=path.join(work,JSON.parse(logs.pack)[0].filename);report.archiveSha256=sha256(fs.readFileSync(archive));
 fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));success('install',[npmCli(),'install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(work,'npm-cache')]);
 const tests=fs.readFileSync(path.join(root,'test/companion-recovery.test.mjs'),'utf8').replace("'../dist/companion-recovery.js'","'@hollow-wake/engine/companions/recovery'");fs.writeFileSync(path.join(consumer,'contracts.test.mjs'),tests);contracts('installed');
 fs.writeFileSync(path.join(consumer,'entry.mjs'),"export * from '@hollow-wake/engine/companions/recovery';\n");
 const bundle=await build({entryPoints:[path.join(consumer,'entry.mjs')],bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,metafile:true,write:false});assert(Object.values(bundle.metafile.outputs).every(row=>!row.imports.length));report.browserBytes=bundle.outputFiles[0].contents.length;assert(report.browserBytes<4*1024);
 fs.writeFileSync(path.join(consumer,'browser-built.mjs'),bundle.outputFiles[0].contents);fs.writeFileSync(path.join(consumer,'browser.test.mjs'),tests.replace("'@hollow-wake/engine/companions/recovery'","'./browser-built.mjs'"));
 fs.writeFileSync(path.join(consumer,'hostile.test.mjs'),"Math.random=()=>{throw Error('ambient RNG')};globalThis.fetch=()=>{throw Error('network')};for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw Error(key)}});await import('./browser.test.mjs');\n");contracts('browser','hostile.test.mjs');
 const typeSource=fs.readFileSync(path.join(root,'test/companion-recovery-consumer.ts'),'utf8'),tsc=path.join(root,'node_modules/typescript/bin/tsc'),args=['--strict','--noEmit','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext'];
 fs.writeFileSync(path.join(consumer,'types.ts'),typeSource);success('types',[tsc,...args,'types.ts']);report.types=true;
 const relative=path.relative(consumer,path.join(root,'src/companion-recovery.js')).split(path.sep).join('/');fs.writeFileSync(path.join(consumer,'source-types.ts'),typeSource.replace("'@hollow-wake/engine/companions/recovery'",JSON.stringify(relative.startsWith('.')?relative:'./'+relative)));success('source-types',[tsc,...args,'source-types.ts']);report.sourceTypes=true;
 const module=path.join(consumer,'node_modules/@hollow-wake/engine/dist/companion-recovery.js'),source=fs.readFileSync(module,'utf8');report.moduleBytes=Buffer.byteLength(source);assert(report.moduleBytes<6*1024);
 const faults=[
  ['pending-expiry-survives','a.expiredStatuses = a.expiredStatuses.filter(s => this.p.status(s.id)?.beneficial);','void a.expiredStatuses;'],
  ['downed-body-evades-budget','b.companion && !b.dead && !b.companionDormant','b.companion && !b.dead && !b.downed && !b.companionDormant'],
  ['retained-long-shelter','this.p.endStatus(a, cfg.status);','void cfg.status;'],
  ['refilled-life','this.p.maxLife(a) * fraction','this.p.maxLife(a)'],
  ['obsolete-revival-clock','a.companionReviveRemaining = undefined;','void a.companionReviveRemaining;'],
  ['no-cleanse','this.p.cleanse(a);','void a;'],
  ['no-revival-cue','this.p.revivalCue(a);','void a;'],
  ['ownerless-revival-refused','!a.companion || a.dead || !a.downed || a.companionDormant','!a.companion || a.dead || !a.downed || a.companionDormant || !a.owner'],
  ['stale-duration-policy','companionRecoverySeconds(count, this.p.rules())','companionRecoverySeconds(count, cfg)'],
  ['wrong-owner-identity','b.owner === a.owner','b.owner?.name === a.owner?.name'],
  ['lost-living-floor','Math.max(1, this.p.maxLife(a) * fraction)','this.p.maxLife(a) * fraction'],
  ['old-dwell-retained','a.companionReviveDwell = 0;','void a.companionReviveDwell;'],
 ];
 for(const[name,from,to]of faults){assert.equal(source.split(from).length,2,name+' selector');fs.writeFileSync(module,source.replace(from,to));try{assert.equal(run(name,['--test','contracts.test.mjs']).status,1,name+' escaped');assert.match(logs[name],/ERR_ASSERTION/);report.faults.push({name,detected:true,logSha256:sha256(logs[name])});}finally{fs.writeFileSync(module,source);}}
 contracts('restored');report.restored=true;report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(fs.readFileSync(path.join(root,file)))===hash);report.passed=report.passed&&report.inputsUnchanged;
 assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;const bytes=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(bytes);fs.writeFileSync(path.join(owned,'companion-recovery-package.logs.json.gz'),bytes);fs.writeFileSync(path.join(owned,'companion-recovery-package.json'),JSON.stringify(report,null,2)+'\n');
}
assert(report.passed,report.failure);console.log({passed:true,contracts:report.contracts,faults:report.faults.length,browserBytes:report.browserBytes,moduleBytes:report.moduleBytes,types:report.types,sourceTypes:report.sourceTypes,cleaned:report.cleaned});
