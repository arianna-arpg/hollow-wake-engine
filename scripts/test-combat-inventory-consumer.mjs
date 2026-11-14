import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {gzipSync} from 'node:zlib';
import {root,sha256,writeJSON} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';
import {buildCharacterBuilds} from './compile-character-builds.mjs';import {checkScope,readScope} from './combat-inventory-scope-tools.mjs';

const scope=readScope(),audit=checkScope(),owned=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(owned,'combat-inventory-consumer-owned-'));
const report={passed:false,sources:{...audit.sources},runs:[],removedModules:[],faults:[],devicePerformanceQualified:false,completeBuildCombatComposition:false},logs={};
const consumer=path.join(work,'consumer');
const run=(name,args,cwd=consumer)=>{const child=spawnSync(process.execPath,args,{cwd,encoding:'utf8',windowsHide:true,timeout:300000,maxBuffer:12*1024*1024,
 env:{...process.env,NODE_PATH:'',TEMP:work,TMP:work,TMPDIR:work,NODE_COMPILE_CACHE:path.join(work,'compile-cache'),NPM_CONFIG_CACHE:path.join(work,'npm-cache'),NPM_CONFIG_OFFLINE:'true',NPM_CONFIG_UPDATE_NOTIFIER:'false'}});
 logs[name]={stdout:child.stdout,stderr:child.stderr};assert(!child.error&&!child.signal,name+': '+child.error);return child;};
const success=(name,args,cwd)=>{const child=run(name,args,cwd);assert.equal(child.status,0,name+': '+child.stderr);return child.stdout;};
try{
 for(const f of ['package.json','package-lock.json','docs/combat-inventory-capabilities.json','scripts/combat-inventory-scope-tools.mjs','scripts/test-combat-inventory-consumer.mjs','test/combat-inventory/consumer.mjs','scripts/compile-character-builds.mjs'])report.sources[f]=sha256(fs.readFileSync(path.join(root,f)));
 fs.mkdirSync(consumer);const factory=path.join(work,'factory');report.factory=(await buildCharacterBuilds(factory)).manifest;
 const pack=(name,cwd)=>{const [row]=JSON.parse(success(name,[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work],cwd));return{row,file:path.join(work,row.filename)};};
 const core=pack('pack-core',root),builds=pack('pack-builds',factory);
 assert(core.row.files.every(row=>!/^(?:src|test|scripts|baseline|\.reference|\.artifacts|node_modules)\//.test(row.path)),'Development source leaked into the archive');
 report.archives={engine:sha256(fs.readFileSync(core.file)),builds:sha256(fs.readFileSync(builds.file))};
 fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
 success('install',[npmCli(),'install',core.file,builds.file,'--offline','--ignore-scripts','--no-audit','--no-fund']);
 const installed=fs.realpathSync(path.join(consumer,'node_modules/@hollow-wake/engine')),dist=path.join(installed,'dist');
 const remove=new Set(scope.extensionRoots);
 for(const row of Object.values(scope.exports))if(row.classification==='optional-extension'&&row.module.endsWith('.js'))remove.add(path.basename(row.module,'.js'));
 // Remove only files in this owned installed copy. The original archive and
 // repository outputs remain intact. Missing declarations are removed too.
 for(const name of remove){
  assert(/^[a-z0-9-]+$/.test(name));
  for(const suffix of ['.js','.d.ts','.js.map','.d.ts.map']){
   const file=path.join(dist,name+suffix);assert.equal(path.dirname(file),dist);
   if(fs.existsSync(file)){assert(!fs.lstatSync(file).isSymbolicLink());fs.unlinkSync(file);report.removedModules.push('dist/'+name+suffix);}
   assert(!fs.existsSync(file));
  }
 }
 for(const name of ['src','baseline','.reference','scripts'])assert(!fs.existsSync(path.join(installed,name)));
 fs.copyFileSync(path.join(root,'test/combat-inventory/consumer.mjs'),path.join(consumer,'run.mjs'));
 let expected;
 for(const name of ['control','fresh-control']){const result=success(name,['run.mjs']);expected??=result;assert.equal(result,expected);report.runs.push(name);report.result=JSON.parse(result.trim());}
 const entry=path.join(dist,'index.js'),original=fs.readFileSync(entry);
 try{
  fs.appendFileSync(entry,"\nimport './account-workshop-session.js';\n");
  const fault=run('hidden-account-import',['run.mjs']);assert.equal(fault.status,1);assert.match(fault.stderr,/ERR_MODULE_NOT_FOUND/);assert.match(fault.stderr,/account-workshop-session/);report.faults.push({name:'hidden-account-import',detected:true});
 }finally{fs.writeFileSync(entry,original);}
 assert.equal(success('restored',['run.mjs']),expected);report.restored=true;report.absentExtensionRoots=[...remove].sort();
 report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(fs.readFileSync(path.join(root,file)))===hash);report.passed&&=report.inputsUnchanged;
 try{assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;}catch(error){report.passed=false;report.cleanupFailure=String(error);}
 const compressed=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(compressed);fs.writeFileSync(path.join(owned,'combat-inventory-consumer.logs.json.gz'),compressed);writeJSON(path.join(owned,'combat-inventory-consumer.json'),report);
}
assert(report.passed,report.failure??report.cleanupFailure);console.log({passed:true,...report.result,removedModules:report.removedModules.length,extensionRoots:report.absentExtensionRoots.length,faults:report.faults.length,cleaned:report.cleaned});
