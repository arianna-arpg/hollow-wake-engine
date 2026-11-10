import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';import {build} from 'esbuild';import {root,sha256} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';
assert.equal(process.argv.length,2);
const owned=path.join(root,'.artifacts');fs.mkdirSync(owned,{recursive:true});
const work=fs.mkdtempSync(path.join(owned,'companion-bonds-package-owned-')),consumer=path.join(work,'consumer');fs.mkdirSync(consumer);
const modules=[['companion-bonds','companions/bonds'],['minion-inheritance','minions/inheritance'],['attribute-bequests','minions/bequests']],tests=modules.map(([name])=>'test/'+name+'.test.mjs');
const report={passed:false,contracts:53,faults:[],sources:{}},logs={};
for(const file of [...modules.map(([name])=>'src/'+name+'.ts'),'src/companion-bond-rules.ts',...tests,'test/companion-bonds-consumer.ts','scripts/test-companion-bonds-package.mjs','package.json','package-lock.json'])report.sources[file]=sha256(fs.readFileSync(path.join(root,file)));
const run=(label,args,cwd=consumer)=>{const c=spawnSync(process.execPath,args,{cwd,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:4*1024*1024,
 env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_PATH:'',NODE_COMPILE_CACHE:path.join(work,'compile-cache')}});
 logs[label]=(c.stdout??'')+'\n'+(c.stderr??'');assert(!c.error&&!c.signal,label+': '+c.error);return c;};
