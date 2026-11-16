import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {buildNodeGodotExample} from './build-node-godot.mjs';import {root,sha256,writeJSON} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';import {readScope} from './combat-inventory-scope-tools.mjs';
const owned=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(owned,'m4-installed-owned-')),consumer=path.join(work,'consumer');
const report={passed:false,node:process.versions.node,platform:process.platform,removed:[],runs:[]};
const run=(args)=>{const r=spawnSync(process.execPath,args,{cwd:consumer,windowsHide:true,encoding:'utf8',timeout:300000,maxBuffer:12*1024*1024,
 env:{...process.env,NODE_PATH:'',TEMP:work,TMP:work,TMPDIR:work,NODE_COMPILE_CACHE:path.join(work,'compile-cache'),NPM_CONFIG_CACHE:path.join(work,'npm-cache'),NPM_CONFIG_OFFLINE:'true',NPM_CONFIG_UPDATE_NOTIFIER:'false'}});
 assert(!r.error&&r.status===0,(r.stdout??'').slice(-3000)+(r.stderr??String(r.error)).slice(-9000));return r.stdout;};
try{
 report.distribution=await buildNodeGodotExample(consumer);run([npmCli(),'install','--offline','--ignore-scripts','--no-audit','--no-fund']);
 const scope=readScope(),remove=new Set(scope.extensionRoots),dist=path.join(consumer,'node_modules/@hollow-wake/engine/dist');
 for(const row of Object.values(scope.exports))if(row.classification==='optional-extension'&&row.module.endsWith('.js'))remove.add(path.basename(row.module,'.js'));
 for(const name of remove)for(const suffix of ['.js','.d.ts','.js.map','.d.ts.map']){const f=path.join(dist,name+suffix);assert.equal(path.dirname(f),dist);if(fs.existsSync(f)){assert(!fs.lstatSync(f).isSymbolicLink());fs.unlinkSync(f);report.removed.push(path.basename(f));}}
 fs.copyFileSync(path.join(root,'test/node-godot/consumer.mjs'),path.join(consumer,'consumer.mjs'));
 fs.copyFileSync(path.join(root,'test/combat-session/locomotion.mjs'),path.join(consumer,'locomotion.mjs'));
 fs.copyFileSync(path.join(root,'test/combat-session/characters.mjs'),path.join(consumer,'characters.mjs'));
 fs.copyFileSync(path.join(root,'test/node-godot/types.ts'),path.join(consumer,'types.ts'));
 fs.writeFileSync(path.join(consumer,'tsconfig.json'),JSON.stringify({compilerOptions:{strict:true,noEmit:true,types:[],target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext'},files:['types.ts']}));
 run([path.join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.json']);report.types=true;
 for(const name of ['combat-frames','combat-families','combat-locomotion','combat-locomotion-airborne','character-session']){const file=path.join(root,'baseline',name,'observations.json.gz'),accepted=JSON.parse(fs.readFileSync(path.join(root,'baseline',name,'acceptance.json')));assert.equal(sha256(fs.readFileSync(file)),accepted.compressedSha256);fs.copyFileSync(file,path.join(consumer,name+'.json.gz'));}
 for(let i=0;i<2;i++)report.runs.push(JSON.parse(run(['consumer.mjs'])));
 assert.deepEqual(report.runs[0],report.runs[1]);report.passed=true;console.log({passed:true,...report.runs[0],removedModules:report.removed.length});
}finally{assert.equal(path.dirname(fs.realpathSync(work)),owned);fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;writeJSON(path.join(owned,'m4-node-godot-installed.json'),report);}
