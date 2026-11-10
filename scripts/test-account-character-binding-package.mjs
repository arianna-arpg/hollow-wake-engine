import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';import {build} from 'esbuild';
import {root,sha256} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';
import {packs,baseline} from '../test/shared-account/fixtures.mjs';import {originalRelics} from '../test/account-relic-items-fixture.mjs';
const owned=path.join(root,'.artifacts');fs.mkdirSync(owned,{recursive:true});
const work=fs.mkdtempSync(path.join(owned,'account-character-binding-package-owned-')),consumer=path.join(work,'consumer');fs.mkdirSync(consumer);
const logs={},report={passed:false,contracts:17,faults:[],sources:{}};
const inputs=['src/account-relic-items.ts','src/account-workshop-session.ts','src/workshop-build-preparation.ts',
 'src/relic-custody.ts','src/crafting-session-data.ts','src/progression-session.ts',
 'test/account-character-binding.test.mjs','test/account-relic-items-fixture.mjs','src/workshop-character.ts','src/passive-policy.ts','test/shared-account/fixtures.mjs','test/shared-account/contracts.mjs',
 'scripts/test-account-character-binding-package.mjs','baseline/account-relic-build/acceptance.json','baseline/source-lock.json','package.json','package-lock.json'];
for(const file of inputs)report.sources[file]=sha256(fs.readFileSync(path.join(root,file)));
const run=(label,args,cwd=consumer)=>{
 const child=spawnSync(process.execPath,args,{cwd,encoding:'utf8',windowsHide:true,timeout:240000,maxBuffer:8*1024*1024,
  env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_PATH:'',NODE_COMPILE_CACHE:path.join(work,'compile-cache')}});
 logs[label]=(child.stdout??'')+'\n'+(child.stderr??'');assert(!child.error&&!child.signal,label+': '+child.error);return child;
};
const success=(label,args,cwd)=>{const child=run(label,args,cwd);assert.equal(child.status,0,logs[label].slice(-7000));return child;};
const contracts=(label,file='relics.test.mjs')=>{success(label,['--test',file]);assert(new RegExp('(?:#|ℹ) pass '+report.contracts+'\\b').test(logs[label]));};
try{
 success('pack',[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work,'--cache',path.join(work,'npm-cache')],root);
 const archive=path.join(work,JSON.parse(logs.pack)[0].filename);report.archiveSha256=sha256(fs.readFileSync(archive));
 fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
 success('install',[npmCli(),'install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(work,'npm-cache')]);
 const entries={'account-workshop-session':'account/workshops','workshop-build-preparation':'account/workshop-build',
  'account-relic-items':'account/relic-items','relic-custody':'inventory/relics',
  'item-rules':'items','crafting-content':'crafting/content','skill-progression':'skills/progression','equipment-actions':'inventory/equipment','passive-policy':'passives'};
 const content=JSON.stringify(packs),original=JSON.stringify(baseline),sources=JSON.stringify(originalRelics);
 report.contentSha256=sha256(content);report.baselineSha256=sha256(original);report.originalRelicsSha256=sha256(sources);
 fs.writeFileSync(path.join(consumer,'content.json'),content);fs.writeFileSync(path.join(consumer,'baseline.json'),original);
 fs.writeFileSync(path.join(consumer,'original-relics.json'),sources);
 fs.writeFileSync(path.join(consumer,'relics-fixture.mjs'),"import fs from 'node:fs';export const originalRelics=JSON.parse(fs.readFileSync(new URL('./original-relics.json',import.meta.url)));\n");
 const fixtureSource=fs.readFileSync(path.join(root,'test/shared-account/fixtures.mjs'),'utf8');
 const fixtures="import fs from 'node:fs';\n"+
  Object.entries(entries).filter(([key])=>['item-rules','crafting-content','skill-progression','equipment-actions'].includes(key))
   .map(([key,entry])=>"import {"+({'item-rules':'ItemContent','crafting-content':'CraftingContent','skill-progression':'SkillProgression','equipment-actions':'EquipmentSlots'}[key])+"} from '@hollow-wake/engine/"+entry+"';").join('\n')+
  "\nconst packs=JSON.parse(fs.readFileSync(new URL('./content.json',import.meta.url)));export const baseline=JSON.parse(fs.readFileSync(new URL('./baseline.json',import.meta.url)));\n"+
  fixtureSource.slice(fixtureSource.indexOf('export function definitionsFrom'),fixtureSource.indexOf('const compressed='))+"\nexport const definitions=definitionsFrom(packs);\n";
 fs.writeFileSync(path.join(consumer,'fixtures.mjs'),fixtures);
 fs.copyFileSync(path.join(root,'test/shared-account/contracts.mjs'),path.join(consumer,'contracts.mjs'));
 let test=fs.readFileSync(path.join(root,'test/account-character-binding.test.mjs'),'utf8')
  .replaceAll("'./shared-account/fixtures.mjs'","'./fixtures.mjs'").replaceAll("'./shared-account/contracts.mjs'","'./contracts.mjs'")
  .replaceAll("'./account-relic-items-fixture.mjs'","'./relics-fixture.mjs'");
 for(const[file,entry]of Object.entries(entries))test=test.replaceAll("'../dist/"+file+".js'","'@hollow-wake/engine/"+entry+"'");
 fs.writeFileSync(path.join(consumer,'relics.test.mjs'),test);contracts('installed');
 fs.writeFileSync(path.join(consumer,'browser.mjs'),Object.values(entries).map(entry=>"export * from '@hollow-wake/engine/"+entry+"';").join('\n'));
 const bundle=await build({entryPoints:[path.join(consumer,'browser.mjs')],bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,metafile:true,write:false});
 assert(Object.values(bundle.metafile.outputs).every(row=>!row.imports.length));report.browserBytes=bundle.outputFiles[0].contents.length;
 assert(report.browserBytes<180*1024,'Typed relic/workshop consumer exceeds 180 KiB');
 fs.writeFileSync(path.join(consumer,'browser-built.mjs'),bundle.outputFiles[0].contents);
 const browser=text=>Object.values(entries).reduce((text,entry)=>text.replaceAll("'@hollow-wake/engine/"+entry+"'","'./browser-built.mjs'"),text);
 fs.writeFileSync(path.join(consumer,'browser-fixtures.mjs'),browser(fixtures));
 fs.writeFileSync(path.join(consumer,'browser-contracts.mjs'),browser(test).replaceAll("'./fixtures.mjs'","'./browser-fixtures.mjs'"));
 fs.writeFileSync(path.join(consumer,'hostile.test.mjs'),"Math.random=()=>{throw Error('ambient RNG')};globalThis.fetch=()=>{throw Error('network')};for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw Error(key)}});await import('./browser-contracts.mjs');");contracts('browser','hostile.test.mjs');
 fs.writeFileSync(path.join(consumer,'types.ts'),"import {AccountWorkshopSession,type AccountWorkshopDefinitions} from '@hollow-wake/engine/account/workshops';import {WorkshopBuildPreparation,type WorkshopBuildWrites} from '@hollow-wake/engine/account/workshop-build';declare const definitions:AccountWorkshopDefinitions;const preparation=new WorkshopBuildPreparation({initialize:()=>({}),fork:()=>({}),derive:(_candidate,input):WorkshopBuildWrites=>({items:[],relics:input.relics?.role==='active'?input.relics.state.items.map(item=>({uid:item.uid,relicKey:item.relicKey!,grantState:null})):[]})});new AccountWorkshopSession({...definitions,preparation,relicBuilds:true});");
 success('types',[path.join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','types.ts']);report.types=true;
 const dist=path.join(consumer,'node_modules/@hollow-wake/engine/dist');
 const modules=Object.fromEntries(['account-workshop-session','workshop-build-preparation'].map(name=>[name,fs.readFileSync(path.join(dist,name+'.js'),'utf8')]));
 report.moduleBytes=Object.fromEntries(Object.entries(modules).map(([name,text])=>[name,Buffer.byteLength(text)]));
 assert(report.moduleBytes['account-workshop-session']<=40*1024);assert(report.moduleBytes['workshop-build-preparation']<4*1024);
 const faults=[
  ['share-command-input','account-workshop-session','command: command === undefined ? undefined : copySessionJSON(command),','command,'],
  ['allow-collision','account-workshop-session',"!used.has(item.uid), 'relic-address-collision'","true, 'relic-address-collision'"],
  ['forget-address-floor','account-workshop-session','floor = Math.max(floor, item.uid + 1);','floor = floor;'],
  ['allow-active-close','account-workshop-session',"this.#account(workshop.account).active !== request.profile, 'active-workshop-in-use'","true, 'active-workshop-in-use'"],
  ['lose-selected-role','account-workshop-session','owner.active === profile ?','false ?'],
  ['ignore-stale-address','account-workshop-session',"item && item.uid === row.uid, 'stale-relic-grant-write'","item, 'stale-relic-grant-write'"],
  ['allow-duplicate-writes','account-workshop-session',"!seen.has(row.relicKey), 'duplicate-relic-grant-write'","true, 'duplicate-relic-grant-write'"],
  ['drop-canonical-write','account-workshop-session','item.grantState = row.grantState;','void row.grantState;'],
  ['drop-canonical-clear','account-workshop-session','delete item.grantState;','void item.grantState;'],
  ['bypass-owner-authority','account-workshop-session',"relicWrites.length === 0 || (this.#relicBuilds && owner.active === profile), 'inactive-relic-write'","true, 'inactive-relic-write'"],
  ['stale-build-account','account-workshop-session','previous && owner === previous.buildAccount && same','previous && same'],
  ['drop-prepared-publication','account-workshop-session',"if (request.op === 'commit-prepared')\n            this.#state = pending.state;","if (request.op === 'commit-prepared')\n            void pending.state;"],
 ];
 for(const[name,module,needle,replacement,count=1]of faults){
  const source=modules[module],file=path.join(dist,module+'.js');assert.equal(source.split(needle).length,count+1,name+' target changed');fs.writeFileSync(file,source.replace(needle,replacement));
  try{const child=run('fault-'+name,['--test','relics.test.mjs']);assert.equal(child.status,1,name+' escaped');assert(logs['fault-'+name].includes('ERR_ASSERTION'),name+' did not reach an assertion');report.faults.push({name,detected:true,logSha256:sha256(logs['fault-'+name])});}
  finally{fs.writeFileSync(file,source);}
 }
 contracts('restored');report.restored=true;report.passed=true;
}catch(error){report.failure=String(error);throw error;}
finally{
 try{report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(fs.readFileSync(path.join(root,file)))===hash);const bytes=gzipSync(JSON.stringify(logs),{level:9});fs.writeFileSync(path.join(owned,'account-character-binding-package.logs.json.gz'),bytes);report.logsSha256=sha256(bytes);}
 finally{assert.equal(path.dirname(fs.realpathSync(work)),fs.realpathSync(owned));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;report.passed=report.passed&&report.inputsUnchanged;fs.writeFileSync(path.join(owned,'account-character-binding-package.json'),JSON.stringify(report,null,2)+'\n');}
}
assert(report.passed);console.log({passed:true,contracts:report.contracts,faults:report.faults.length,browserBytes:report.browserBytes,cleaned:report.cleaned});