const success=(label,args,cwd)=>assert.equal(run(label,args,cwd).status,0,logs[label]);
const contracts=(label,files=tests)=>{success(label,['--test',...files]);assert(new RegExp('(?:#|ℹ) pass '+report.contracts+'\\b').test(logs[label]));};
try{
 success('pack',[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work,'--cache',path.join(work,'npm-cache')],root);
 const archive=path.join(work,JSON.parse(logs.pack)[0].filename);report.archiveSha256=sha256(fs.readFileSync(archive));
 fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
 success('install',[npmCli(),'install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(work,'npm-cache')]);fs.mkdirSync(path.join(consumer,'test'));
 const installedTests=tests.map(file=>{let source=fs.readFileSync(path.join(root,file),'utf8');for(const[name,key]of modules)source=source.replace(`'../dist/${name}.js'`,`'@hollow-wake/engine/${key}'`);fs.writeFileSync(path.join(consumer,file),source);return source;});contracts('installed');
 fs.writeFileSync(path.join(consumer,'entry.mjs'),modules.map(([,key])=>`export * from '@hollow-wake/engine/${key}';`).join('\n'));
 const bundle=await build({entryPoints:[path.join(consumer,'entry.mjs')],bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,metafile:true,write:false});
 assert(Object.values(bundle.metafile.outputs).every(output=>!output.imports.length));report.browserBytes=bundle.outputFiles[0].contents.length;assert(report.browserBytes<20*1024);
 fs.writeFileSync(path.join(consumer,'browser-built.mjs'),bundle.outputFiles[0].contents);
 const browserTests=installedTests.map((source,index)=>{for(const[,key]of modules)source=source.replace(`'@hollow-wake/engine/${key}'`,"'../browser-built.mjs'");const file='test/browser-'+index+'.mjs';fs.writeFileSync(path.join(consumer,file),source);return file;});
 fs.writeFileSync(path.join(consumer,'hostile.test.mjs'),"Math.random=()=>{throw Error('ambient RNG')};globalThis.fetch=()=>{throw Error('network')};for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw Error(key)}});"+browserTests.map(file=>`await import('./${file}');`).join(''));contracts('browser',['hostile.test.mjs']);
 fs.copyFileSync(path.join(root,'test/companion-bonds-consumer.ts'),path.join(consumer,'types.ts'));
 success('types',[path.join(root,'node_modules/typescript/bin/tsc'),'--strict','--noEmit','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','types.ts']);report.types=true;
 // The declaration consumer and direct source consumer exercise distinct
 // inference paths for defaulted generic parameters. Keep both qualified.
 let sourceTypes=fs.readFileSync(path.join(root,'test/companion-bonds-consumer.ts'),'utf8');
 for(const[name,key]of modules){const target=path.relative(consumer,path.join(root,'src',name+'.js')).split(path.sep).join('/');sourceTypes=sourceTypes.replace(`'@hollow-wake/engine/${key}'`,`'${target.startsWith('.')?target:'./'+target}'`);}
 fs.writeFileSync(path.join(consumer,'source-types.ts'),sourceTypes);
 success('source-types',[path.join(root,'node_modules/typescript/bin/tsc'),'--strict','--noEmit','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','source-types.ts']);report.sourceTypes=true;
 const sources=new Map([...modules.map(([name])=>name),'companion-bond-rules'].map(name=>{const file=path.join(consumer,'node_modules/@hollow-wake/engine/dist/'+name+'.js');return[name,{file,source:fs.readFileSync(file,'utf8')}];}));
 report.moduleBytes=Object.fromEntries([...sources].map(([name,{source}])=>[name,Buffer.byteLength(source)]));assert(Object.values(report.moduleBytes).reduce((sum,n)=>sum+n,0)<40*1024);
 const faults=[
  ['cold-policy','companion-bonds','state.policy !== policy','true'],
  ['free-heal','companion-bonds','beast.life / Math.max(1, this.p.maxLife(beast))','1'],
  ['refill-grown-armor','companion-bonds','Math.round(beast.pliesMax * plyFraction)','beast.pliesMax'],
  ['stale-grant-level','companion-bonds','held && held.level === artLevel','held'],
  ['retained-removed-cooldown','companion-bonds','beast.cooldowns.delete(id);',''],
  ['unretired-payload','companion-bonds','this.p.retirePayloads(beast, owned);',''],
  ['forgotten-recovery-progress','companion-bonds','beast.companionReviveRemaining ??= spec.reviveSeconds;','beast.companionReviveRemaining = spec.reviveSeconds;'],
  ['unpruned-issued','companion-bonds','state.issued.delete(issued);','void issued;'],
  ['unpruned-exposure','companion-bonds','state.exposure.delete(victim);','void victim;'],
  ['late-whistle','companion-bonds','state.pulseUntil > this.p.time()','state.pulseUntil >= this.p.time()'],
  ['unregistered-copy','companion-bonds','this.copies.add(copy);',''],
  ['missed-frenzy-threshold','companion-bonds','stacks >= cap','stacks > cap'],
  ['unsorted-rules','companion-bond-rules','[...(nodes ?? [])].sort()','[...(nodes ?? [])]'],
  ['deduplicated-additive-rules','companion-bond-rules','[...(nodes ?? [])].sort()','[...new Set(nodes ?? [])].sort()'],
  ['refill-armor','minion-inheritance','minion.pliesMax - spent','minion.pliesMax'],
  ['scaled-native-base','minion-inheritance','base + (raw - base) * this.p.ordinaryStats()','raw * this.p.ordinaryStats()'],
  ['double-scaled-regen','minion-inheritance',"this.p.modifier('lifeRegen', 'increased', regenRate - 1)","this.p.modifier('lifeRegen', 'increased', (regenRate - 1) * scale)"],
  ['untraded-life','minion-inheritance','lifeInc0 - tradedPlies * tradeAt','lifeInc0'],
  ['lost-override','minion-inheritance',"m.kind === 'override' ? m :",'false ? m :'],
  ['repeated-bequest-write','attribute-bequests',"(recipient.bequestSignature ?? '') === key",'false'],
  ['dead-owner-share','attribute-bequests','owner && !owner.dead && owner.attributeValues','owner && owner.attributeValues'],
  ['lost-recipient-filter','attribute-bequests',"def.recipients === 'minions' && recipient.companion",'false'],
  ['unclamped-life','attribute-bequests','recipient.life = Math.min(recipient.life, this.p.maxLife(recipient));',''],
  ['fork-lost-copy-history','companion-bonds','if (this.copies.has(source))','if (false)'],
  ['fork-shared-native-instances','companion-bonds','native: s.native.map(i => i && skill(i))','native: s.native'],
  ['fork-reset-echo-deadline','companion-bonds','echoAt: s.echoAt','echoAt: 0'],
  ['fork-live-exposure-targets','companion-bonds','[actor(a), n]','[a, n]'],
  ['fork-replayed-acquisition','companion-bonds','runtime.state.bodies.set(beast, s);','runtime.state.bodies.set(beast, s); for (const [beast] of plans) runtime.adopt(beast);'],
  ['fork-shared-derived-policy','companion-bonds','spec: mapping.spec(s.spec)','spec: s.spec'],
  ['fork-lost-issued-ownership','companion-bonds','issued: new Set([...s.issued].map(skill))','issued: new Set()'],
  ['fork-stale-destination-copy-history','companion-bonds','const copies = new WeakSet();','const copies = runtime.state.copies;'],
 ];
 for(const[name,module,from,to]of faults){const {file,source}=sources.get(module);assert.equal(source.split(from).length,2,name+' selector');fs.writeFileSync(file,source.replace(from,to));
  try{assert.equal(run('fault-'+name,['--test',...tests]).status,1,name+' escaped');assert.match(logs['fault-'+name],/ERR_ASSERTION/);report.faults.push({name,detected:true,logSha256:sha256(logs['fault-'+name])});}
  finally{fs.writeFileSync(file,source);}
 }
 contracts('restored');report.restored=true;report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 try{report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(fs.readFileSync(path.join(root,file)))===hash);report.passed=report.passed&&report.inputsUnchanged;
  const bytes=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(bytes);fs.writeFileSync(path.join(owned,'companion-bonds-package.logs.json.gz'),bytes);
 }finally{assert.equal(path.dirname(fs.realpathSync(work)),fs.realpathSync(owned));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;fs.writeFileSync(path.join(owned,'companion-bonds-package.json'),JSON.stringify(report,null,2)+'\n');}
}
assert(report.passed,report.failure);console.log({passed:true,contracts:report.contracts,faults:report.faults.length,browserBytes:report.browserBytes,moduleBytes:report.moduleBytes,cleaned:true});
