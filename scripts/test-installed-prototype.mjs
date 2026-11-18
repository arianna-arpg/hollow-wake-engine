import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {build} from 'esbuild';
import {buildNodeGodotExample} from './build-node-godot.mjs';import {readPrototypeContent} from './prototype-content.mjs';
import {root,sha256,writeJSON} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';import {readScope} from './combat-inventory-scope-tools.mjs';
import {withPrototypeRevision,readRevisionFixture} from './prototype-revision-tools.mjs';
const revision=process.argv.includes('--revision');
const withProfile=revision?withPrototypeRevision:async use=>use(readPrototypeContent());
await withProfile(async profile=>{
const parent=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(parent,'parity-installed-owned-')),consumer=path.join(work,'consumer');
const report={passed:false,removed:[],runs:[]};
const run=args=>{const r=spawnSync(process.execPath,args,{cwd:consumer,windowsHide:true,encoding:'utf8',timeout:600000,maxBuffer:4*1024*1024,
 env:{...process.env,NODE_PATH:'',TEMP:work,TMP:work,TMPDIR:work,NODE_COMPILE_CACHE:path.join(work,'compile-cache'),NPM_CONFIG_CACHE:path.join(work,'npm-cache'),NPM_CONFIG_OFFLINE:'true',NPM_CONFIG_UPDATE_NOTIFIER:'false'}});
 assert(!r.error&&r.status===0,(r.stdout??'').slice(-1500)+(r.stderr??String(r.error)).split('\n').filter(line=>line.length<5000).join('\n').slice(-6000));return r.stdout;};
try{
 report.distribution=await buildNodeGodotExample(consumer,profile);
 if(revision){
  const repeated=await withPrototypeRevision(second=>buildNodeGodotExample(path.join(work,'repeated-distribution'),second));
  assert.deepEqual(repeated,report.distribution,'Package bytes depend on disposable source paths');report.reproduciblePackages=true;
 }
 run([npmCli(),'install','--offline','--ignore-scripts','--no-audit','--no-fund']);
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
 if(revision){
  fs.copyFileSync(path.join(root,'test/prototype-revision/installed.mjs'),path.join(consumer,'revision.mjs'));
  writeJSON(path.join(consumer,'revision-observations.json'),readRevisionFixture('observations'));
  fs.copyFileSync(path.join(root,'baseline/prototype-revision/acceptance.json'),path.join(consumer,'revision-acceptance.json'));
  const itemAccepted=JSON.parse(fs.readFileSync(path.join(root,'baseline/prototype-revision/items-acceptance.json'))),itemBytes=fs.readFileSync(path.join(root,'baseline/prototype-revision/items.json.gz'));
  assert.equal(sha256(itemBytes),itemAccepted.compressedSha256);assert.equal(itemAccepted.sourceCommit,profile.lock.commit);
  assert.equal(sha256(fs.readFileSync(path.join(root,itemAccepted.observer))),itemAccepted.observerSha256);
  fs.writeFileSync(path.join(consumer,'revision-items.json.gz'),itemBytes);
  fs.appendFileSync(path.join(consumer,'types.ts'),"\nimport {createInventoryInspector} from '@hollow-wake/characters/inspection';\nconst inspection=createInventoryInspector({},{});\ninspection.card('skills','decoy','full');\ninspection.treeNode('decoy','quiet_departure');\ninspection.stat('life');\ninspection.triggerReferences([{stat:'proc_test',kind:'flat',value:1}]);\ninspection.item({});\n// @ts-expect-error closed detail modes\ninspection.stat('life','extra');\n// @ts-expect-error no campaign UI in combat inspection\ninspection.card('quests','x');\n");
 }
 fs.writeFileSync(path.join(consumer,'tsconfig.json'),JSON.stringify({compilerOptions:{strict:true,noEmit:true,types:[],target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext'},files:['types.ts']}));
 run([path.join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.json']);report.types=true;
 const browser=await build({absWorkingDir:consumer,stdin:{contents:"export {createCharacterKit} from '@hollow-wake/characters';",resolveDir:consumer},
  bundle:true,minify:true,platform:'browser',format:'esm',target:'es2022',write:false,metafile:true});
 report.browserBytes=browser.outputFiles[0].contents.length;report.browserBudgetBytes=272*1024;
 assert(report.browserBytes<=report.browserBudgetBytes,'Current character browser closure exceeds the reviewed bound');
 if(revision){
  assert(!Object.keys(browser.metafile.inputs).some(file=>/characters\/inspection\.(js|json)$/.test(file)),'Default character entry eagerly loads inspection');
  const inspection=await build({absWorkingDir:consumer,stdin:{contents:"export {createInventoryInspector} from '@hollow-wake/characters/inspection';",resolveDir:consumer},bundle:true,minify:true,platform:'browser',format:'esm',target:'es2022',write:false,metafile:true});
  report.inspectionBrowserBytes=inspection.outputFiles[0].contents.length;report.inspectionBrowserBudgetBytes=48*1024;
  assert(report.inspectionBrowserBytes<=report.inspectionBrowserBudgetBytes);assert(Object.values(inspection.metafile.outputs).every(o=>o.imports.length===0));
  assert(!Object.keys(inspection.metafile.inputs).some(file=>file.endsWith('inspection.json')),'Inspection data must load explicitly');
 }
 for(let i=0;i<2;i++)report.runs.push(JSON.parse(run(['installed.mjs'])));
 assert.deepEqual(report.runs[0],report.runs[1]);report.passed=true;console.log(JSON.stringify({passed:true,...report.runs[0],removedModules:report.removed.length}));
 if(revision){report.passed=false;report.revision=[];for(let i=0;i<2;i++)report.revision.push(JSON.parse(run(['revision.mjs'])));assert.deepEqual(report.revision[0],report.revision[1]);report.passed=true;console.log(JSON.stringify(report.revision[0]));}
}finally{assert.equal(path.dirname(fs.realpathSync(work)),parent);fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;writeJSON(path.join(parent,revision?'revision-installed.json':'parity-installed.json'),report);}
});
