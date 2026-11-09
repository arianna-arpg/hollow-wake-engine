import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';import {build} from 'esbuild';
import {root,sha256} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';import {packs,baseline} from '../test/shared-account/fixtures.mjs';
const owned=path.join(root,'.artifacts');fs.mkdirSync(owned,{recursive:true});
const work=fs.mkdtempSync(path.join(owned,'workshop-build-package-owned-')),consumer=path.join(work,'consumer');fs.mkdirSync(consumer);
const logs={},report={passed:false,contracts:10,faults:[],sources:{}};
const inputs=['src/account-workshop-session.ts','src/workshop-build-preparation.ts','src/equipment-skill-draft.ts','src/equipment-skills.ts',
 'test/workshop-build-preparation.test.mjs','test/shared-account/fixtures.mjs','test/shared-account/contracts.mjs',
 'scripts/test-workshop-build-package.mjs','package.json','package-lock.json'];
for(const file of inputs)report.sources[file]=sha256(fs.readFileSync(path.join(root,file)));
const run=(label,args,cwd=consumer)=>{
 const child=spawnSync(process.execPath,args,{cwd,encoding:'utf8',windowsHide:true,timeout:240000,maxBuffer:8*1024*1024,
  env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_PATH:''}});
 logs[label]=(child.stdout??'')+'\n'+(child.stderr??'');assert(!child.error&&!child.signal,label+': '+child.error);return child;
};
const success=(label,args,cwd)=>{const child=run(label,args,cwd);assert.equal(child.status,0,logs[label].slice(-7000));return child;};
const contracts=(label,file='build.test.mjs')=>{success(label,['--test',file]);assert(new RegExp('(?:#|ℹ) pass '+report.contracts+'\\b').test(logs[label]));};
try{
 success('pack',[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work,'--cache',path.join(work,'npm-cache')],root);
 const archive=path.join(work,JSON.parse(logs.pack)[0].filename);report.archiveSha256=sha256(fs.readFileSync(archive));
 fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
 success('install',[npmCli(),'install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(work,'npm-cache')]);
 const entries={'account-workshop-session':'account/workshops','workshop-build-preparation':'account/workshop-build',
  'equipment-skills':'skills/equipment','equipment-skill-draft':'skills/equipment-draft',
  'item-rules':'items','crafting-content':'crafting/content','skill-progression':'skills/progression','equipment-actions':'inventory/equipment'};
 const content=JSON.stringify(packs),original=JSON.stringify(baseline);report.contentSha256=sha256(content);report.baselineSha256=sha256(original);
 fs.writeFileSync(path.join(consumer,'content.json'),content);fs.writeFileSync(path.join(consumer,'baseline.json'),original);
 const fixtureSource=fs.readFileSync(path.join(root,'test/shared-account/fixtures.mjs'),'utf8');
 const fixtures="import fs from 'node:fs';\n"+
  Object.entries(entries).filter(([key])=>['item-rules','crafting-content','skill-progression','equipment-actions'].includes(key))
   .map(([key,entry])=>"import {"+({'item-rules':'ItemContent','crafting-content':'CraftingContent','skill-progression':'SkillProgression','equipment-actions':'EquipmentSlots'}[key])+"} from '@hollow-wake/engine/"+entry+"';").join('\n')+
  "\nconst packs=JSON.parse(fs.readFileSync(new URL('./content.json',import.meta.url)));export const baseline=JSON.parse(fs.readFileSync(new URL('./baseline.json',import.meta.url)));\n"+
  fixtureSource.slice(fixtureSource.indexOf('export function definitionsFrom'),fixtureSource.indexOf('const compressed='))+"\nexport const definitions=definitionsFrom(packs);\n";
 fs.writeFileSync(path.join(consumer,'fixtures.mjs'),fixtures);
 fs.copyFileSync(path.join(root,'test/shared-account/contracts.mjs'),path.join(consumer,'contracts.mjs'));
 let test=fs.readFileSync(path.join(root,'test/workshop-build-preparation.test.mjs'),'utf8')
  .replaceAll("'./shared-account/fixtures.mjs'","'./fixtures.mjs'").replaceAll("'./shared-account/contracts.mjs'","'./contracts.mjs'");
 for(const[file,entry]of Object.entries(entries))test=test.replaceAll("'../dist/"+file+".js'","'@hollow-wake/engine/"+entry+"'");
 fs.writeFileSync(path.join(consumer,'build.test.mjs'),test);contracts('installed');
 fs.writeFileSync(path.join(consumer,'browser.mjs'),Object.values(entries).map(entry=>"export * from '@hollow-wake/engine/"+entry+"';").join('\n'));
 const bundle=await build({entryPoints:[path.join(consumer,'browser.mjs')],bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,metafile:true,write:false});
 assert(Object.values(bundle.metafile.outputs).every(row=>!row.imports.length));report.browserBytes=bundle.outputFiles[0].contents.length;
 assert(report.browserBytes<176*1024,'Complete workshop/equipment preparation consumer exceeds 176 KiB');
 fs.writeFileSync(path.join(consumer,'browser-built.mjs'),bundle.outputFiles[0].contents);
 const browser=text=>Object.values(entries).reduce((text,entry)=>text.replaceAll("'@hollow-wake/engine/"+entry+"'","'./browser-built.mjs'"),text);
 fs.writeFileSync(path.join(consumer,'browser-fixtures.mjs'),browser(fixtures));
 fs.writeFileSync(path.join(consumer,'browser-contracts.mjs'),browser(test).replaceAll("'./fixtures.mjs'","'./browser-fixtures.mjs'"));
 fs.writeFileSync(path.join(consumer,'hostile.test.mjs'),"Math.random=()=>{throw Error('ambient RNG')};globalThis.fetch=()=>{throw Error('network')};for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw Error(key)}});await import('./browser-contracts.mjs');");contracts('browser','hostile.test.mjs');
 fs.writeFileSync(path.join(consumer,'types.ts'),"import {AccountWorkshopSession,type AccountWorkshopDefinitions} from '@hollow-wake/engine/account/workshops';import {WorkshopBuildPreparation,type WorkshopBuildServices} from '@hollow-wake/engine/account/workshop-build';declare const definitions:AccountWorkshopDefinitions;declare const services:WorkshopBuildServices<{revision:number}>;const preparation=new WorkshopBuildPreparation(services);const owner=new AccountWorkshopSession({...definitions,preparation});void owner;");
 success('types',[path.join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','types.ts']);report.types=true;
 const dist=path.join(consumer,'node_modules/@hollow-wake/engine/dist');
 const modules=Object.fromEntries(['account-workshop-session','workshop-build-preparation'].map(name=>[name,fs.readFileSync(path.join(dist,name+'.js'),'utf8')]));
 report.moduleBytes=Object.fromEntries(Object.entries(modules).map(([name,text])=>[name,Buffer.byteLength(text)]));
 assert(report.moduleBytes['account-workshop-session']<=30*1024);assert(report.moduleBytes['workshop-build-preparation']<=4*1024);
 const faults=[
  ['cold-reopen','account-workshop-session','preparation.prepare(previous?.build,','preparation.prepare(undefined,'],
  ['lose-chain','account-workshop-session','const nextWorkshop = { ...workshop, body, build: prepared.build','const nextWorkshop = { ...workshop, body, build: workshop.build'],
  ['skip-siblings','account-workshop-session','if (this.#preparation)','if (false)'],
  ['stale-account-context','account-workshop-session','previous && owner === previous.buildAccount && same','previous && same'],
  ['omit-writeback','workshop-build-preparation','item.grantState = row.grantState;','void row.grantState;'],
  ['publish-input-edits','workshop-build-preparation','return { state, continuation };','return { state: privateInput.state, continuation };'],
  ['skip-normalized-admission','account-workshop-session',"const checked = this.#withWorkshop({ op: 'restore', save: { ...save, state: result.state } }).save;",'const checked = {...save,state:result.state};'],
  ['reuse-source','workshop-build-preparation',"candidate !== null && typeof candidate === 'object' && candidate !== source","candidate !== null && typeof candidate === 'object'"],
 ];
 for(const[name,module,needle,replacement]of faults){
  const source=modules[module],file=path.join(dist,module+'.js');assert.equal(source.split(needle).length,2,name+' target changed');fs.writeFileSync(file,source.replace(needle,replacement));
  try{const child=run('fault-'+name,['--test','build.test.mjs']);assert.equal(child.status,1,name+' escaped');assert(logs['fault-'+name].includes('ERR_ASSERTION'),name+' did not reach an assertion');report.faults.push({name,detected:true,logSha256:sha256(logs['fault-'+name])});}
  finally{fs.writeFileSync(file,source);}
 }
 contracts('restored');report.restored=true;report.passed=true;
}catch(error){report.failure=String(error);throw error;}
finally{
 try{report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(fs.readFileSync(path.join(root,file)))===hash);const bytes=gzipSync(JSON.stringify(logs),{level:9});fs.writeFileSync(path.join(owned,'workshop-build-package.logs.json.gz'),bytes);report.logsSha256=sha256(bytes);}
 finally{assert.equal(path.dirname(fs.realpathSync(work)),fs.realpathSync(owned));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;report.passed=report.passed&&report.inputsUnchanged;fs.writeFileSync(path.join(owned,'workshop-build-package.json'),JSON.stringify(report,null,2)+'\n');}
}
assert(report.passed);console.log({passed:true,contracts:report.contracts,faults:report.faults.length,browserBytes:report.browserBytes,cleaned:report.cleaned});
