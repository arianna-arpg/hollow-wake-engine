import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {gzipSync,gunzipSync} from 'node:zlib';
import {root,sha256,writeJSON} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';
import {buildCharacterBuilds} from './compile-character-builds.mjs';import {buildCharacterSession} from './compile-character-session.mjs';
import {build} from 'esbuild';
import {checkScope,readScope} from './combat-inventory-scope-tools.mjs';
const owned=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(owned,'m2-session-owned-')),consumer=path.join(work,'consumer');
const probe=process.argv.includes('--probe'),development=process.argv.includes('--source'),links=[],report={passed:false,development,sources:{},runs:[],removed:[],deviceQualified:false},logs={};
const run=(name,args,cwd=consumer)=>{const result=spawnSync(process.execPath,args,{cwd,encoding:'utf8',windowsHide:true,timeout:300000,maxBuffer:16*1024*1024,
  env:{...process.env,NODE_PATH:'',TEMP:work,TMP:work,TMPDIR:work,NODE_COMPILE_CACHE:path.join(work,'compile-cache'),NPM_CONFIG_CACHE:path.join(work,'npm-cache'),NPM_CONFIG_OFFLINE:'true',NPM_CONFIG_UPDATE_NOTIFIER:'false'}});
  logs[name]={stdout:result.stdout,stderr:result.stderr};assert(!result.error&&!result.signal,name+': '+result.error);assert.equal(result.status,0,name+': '+result.stderr?.slice(0,2400));return result.stdout;};
