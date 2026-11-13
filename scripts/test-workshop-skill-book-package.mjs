import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';import {build} from 'esbuild';
import {root,sha256} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';import {packs} from '../test/shared-account/fixtures.mjs';
const args=process.argv.slice(2);assert(args.length===0||args.length===2&&args[0]==='--output');
const output=path.resolve(args[1]??path.join(root,'.artifacts/workshop-skill-book-package.json'));
if(args.length)assert(!fs.existsSync(output)&&!fs.existsSync(output+'.logs.json.gz'));
const artifacts=path.join(root,'.artifacts');fs.mkdirSync(artifacts,{recursive:true});
const work=fs.mkdtempSync(path.join(artifacts,'workshop-book-package-')),consumer=path.join(work,'consumer');fs.mkdirSync(consumer);
const logs={},report={passed:false,contracts:11,faults:[],sources:{}};
const sources=['scripts/test-workshop-skill-book-package.mjs','test/workshop-skill-book.test.mjs','test/shared-account/fixtures.mjs',
 'src/workshop-skill-book.ts','src/workshop-rack.ts','src/workshop-supports.ts','src/crafting-session.ts','src/crafting-session-core.ts','src/crafting-session-data.ts',
 'src/account-workshop-session.ts','src/account-workshop-core.ts','src/complete-character-contracts.ts','src/skill-bar.ts','examples/godot-inventory/cargo-sample.json','package.json','package-lock.json'];
