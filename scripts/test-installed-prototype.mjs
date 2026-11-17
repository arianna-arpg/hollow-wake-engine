import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {build} from 'esbuild';
import {buildNodeGodotExample} from './build-node-godot.mjs';import {readPrototypeContent} from './prototype-content.mjs';
import {root,sha256,writeJSON} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';import {readScope} from './combat-inventory-scope-tools.mjs';
const parent=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(parent,'parity-installed-owned-')),consumer=path.join(work,'consumer');
const report={passed:false,removed:[],runs:[]};
const run=args=>{const r=spawnSync(process.execPath,args,{cwd:consumer,windowsHide:true,encoding:'utf8',timeout:600000,maxBuffer:4*1024*1024,
 env:{...process.env,NODE_PATH:'',TEMP:work,TMP:work,TMPDIR:work,NODE_COMPILE_CACHE:path.join(work,'compile-cache'),NPM_CONFIG_CACHE:path.join(work,'npm-cache'),NPM_CONFIG_OFFLINE:'true',NPM_CONFIG_UPDATE_NOTIFIER:'false'}});
 assert(!r.error&&r.status===0,(r.stdout??'').slice(-1500)+(r.stderr??String(r.error)).slice(0,5000));return r.stdout;};
try{
 report.distribution=await buildNodeGodotExample(consumer,readPrototypeContent());run([npmCli(),'install','--offline','--ignore-scripts','--no-audit','--no-fund']);
 const scope=readScope(),remove=new Set(scope.extensionRoots),dist=path.join(consumer,'node_modules/@hollow-wake/engine/dist');
 for(const row of Object.values(scope.exports))if(row.classification==='optional-extension'&&row.module.endsWith('.js'))remove.add(path.basename(row.module,'.js'));
 for(const name of remove)for(const suffix of ['.js','.d.ts','.js.map','.d.ts.map']){const file=path.join(dist,name+suffix);assert.equal(path.dirname(file),dist);
  if(fs.existsSync(file)){assert(!fs.lstatSync(file).isSymbolicLink());fs.unlinkSync(file);report.removed.push(path.basename(file));}}
 for(const name of ['combat','interactions','layers-v2','summons-v5','rules-v2','terminal','corpse-rites','relocation','host','character-v2']){
  const directory=path.join(root,'baseline/prototype-parity'),accepted=JSON.parse(fs.readFileSync(path.join(directory,name+'-acceptance.json'))),bytes=fs.readFileSync(path.join(directory,name+'.json.gz'));
  assert.equal(sha256(bytes),accepted.compressedSha256);fs.writeFileSync(path.join(consumer,name+'.json.gz'),bytes);
 }
 for(const name of ['installed','replay'])fs.copyFileSync(path.join(root,'test/prototype-parity',name+'.mjs'),path.join(consumer,name+'.mjs'));
 await build({entryPoints:[path.join(root,'test/combat-empty-space.mjs')],outfile:path.join(consumer,'space.mjs'),bundle:true,platform:'neutral',format:'esm',target:'es2022'});
 fs.copyFileSync(path.join(root,'test/node-godot/types.ts'),path.join(consumer,'types.ts'));
 fs.writeFileSync(path.join(consumer,'tsconfig.json'),JSON.stringify({compilerOptions:{strict:true,noEmit:true,types:[],target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext'},files:['types.ts']}));
 run([path.join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.json']);report.types=true;
 const browser=await build({absWorkingDir:consumer,stdin:{contents:"export {createCharacterKit} from '@hollow-wake/characters';",resolveDir:consumer},
  bundle:true,minify:true,platform:'browser',format:'esm',target:'es2022',write:false});
 report.browserBytes=browser.outputFiles[0].contents.length;report.browserBudgetBytes=272*1024;
 assert(report.browserBytes<=report.browserBudgetBytes,'Current character browser closure exceeds the reviewed bound');
 for(let i=0;i<2;i++)report.runs.push(JSON.parse(run(['installed.mjs'])));
 assert.deepEqual(report.runs[0],report.runs[1]);report.passed=true;console.log(JSON.stringify({passed:true,...report.runs[0],removedModules:report.removed.length}));
}finally{assert.equal(path.dirname(fs.realpathSync(work)),parent);fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;writeJSON(path.join(parent,'parity-installed.json'),report);}
