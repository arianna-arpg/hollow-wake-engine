import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync,execFileSync} from 'node:child_process';
import {gzipSync,gunzipSync} from 'node:zlib';import {build} from 'esbuild';
import {root,sha256,materialize,verifyReference} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';
import {integrateEquipmentSkills} from '../adapters/hollow-wake/integrate-equipment-skills.mjs';
const owned=path.join(root,'.artifacts');fs.mkdirSync(owned,{recursive:true});
const work=fs.mkdtempSync(path.join(owned,'equipment-draft-package-owned-')),consumer=path.join(work,'consumer');fs.mkdirSync(consumer);
const logs={},report={passed:false,contracts:8,faults:[],sources:{}};
const inputs=['src/equipment-skill-draft.ts','src/equipment-skills.ts','test/equipment-skill-draft.test.mjs','test/equipment-skill-draft-game.ts',
 'scripts/test-equipment-skill-draft-package.mjs','adapters/hollow-wake/integrate-equipment-skills.mjs',
 'reference/export-equipment-live.ts','baseline/equipment-live/acceptance.json','baseline/source-lock.json','package.json','package-lock.json'];
for(const file of inputs)report.sources[file]=sha256(fs.readFileSync(path.join(root,file)));
const run=(label,args,cwd=consumer)=>{
 const child=spawnSync(process.execPath,args,{cwd,encoding:'utf8',windowsHide:true,timeout:240000,maxBuffer:8*1024*1024,
  env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_PATH:''}});
 logs[label]=(child.stdout??'')+'\n'+(child.stderr??'');assert(!child.error&&!child.signal,label+': '+child.error);return child;
};
const success=(label,args,cwd)=>{const child=run(label,args,cwd);assert.equal(child.status,0,logs[label].slice(-7000));return child;};
const contracts=(label,file='contracts.test.mjs')=>{success(label,['--test',file]);assert(new RegExp('(?:#|ℹ) pass '+report.contracts+'\\b').test(logs[label]));};
try{
 success('pack',[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work,'--cache',path.join(work,'npm-cache')],root);
 const archive=path.join(work,JSON.parse(logs.pack)[0].filename);report.archiveSha256=sha256(fs.readFileSync(archive));
 fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
 success('install',[npmCli(),'install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(work,'npm-cache')]);
 const entries={'equipment-skills':'skills/equipment','equipment-skill-draft':'skills/equipment-draft'};
 let test=fs.readFileSync(path.join(root,'test/equipment-skill-draft.test.mjs'),'utf8');
 for(const[file,entry]of Object.entries(entries))test=test.replaceAll("'../dist/"+file+".js'","'@hollow-wake/engine/"+entry+"'");
 fs.writeFileSync(path.join(consumer,'contracts.test.mjs'),test);contracts('installed');
 fs.writeFileSync(path.join(consumer,'browser.mjs'),Object.values(entries).map(entry=>"export * from '@hollow-wake/engine/"+entry+"';").join('\n'));
 const bundle=await build({entryPoints:[path.join(consumer,'browser.mjs')],bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,metafile:true,write:false});
 assert(Object.values(bundle.metafile.outputs).every(row=>!row.imports.length));report.browserBytes=bundle.outputFiles[0].contents.length;assert(report.browserBytes<16*1024);
 fs.writeFileSync(path.join(consumer,'browser-built.mjs'),bundle.outputFiles[0].contents);
 for(const entry of Object.values(entries))test=test.replaceAll("'@hollow-wake/engine/"+entry+"'","'./browser-built.mjs'");
 fs.writeFileSync(path.join(consumer,'browser-contracts.mjs'),test);
 fs.writeFileSync(path.join(consumer,'hostile.test.mjs'),"Math.random=()=>{throw Error('ambient RNG')};globalThis.fetch=()=>{throw Error('network')};for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw Error(key)}});await import('./browser-contracts.mjs');");contracts('browser','hostile.test.mjs');
 fs.writeFileSync(path.join(consumer,'types.ts'),"import {EquipmentSkillDraft,type EquipmentSkillDraftPorts} from '@hollow-wake/engine/skills/equipment-draft';import {EquipmentSkills,type EquipmentSkillFrame} from '@hollow-wake/engine/skills/equipment';type D={id:string;name:string};type U={id:string};type S={def:D;level:number;sockets:({def:U}|null)[]};type I={uid:number;name:string};declare const source:EquipmentSkillFrame<D,U,S,I>;declare const ports:EquipmentSkillDraftPorts<D,U,S,I>;declare const rules:EquipmentSkills<D,U,S,I,{},{}>;const draft=new EquipmentSkillDraft(source,ports);rules.derive(draft.frame);const original:S|undefined=draft.sourceSkill(draft.frame.actor.skills[0]!);void original;");
 success('types',[path.join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','types.ts']);report.types=true;
 const installed=path.join(consumer,'node_modules/@hollow-wake/engine'),module=path.join(installed,'dist/equipment-skill-draft.js'),original=fs.readFileSync(module,'utf8');
 report.moduleBytes=Buffer.byteLength(original);assert(report.moduleBytes<8*1024);
 const faults=[
  ['lost-origin','reverse.set(owned, original);','void original;'],
  ['source-bar','skills: source.actor.skills.map(inst => inst && skill(inst))','skills: source.actor.skills'],
  ['source-grants','source.seat.grantedInsts && new Map([...source.seat.grantedInsts].map(([id, inst]) => [id, skill(inst)]))','source.seat.grantedInsts'],
  ['source-items','[slot, item && items.get(item)]','[slot, item]'],
  ['lost-companion-phase','ports.deriveCompanions(frame, definitions, name, key)','void definitions'],
  ['lost-retirement','ports.retire(frame, retirement);','void retirement;'],
 ];
 for(const[name,needle,replacement]of faults){
  assert(original.includes(needle),name+' target changed');fs.writeFileSync(module,original.replaceAll(needle,replacement));
  try{const child=run('fault-'+name,['--test','contracts.test.mjs']);assert.equal(child.status,1,name+' escaped');assert(logs['fault-'+name].includes('ERR_ASSERTION'),name+' did not reach an assertion');report.faults.push({name,detected:true,logSha256:sha256(logs['fault-'+name])});}
  finally{fs.writeFileSync(module,original);}
 }
 contracts('restored');report.restored=true;
 const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),game=path.join(work,'game');verifyReference(path.join(root,'.reference'),lock);materialize(undefined,lock,game);verifyReference(game,lock);
 const deps=fs.realpathSync(path.join(root,'.reference/node_modules')),modules=path.join(game,'node_modules');fs.mkdirSync(modules);
 for(const row of fs.readdirSync(deps,{withFileTypes:true}))if(row.name!=='.bin'&&row.name!=='@hollow-wake'&&(row.isDirectory()||row.isSymbolicLink()))fs.symlinkSync(path.join(deps,row.name),path.join(modules,row.name),process.platform==='win32'?'junction':'dir');
 fs.mkdirSync(path.join(modules,'@hollow-wake'));fs.symlinkSync(installed,path.join(modules,'@hollow-wake/engine'),process.platform==='win32'?'junction':'dir');integrateEquipmentSkills(game);
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'baseline/equipment-live/acceptance.json'))),observer=fs.readFileSync(path.join(root,manifest.source),'utf8');assert.equal(sha256(observer),manifest.sourceSha256);
 const needle='const native=w as any;';assert.equal(observer.split(needle).length,2);
 const probe=path.join(game,'balance/hwe-equipment-draft.ts');fs.copyFileSync(path.join(root,'test/equipment-skill-draft-game.ts'),path.join(game,'balance/hwe-equipment-draft-observer.ts'));
 fs.writeFileSync(probe,"import {observeDrafts,draftChecks} from './hwe-equipment-draft-observer';\n"+observer.replace(needle,needle+'observeDrafts(w);')+"\nwriteFileSync(process.argv[3],JSON.stringify(draftChecks),{flag:'wx'});\n");
 success('game-types',[path.join(deps,'typescript/bin/tsc'),'--noEmit','-p','tsconfig.sim.json'],game);
 const output=path.join(work,'original.json'),checks=path.join(work,'checks.json');success('original-course',['--import','tsx',probe,output,checks],game);
 const expected=gunzipSync(fs.readFileSync(path.join(root,'baseline/equipment-live/observations.json.gz')));assert.equal(sha256(expected),manifest.sha256);assert(fs.readFileSync(output).equals(expected),'Frozen original course changed');
 report.game=JSON.parse(fs.readFileSync(checks));assert.equal(report.game.prepared,36,'Every rebuild in the frozen continuity course must prepare a private candidate');assert.equal(report.game.prepared,report.game.unchanged);assert.equal(report.game.prepared,report.game.matched);report.game.originalCases=manifest.cases;report.game.sha256=manifest.sha256;
 report.passed=true;
}catch(error){report.failure=String(error);throw error;}
finally{
 try{report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(fs.readFileSync(path.join(root,file)))===hash);const bytes=gzipSync(JSON.stringify(logs),{level:9});fs.writeFileSync(path.join(owned,'equipment-draft-package.logs.json.gz'),bytes);report.logsSha256=sha256(bytes);}
 finally{assert.equal(path.dirname(fs.realpathSync(work)),fs.realpathSync(owned));fs.rmSync(work,{recursive:true});report.cleaned=true;report.passed=report.passed&&report.inputsUnchanged;fs.writeFileSync(path.join(owned,'equipment-draft-package.json'),JSON.stringify(report,null,2)+'\n');}
}
assert(report.passed);console.log({passed:true,contracts:report.contracts,faults:report.faults.length,game:report.game,browserBytes:report.browserBytes,cleaned:report.cleaned});