for(const file of sources)report.sources[file]=sha256(fs.readFileSync(path.join(root,file)));
const run=(label,args,cwd=consumer)=>{
 const child=spawnSync(process.execPath,args,{cwd,encoding:'utf8',windowsHide:true,timeout:240000,maxBuffer:8*1024*1024,
  env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_PATH:''}});
 logs[label]=(child.stdout??'')+'\n'+(child.stderr??'');assert(!child.error&&!child.signal,label+': '+child.error);
 return {status:child.status,assertion:/ERR_ASSERTION|AssertionError/.test(logs[label]),logSha256:sha256(logs[label])};
};
const success=(label,args,cwd)=>{const r=run(label,args,cwd);assert.equal(r.status,0,logs[label]);return r;};
const npm=(label,args,cwd)=>success(label,[npmCli(),...args,'--cache',path.join(work,'npm-cache')],cwd);
const verify=(label,file='test/contracts.test.mjs')=>{
 const r=success(label,['--test',file]);assert(new RegExp('(?:#|ℹ) pass '+report.contracts+'\\b').test(logs[label]),logs[label]);return r;
};
try{
 npm('pack',['pack','--json','--ignore-scripts','--pack-destination',work],root);
 const packed=JSON.parse(logs.pack.trim())[0],archive=path.join(work,packed.filename);
 assert(packed.files.every(file=>!/^(baseline|reference|scripts|test|src|\.reference|node_modules)\//.test(file.path)));
 report.archiveSha256=sha256(fs.readFileSync(archive));
 fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
 npm('install',['install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund'],consumer);
 const entries={'crafting-session':'crafting/session','workshop-rack':'skills/workshop-rack','workshop-skill-book':'skills/workshop-book',
  'account-workshop-session':'account/workshops','item-rules':'items','crafting-content':'crafting/content','skill-progression':'skills/progression','equipment-actions':'inventory/equipment'};
 const rewrite=text=>Object.entries(entries).reduce((out,[file,entry])=>out.replaceAll("'../dist/"+file+".js'","'@hollow-wake/engine/"+entry+"'"),text);
 const fixtureText=fs.readFileSync(path.join(root,'test/shared-account/fixtures.mjs'),'utf8');
 const fixtures="import fs from 'node:fs';\n"+
  Object.entries({ItemContent:'items',CraftingContent:'crafting/content',SkillProgression:'skills/progression',EquipmentSlots:'inventory/equipment'})
   .map(([name,entry])=>"import {"+name+"} from '@hollow-wake/engine/"+entry+"';").join('\n')+
  "\nconst packs=JSON.parse(fs.readFileSync(new URL('../content.json',import.meta.url)));\n"+
  fixtureText.slice(fixtureText.indexOf('export function definitionsFrom'),fixtureText.indexOf('const compressed='))+
  '\nexport const definitions=definitionsFrom(packs);\n';
 fs.mkdirSync(path.join(consumer,'test'));fs.mkdirSync(path.join(consumer,'examples/godot-inventory'),{recursive:true});
 fs.writeFileSync(path.join(consumer,'content.json'),JSON.stringify(packs));
 fs.copyFileSync(path.join(root,'examples/godot-inventory/cargo-sample.json'),path.join(consumer,'examples/godot-inventory/cargo-sample.json'));
 fs.writeFileSync(path.join(consumer,'test/fixtures.mjs'),fixtures);
 const contracts=rewrite(fs.readFileSync(path.join(root,'test/workshop-skill-book.test.mjs'),'utf8')).replace("'./shared-account/fixtures.mjs'","'./fixtures.mjs'");
 fs.writeFileSync(path.join(consumer,'test/contracts.test.mjs'),contracts);
 report.installed=verify('installed');
 fs.writeFileSync(path.join(consumer,'browser.mjs'),Object.values(entries).map(entry=>"export * from '@hollow-wake/engine/"+entry+"';").join('\n'));
 const bundle=await build({entryPoints:[path.join(consumer,'browser.mjs')],bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,metafile:true,write:false});
 assert(Object.keys(bundle.metafile.inputs).every(file=>!/[\\/](?:\.reference|content)[\\/]/.test(file)));
 assert(Object.values(bundle.metafile.outputs).every(row=>!row.imports.length));report.browserBytes=bundle.outputFiles[0].contents.length;
 assert(report.browserBytes<192*1024,'Optional workshop browser composition exceeds 192 KiB');
 fs.writeFileSync(path.join(consumer,'test/browser-built.mjs'),bundle.outputFiles[0].contents);
 const browser=text=>Object.values(entries).reduce((out,entry)=>out.replaceAll("'@hollow-wake/engine/"+entry+"'","'./browser-built.mjs'"),text);
 fs.writeFileSync(path.join(consumer,'test/browser-fixtures.mjs'),browser(fixtures));
 fs.writeFileSync(path.join(consumer,'test/browser-contracts.mjs'),browser(contracts).replace("'./fixtures.mjs'","'./browser-fixtures.mjs'"));
 fs.writeFileSync(path.join(consumer,'test/hostile.test.mjs'),"Math.random=()=>{throw Error('ambient random')};globalThis.fetch=()=>{throw Error('network')};"+
  "for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw Error(key)}});await import('./browser-contracts.mjs');");
 report.browser=verify('browser','test/hostile.test.mjs');
 fs.writeFileSync(path.join(consumer,'types.ts'),"import {WorkshopSkillBook} from '@hollow-wake/engine/skills/workshop-book';"+
  "import {CraftingSession,type CraftingSessionDefinitions,type CraftingSessionState} from '@hollow-wake/engine/crafting/session';"+
  "import {AccountWorkshopSession,type AccountWorkshopDefinitions} from '@hollow-wake/engine/account/workshops';"+
  "declare const definitions:CraftingSessionDefinitions;declare const shared:AccountWorkshopDefinitions;"+
  "const book=new WorkshopSkillBook(definitions.crafting.items);new CraftingSession(definitions,2,book);new AccountWorkshopSession({...shared,rack:book});"+
  "const state:NonNullable<CraftingSessionState['skillBook']>={known:[],bar:Array(8).fill(null)};void state;");
 report.types=success('types',[path.join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','types.ts']);
 const faults=[
  ['lost-off-bar','workshop-skill-book','known: [...known.values()]','known: [...known.values()].filter(skill => body.skills.includes(skill))'],
  ['lost-binding','workshop-skill-book','bar: body.skills.map(skill => skill?.def.id ?? null)','bar: Array(8).fill(null)'],
  ['unresolved-binding','workshop-skill-book',"need(known.has(id), 'unresolved-bar-skill');",'void id;'],
  ['duplicate-binding','workshop-skill-book',"need(!bound.has(id), 'duplicate-bar-skill');",'void id;'],
  ['dual-authority','crafting-session-data',"need(input.rack === undefined, 'duplicate-skill-authority');",'void input.rack;'],
  ['lost-off-bar-supports','workshop-supports','(state.skillBook?.known ?? state.rack)','state.rack'],
  ['lost-promotion','workshop-skill-book','delete state.rack;','void state.rack;'],
  ['missing-handoff','workshop-skill-book',"signal?.({ kind: 'bar-rebound', skillIds:","void ({ kind: 'bar-rebound', skillIds:"],
 ];
 for(const[name,module,needle,replacement]of faults){
  const file=path.join(consumer,'node_modules/@hollow-wake/engine/dist',module+'.js'),original=fs.readFileSync(file,'utf8');
  assert.equal(original.split(needle).length,2,name+' needs exactly one target');fs.writeFileSync(file,original.replace(needle,replacement));
  try{const r=run('fault-'+name,['--test','test/contracts.test.mjs']);assert.equal(r.status,1,name+' escaped');assert(r.assertion,logs['fault-'+name]);report.faults.push({name,...r});}
  finally{fs.writeFileSync(file,original);}
 }
 report.restored=verify('restored');report.passed=true;
}catch(error){report.failure=String(error);throw error;}
finally{
 try{report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(fs.readFileSync(path.join(root,file)))===hash);
  const bytes=gzipSync(JSON.stringify(logs),{level:9});fs.writeFileSync(output+'.logs.json.gz',bytes);report.logsSha256=sha256(bytes);
 }finally{assert.equal(path.dirname(fs.realpathSync(work)),fs.realpathSync(artifacts));fs.rmSync(work,{recursive:true});report.cleaned=true;
  report.passed=report.passed&&report.inputsUnchanged;fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
}
assert(report.passed);console.log({passed:true,contracts:report.contracts,faults:report.faults.length,browserBytes:report.browserBytes,cleaned:report.cleaned});
