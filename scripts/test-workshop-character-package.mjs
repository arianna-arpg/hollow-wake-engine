import {accountWorkshopRuntimeModules,accountWorkshopRawBudget} from './account-workshop-budget.mjs';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';import {build} from 'esbuild';
import {root,sha256} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';
import {packs,baseline} from '../test/shared-account/fixtures.mjs';import {characterPacks,originalBuilds} from '../test/workshop-character-fixture.mjs';
const owned=path.join(root,'.artifacts');fs.mkdirSync(owned,{recursive:true});
const work=fs.mkdtempSync(path.join(owned,'workshop-character-package-owned-')),consumer=path.join(work,'consumer');fs.mkdirSync(consumer);
const logs={},report={passed:false,contracts:13,originalClassRecords:78,faults:[],sources:{}};
const inputs=['src/workshop-character.ts','src/account-workshop-session.ts','src/account-workshop-core.ts','src/complete-character-contracts.ts','scripts/account-workshop-budget.mjs','src/workshop-build-preparation.ts',
 'src/passive-policy.ts','src/passive-grants.ts','src/crafting-session-data.ts','src/workshop-skill-book.ts',
 'test/workshop-character.test.mjs','test/workshop-character-fixture.mjs','test/shared-account/fixtures.mjs','test/shared-account/contracts.mjs',
 'scripts/test-workshop-character-package.mjs','baseline/build-contributions/acceptance.json','baseline/source-lock.json','package.json','package-lock.json'];