try{
  const audit=checkScope();Object.assign(report.sources,audit.sources);
  for(const file of ['package.json','package-lock.json','scripts/test-character-session.mjs','scripts/compile-character-session.mjs','scripts/compile-character-builds.mjs','adapters/embedded/character-session.mjs','adapters/embedded/character-session.d.ts','adapters/embedded/character-builds.mjs','adapters/embedded/character-build-helpers.mjs','test/character-session/consumer.mjs','test/character-session/host.mjs','test/character-session/contracts.mjs','test/character-session/types.ts'])report.sources[file]=sha256(fs.readFileSync(path.join(root,file)));
  const fixture=path.join(root,probe?'.artifacts/m2-original-probe.json.gz':'baseline/character-session/observations.json.gz');
  if(!probe){const accepted=JSON.parse(fs.readFileSync(path.join(root,'baseline/character-session/acceptance.json')));assert(accepted.originalOnly);assert.equal(sha256(fs.readFileSync(fixture)),accepted.compressedSha256);assert.equal(sha256(gunzipSync(fs.readFileSync(fixture))),accepted.sha256);}
  fs.mkdirSync(consumer);const factory=path.join(work,'builds'),characters=path.join(work,'characters');
  report.builds=(await buildCharacterBuilds(factory)).manifest;report.characters=buildCharacterSession(characters).manifest;
  if(development){
    const modules=path.join(work,'node_modules/@hollow-wake');fs.mkdirSync(modules,{recursive:true});
    for(const[name,target]of [['engine',root],['character-builds',factory],['characters',characters]]){const link=path.join(modules,name);fs.symlinkSync(target,link,process.platform==='win32'?'junction':'dir');links.push(link);}
  }else{
  const archives=[];for(const[name,dir]of [['core',root],['builds',factory],['characters',characters]]){const [row]=JSON.parse(run('pack-'+name,[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work],dir));archives.push(path.join(work,row.filename));}
  fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));run('install',[npmCli(),'install',...archives,'--offline','--ignore-scripts','--no-audit','--no-fund']);
  }
  const dist=path.join(consumer,'node_modules/@hollow-wake/engine/dist'),scope=readScope(),remove=new Set(scope.extensionRoots);
  for(const row of Object.values(scope.exports))if(row.classification==='optional-extension'&&row.module.endsWith('.js'))remove.add(path.basename(row.module,'.js'));
  for(const name of development?[]:remove){assert(/^[a-z0-9-]+$/.test(name));for(const suffix of ['.js','.d.ts','.js.map','.d.ts.map']){
    const file=path.join(dist,name+suffix);assert.equal(path.dirname(file),dist);if(fs.existsSync(file)){assert(!fs.lstatSync(file).isSymbolicLink());fs.unlinkSync(file);report.removed.push(path.basename(file));}
  }}
  for(const name of ['consumer.mjs','host.mjs','contracts.mjs'])fs.copyFileSync(path.join(root,'test/character-session',name),path.join(consumer,name));
  fs.copyFileSync(fixture,path.join(consumer,'original.json.gz'));
  fs.copyFileSync(path.join(root,'test/character-session/types.ts'),path.join(consumer,'types.ts'));
  fs.writeFileSync(path.join(consumer,'tsconfig.json'),JSON.stringify({compilerOptions:{strict:true,noEmit:true,types:[],target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext'},files:['types.ts']}));
  run('types',[path.join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.json']);report.types=true;
  const browser=await build({stdin:{contents:"import {createCharacterKit} from '@hollow-wake/characters';globalThis.makeCharacterKit=createCharacterKit;",resolveDir:consumer},bundle:true,platform:'browser',format:'iife',target:'es2022',minify:true,write:false,metafile:true});
  // November parity adds school admission, live contribution and relic custody
  // rules to the shared character runtime. Measured October/November browser
  // compositions are 267021/274816 bytes; retain a bounded 272 KiB allowance.
  // See docs/prototype-parity.md. This is transfer size, not a device budget.
  report.browserBudgetBytes=272*1024;
  report.browserBytes=browser.outputFiles[0].contents.length;assert(report.browserBytes<=report.browserBudgetBytes,'Character browser composition exceeded 272 KiB');assert(browser.metafile.inputs);
  for(const name of ['installed','fresh-installed']){const result=JSON.parse(run(name,['consumer.mjs','original.json.gz']));report.runs.push(result);}
  assert.deepEqual(report.runs[0],report.runs[1]);
  if(!development){
    const faults=[
      ['stale-publication','character-session','pending && pending.before === this.#current','pending'],
      ['uid-floor','character-session',"need(item.uid < data.nextUid, 'character-uid-floor');",''],
      ['source-order','character-session','if (!previous && data.sourceOrder !== undefined)','if (false)'],
      ['retained-identity','character-live','if (inst)','if (false)'],
      ['grant-investment','character-live','p.updateGrant(inst, edit.state);',''],
    ];report.faults=[];
    for(const[name,module,needle,replacement]of faults){
      const file=path.join(dist,module+'.js'),source=fs.readFileSync(file,'utf8');assert.equal(source.split(needle).length,2,name+' target changed');fs.writeFileSync(file,source.replace(needle,replacement));
      try{let detected=false;try{run('fault-'+name,['consumer.mjs','original.json.gz']);}catch{detected=logs['fault-'+name]?.stderr?.includes('ERR_ASSERTION');}assert(detected,name+' was not detected by assertions');report.faults.push(name);}
      finally{fs.writeFileSync(file,source);}
    }
    assert.deepEqual(JSON.parse(run('restored',['consumer.mjs','original.json.gz'])),report.runs[0]);
  }
  report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
  report.inputsUnchanged=Object.entries(report.sources).every(([file,digest])=>sha256(fs.readFileSync(path.join(root,file)))===digest);report.passed&&=report.inputsUnchanged;
  for(const link of links){assert(fs.lstatSync(link).isSymbolicLink());if(process.platform==='win32')fs.rmdirSync(link);else fs.unlinkSync(link);}
  assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;
  const compressed=gzipSync(JSON.stringify(logs),{level:9});fs.writeFileSync(path.join(owned,'m2-session'+(development?'-development':'')+'.logs.json.gz'),compressed);report.logsSha256=sha256(compressed);writeJSON(path.join(owned,'m2-session'+(development?'-development':'')+'.json'),report);
}
assert(report.passed,report.failure);console.log({passed:true,...report.runs[0],removedModules:report.removed.length,cleaned:report.cleaned});
