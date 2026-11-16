import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import {build} from 'esbuild';
import {root,sha256,writeJSON} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';
import {buildCombatSession} from './compile-combat-session.mjs';import {readScope,checkScope} from './combat-inventory-scope-tools.mjs';
import {buildCharacterBuilds} from './compile-character-builds.mjs';import {buildCharacterSession} from './compile-character-session.mjs';
const parent=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(parent,'m3-package-owned-')),consumer=path.join(work,'consumer');
const report={passed:false,removed:[],runs:[],deviceQualified:false};
const run=(name,args,cwd=consumer)=>{const r=spawnSync(process.execPath,args,{cwd,encoding:'utf8',windowsHide:true,timeout:300000,maxBuffer:16*1024*1024,
  env:{...process.env,NODE_PATH:'',TEMP:work,TMP:work,TMPDIR:work,NODE_COMPILE_CACHE:path.join(work,'compile-cache'),NPM_CONFIG_CACHE:path.join(work,'npm-cache'),NPM_CONFIG_OFFLINE:'true',NPM_CONFIG_UPDATE_NOTIFIER:'false'}});
  assert(!r.error&&!r.signal,name+': '+r.error);assert.equal(r.status,0,name+': '+r.stderr?.slice(0,5000));return r.stdout;};
try {
  report.scope=checkScope().passed;const pkg=path.join(work,'combat');report.package=await buildCombatSession(pkg);fs.mkdirSync(consumer);
  const buildsDir=path.join(work,'builds');await buildCharacterBuilds(buildsDir);
  const charactersDir=path.join(work,'characters');buildCharacterSession(charactersDir);
  const archives=[];for(const [name,dir] of [['engine',root],['combat',pkg],['builds',buildsDir],['characters',charactersDir]]){
    const [row]=JSON.parse(run('pack-'+name,[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work],dir));archives.push(path.join(work,row.filename));
  }
  fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
  run('install',[npmCli(),'install',...archives,'--offline','--ignore-scripts','--no-audit','--no-fund']);
  report.installedCharacterPackages=true;
  const scope=readScope(),remove=new Set(scope.extensionRoots),dist=path.join(consumer,'node_modules/@hollow-wake/engine/dist');
  for(const row of Object.values(scope.exports))if(row.classification==='optional-extension'&&row.module.endsWith('.js'))remove.add(path.basename(row.module,'.js'));
  for(const name of remove)for(const suffix of ['.js','.d.ts','.js.map','.d.ts.map']){
    const f=path.join(dist,name+suffix);assert.equal(path.dirname(f),dist);if(fs.existsSync(f)){assert(!fs.lstatSync(f).isSymbolicLink());fs.unlinkSync(f);report.removed.push(path.basename(f));}
  }
  for(const name of ['consumer.mjs','types.ts','characters.mjs','lifecycles.mjs'])fs.copyFileSync(path.join(root,'test/combat-session',name),path.join(consumer,name));
  // Test geometry is bundled independently of the combat runtime. No original
  // source or build-time tool is copied into the installed consumer.
  await build({absWorkingDir:root,entryPoints:['test/combat-empty-space.mjs'],bundle:true,platform:'neutral',format:'esm',target:'es2022',outfile:path.join(consumer,'space.mjs')});
  for(const name of ['combat-frames','combat-families','combat-lifecycles','combat-proc-families','combat-interactions','character-session']){
    const file=path.join(root,'baseline',name,'observations.json.gz'),accepted=JSON.parse(fs.readFileSync(path.join(root,'baseline',name,'acceptance.json')));
    assert.equal(sha256(fs.readFileSync(file)),accepted.compressedSha256);fs.copyFileSync(file,path.join(consumer,name+'.json.gz'));
  }
  fs.writeFileSync(path.join(consumer,'tsconfig.json'),JSON.stringify({compilerOptions:{strict:true,noEmit:true,types:[],target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext'},files:['types.ts']}));
  run('types',[path.join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.json']);report.types=true;
  const browser=await build({stdin:{contents:"import {createCombatSession} from '@hollow-wake/combat';import {combatContent} from '@hollow-wake/combat/content';import {createCharacterKit} from '@hollow-wake/characters';globalThis.combat={createCombatSession,combatContent,createCharacterKit};",resolveDir:consumer},bundle:true,platform:'browser',format:'iife',target:'es2022',minify:true,write:false,metafile:true});
  report.browserBytes=browser.outputFiles[0].contents.length;
  for(const name of ['installed','fresh-installed'])report.runs.push(JSON.parse(run(name,['consumer.mjs'])));
  assert.deepEqual(report.runs[0],report.runs[1]);report.passed=true;
  console.log({passed:true,...report.runs[0],removedModules:report.removed.length,browserBytes:report.browserBytes});
}finally{assert.equal(path.dirname(fs.realpathSync(work)),parent);fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;writeJSON(path.join(root,'.artifacts/m3-package.json'),report);}