for(const file of inputs)report.sources[file]=sha256(fs.readFileSync(path.join(root,file)));
const run=(label,args,cwd=consumer)=>{
 const child=spawnSync(process.execPath,args,{cwd,encoding:'utf8',windowsHide:true,timeout:240000,maxBuffer:8*1024*1024,
  env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_PATH:'',NODE_COMPILE_CACHE:path.join(work,'compile-cache')}});
 logs[label]=(child.stdout??'')+'\n'+(child.stderr??'');assert(!child.error&&!child.signal,label+': '+child.error);return child;
};
const success=(label,args,cwd)=>{const child=run(label,args,cwd);assert.equal(child.status,0,logs[label].slice(-7000));return child;};
const contracts=(label,file='character.test.mjs')=>{success(label,['--test',file]);assert(new RegExp('(?:#|ℹ) pass '+report.contracts+'\\b').test(logs[label]));};
try{
 success('pack',[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work,'--cache',path.join(work,'npm-cache')],root);
 const archive=path.join(work,JSON.parse(logs.pack)[0].filename);report.archiveSha256=sha256(fs.readFileSync(archive));
 fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
 success('install',[npmCli(),'install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(work,'npm-cache')]);
 const entries={'account-workshop-session':'account/workshops','workshop-build-preparation':'account/workshop-build',
  'workshop-character':'account/workshop-character','passive-policy':'passives','passive-grants':'passives/grants','workshop-skill-book':'skills/workshop-book',
  'item-rules':'items','crafting-content':'crafting/content','skill-progression':'skills/progression','equipment-actions':'inventory/equipment'};
 const content=JSON.stringify(packs),original=JSON.stringify(baseline),sources=JSON.stringify({characterPacks,originalBuilds});
 report.contentSha256=sha256(content);report.baselineSha256=sha256(original);report.characterFixtureSha256=sha256(sources);
 fs.writeFileSync(path.join(consumer,'content.json'),content);fs.writeFileSync(path.join(consumer,'baseline.json'),original);
 fs.writeFileSync(path.join(consumer,'character-source.json'),sources);
 fs.writeFileSync(path.join(consumer,'character-fixture.mjs'),"import fs from 'node:fs';export const {characterPacks,originalBuilds}=JSON.parse(fs.readFileSync(new URL('./character-source.json',import.meta.url)));\n");
 const fixtureSource=fs.readFileSync(path.join(root,'test/shared-account/fixtures.mjs'),'utf8');
 const fixtures="import fs from 'node:fs';\n"+
  Object.entries(entries).filter(([key])=>['item-rules','crafting-content','skill-progression','equipment-actions'].includes(key))
   .map(([key,entry])=>"import {"+({'item-rules':'ItemContent','crafting-content':'CraftingContent','skill-progression':'SkillProgression','equipment-actions':'EquipmentSlots'}[key])+"} from '@hollow-wake/engine/"+entry+"';").join('\n')+
  "\nconst packs=JSON.parse(fs.readFileSync(new URL('./content.json',import.meta.url)));export const baseline=JSON.parse(fs.readFileSync(new URL('./baseline.json',import.meta.url)));\n"+
  fixtureSource.slice(fixtureSource.indexOf('export function definitionsFrom'),fixtureSource.indexOf('const compressed='))+"\nexport const definitions=definitionsFrom(packs);\n";
 fs.writeFileSync(path.join(consumer,'fixtures.mjs'),fixtures);
 fs.copyFileSync(path.join(root,'test/shared-account/contracts.mjs'),path.join(consumer,'contracts.mjs'));
 let test=fs.readFileSync(path.join(root,'test/workshop-character.test.mjs'),'utf8')
  .replaceAll("'./shared-account/fixtures.mjs'","'./fixtures.mjs'").replaceAll("'./shared-account/contracts.mjs'","'./contracts.mjs'")
  .replaceAll("'./workshop-character-fixture.mjs'","'./character-fixture.mjs'");
 for(const[file,entry]of Object.entries(entries))test=test.replaceAll("'../dist/"+file+".js'","'@hollow-wake/engine/"+entry+"'");
 fs.writeFileSync(path.join(consumer,'character.test.mjs'),test);contracts('installed');
 fs.writeFileSync(path.join(consumer,'browser.mjs'),Object.values(entries).map(entry=>"export * from '@hollow-wake/engine/"+entry+"';").join('\n'));
 const bundle=await build({entryPoints:[path.join(consumer,'browser.mjs')],bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,metafile:true,write:false});
 assert(Object.values(bundle.metafile.outputs).every(row=>!row.imports.length));report.browserBytes=bundle.outputFiles[0].contents.length;
 assert(report.browserBytes<208*1024,'Character, passive and workshop consumer exceeds 208 KiB');
 fs.writeFileSync(path.join(consumer,'browser-built.mjs'),bundle.outputFiles[0].contents);
 const browser=text=>Object.values(entries).reduce((text,entry)=>text.replaceAll("'@hollow-wake/engine/"+entry+"'","'./browser-built.mjs'"),text);
 fs.writeFileSync(path.join(consumer,'browser-fixtures.mjs'),browser(fixtures));
 fs.writeFileSync(path.join(consumer,'browser-contracts.mjs'),browser(test).replaceAll("'./fixtures.mjs'","'./browser-fixtures.mjs'"));
 fs.writeFileSync(path.join(consumer,'hostile.test.mjs'),"Math.random=()=>{throw Error('ambient RNG')};globalThis.fetch=()=>{throw Error('network')};for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw Error(key)}});await import('./browser-contracts.mjs');");contracts('browser','hostile.test.mjs');
 fs.writeFileSync(path.join(consumer,'types.ts'),"import {AccountWorkshopSession,type AccountWorkshopDefinitions} from '@hollow-wake/engine/account/workshops';import {WorkshopCharacterData,type WorkshopCharacterState,type WorkshopCharacterDefinitions} from '@hollow-wake/engine/account/workshop-character';import type {WorkshopBuildInput} from '@hollow-wake/engine/account/workshop-build';declare const definitions:AccountWorkshopDefinitions;declare const character:WorkshopCharacterDefinitions;declare const input:WorkshopBuildInput;const data=new WorkshopCharacterData(character,definitions.workshop);const source:WorkshopCharacterState=data.admit(input.character,input.state);data.checkInventory(source,input.state);new AccountWorkshopSession({...definitions,character});");
 success('types',[path.join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','types.ts']);report.types=true;
 const dist=path.join(consumer,'node_modules/@hollow-wake/engine/dist');
 const modules=Object.fromEntries([...accountWorkshopRuntimeModules,'workshop-character'].map(name=>[name,fs.readFileSync(path.join(dist,name+'.js'),'utf8')]));
 report.moduleBytes=Object.fromEntries(Object.entries(modules).map(([name,text])=>[name,Buffer.byteLength(text)]));
 report.accountWorkshopBytes=accountWorkshopRuntimeModules.reduce((sum,name)=>sum+report.moduleBytes[name],0);
 assert(report.accountWorkshopBytes<=accountWorkshopRawBudget);assert(report.moduleBytes['workshop-character']<8*1024);
 const faults=[
  ['lose-save-context','account-workshop-core','...(workshop.character ? { character: workshop.character } : {})',''],
  ['skip-inventory-links','account-workshop-core','this.#character.checkInventory(workshop.character, state);',''],
  ['reuse-owned-address','account-workshop-core','Math.max(save.nextUid, floor)','save.nextUid'],
  ['accept-zero-level','workshop-character','integer(value.level, 1);',''],
  ['accept-wrong-content','workshop-character','value.contentId === this.#contentId','true'],
  ['skip-passive-admission','workshop-character','this.#passives.create(p);',''],
  ['duplicate-account-body','workshop-character','item.relicKey === undefined','true'],
  ['duplicate-local-address','workshop-character','!seen.has(item.uid)','true'],
  ['orphan-graft','workshop-character','target === null || known.has(target)','true'],
  ['account-container-copy','workshop-character','!def.accountStorage || rows.length === 0','true'],
 ];
 for(const[name,module,needle,replacement]of faults){
  const source=modules[module],file=path.join(dist,module+'.js');assert.equal(source.split(needle).length,2,name+' target changed');fs.writeFileSync(file,source.replace(needle,replacement));
  try{const child=run('fault-'+name,['--test','character.test.mjs']);assert.equal(child.status,1,name+' escaped');assert(logs['fault-'+name].includes('ERR_ASSERTION'),name+' did not reach an assertion');report.faults.push({name,detected:true,logSha256:sha256(logs['fault-'+name])});}
  finally{fs.writeFileSync(file,source);}
 }
 contracts('restored');report.restored=true;report.passed=true;
}catch(error){report.failure=String(error);throw error;}
finally{
 try{report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(fs.readFileSync(path.join(root,file)))===hash);const bytes=gzipSync(JSON.stringify(logs),{level:9});fs.writeFileSync(path.join(owned,'workshop-character-package.logs.json.gz'),bytes);report.logsSha256=sha256(bytes);}
 finally{assert.equal(path.dirname(fs.realpathSync(work)),fs.realpathSync(owned));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;report.passed=report.passed&&report.inputsUnchanged;fs.writeFileSync(path.join(owned,'workshop-character-package.json'),JSON.stringify(report,null,2)+'\n');}
}
assert(report.passed);console.log({passed:true,contracts:report.contracts,faults:report.faults.length,originalClassRecords:report.originalClassRecords,browserBytes:report.browserBytes,cleaned:report.cleaned});
