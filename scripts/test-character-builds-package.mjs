import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {gzipSync,gunzipSync} from 'node:zlib';
import {build} from 'esbuild';import {root,sha256,verifyReference} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';import {buildCharacterBuilds} from './compile-character-builds.mjs';
const owned=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(owned,'character-build-package-owned-')),consumer=path.join(work,'consumer');
const logs={},report={passed:false,contracts:28,faults:[],sources:{},game:{runs:[]}};
const inputs=['src/character-builds.ts','adapters/embedded/character-builds.mjs','adapters/embedded/character-build-helpers.mjs','scripts/compile-character-builds.mjs',
 'scripts/test-character-builds-package.mjs','test/character-builds.test.mjs','test/character-build-commands.test.mjs','test/character-build-fixture.mjs','test/character-adoption.test.mjs','test/character-adoption-game.ts','test/character-build-retention.mjs','test/character-builds-game.ts','package.json','package-lock.json','baseline/source-lock.json'];
const run=(name,args,cwd=consumer,timeout=240000)=>{const child=spawnSync(process.execPath,args,{cwd,encoding:'utf8',windowsHide:true,timeout,maxBuffer:12*1024*1024,
 env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_PATH:'',NODE_COMPILE_CACHE:path.join(work,'compile-cache')}});logs[name]=(child.stdout??'')+'\n'+(child.stderr??'');assert(!child.error&&!child.signal,name+': '+child.error);return child;};
const success=(name,args,cwd)=>{const child=run(name,args,cwd);assert.equal(child.status,0,logs[name].slice(-10000));return child;};
const contracts=(name,file='contracts.test.mjs')=>{success(name,['--test',file]);assert(new RegExp('(?:#|ℹ) pass '+report.contracts+'\\b').test(logs[name]));};
try{
 for(const file of inputs)report.sources[file]=sha256(fs.readFileSync(path.join(root,file)));fs.mkdirSync(consumer);
 const factory=path.join(work,'factory'),compiled=await buildCharacterBuilds(factory);report.factory=compiled.manifest;
 const pack=dir=>{const name=dir===root?'pack-core':'pack-factory';success(name,[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work,'--cache',path.join(work,'npm-cache')],dir);
  const file=path.join(work,JSON.parse(logs[name])[0].filename);return{file,sha256:sha256(fs.readFileSync(file))};};
 const coreArchive=pack(root),factoryArchive=pack(factory);report.archiveSha256=coreArchive.sha256;report.factoryArchiveSha256=factoryArchive.sha256;
 fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
 success('install',[npmCli(),'install',coreArchive.file,factoryArchive.file,'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(work,'npm-cache')]);
 const entries={'character-builds':'character/builds','stat-rules':'','passive-grants':'passives/grants','gem-residence':'inventory/gems'};
 const installedImports=text=>{for(const[file,entry]of Object.entries(entries))text=text.replaceAll("'../dist/"+file+".js'","'@hollow-wake/engine"+(entry?'/'+entry:'')+"'");return text;};
 let contract=installedImports(fs.readFileSync(path.join(root,'test/character-builds.test.mjs'),'utf8'));
 const commands=installedImports(fs.readFileSync(path.join(root,'test/character-build-commands.test.mjs'),'utf8'));
 let adoption=installedImports(fs.readFileSync(path.join(root,'test/character-adoption.test.mjs'),'utf8'));
 let fixture=installedImports(fs.readFileSync(path.join(root,'test/character-build-fixture.mjs'),'utf8'));
 fs.writeFileSync(path.join(consumer,'character-build-fixture.mjs'),fixture);
 fs.writeFileSync(path.join(consumer,'adoption.test.mjs'),adoption);
 fs.writeFileSync(path.join(consumer,'commands.test.mjs'),commands);
 fs.writeFileSync(path.join(consumer,'contracts.test.mjs'),"import './adoption.test.mjs';\nimport './commands.test.mjs';\n"+contract);contracts('installed');
 fs.copyFileSync(path.join(root,'test/character-build-retention.mjs'),path.join(consumer,'retention-course.mjs'));
 fs.writeFileSync(path.join(consumer,'retention.mjs'),"import {setup} from './character-build-fixture.mjs';\nimport {verifyBuildRetention} from './retention-course.mjs';console.log(JSON.stringify(await verifyBuildRetention(setup,process.argv[2]??'open')));\n");
 report.retention={runs:[]};
 for(let n=0;n<2;n++){success('retention-'+n,['--expose-gc','retention.mjs']);report.retention.runs.push(JSON.parse(logs['retention-'+n]));}
 assert.deepEqual(report.retention.runs[0],report.retention.runs[1]);
 report.adoptionRetention={runs:[]};for(let n=0;n<2;n++){success('adoption-retention-'+n,['--expose-gc','retention.mjs','adopt']);report.adoptionRetention.runs.push(JSON.parse(logs['adoption-retention-'+n]));}
 assert.deepEqual(report.adoptionRetention.runs[0],report.adoptionRetention.runs[1]);
 fs.writeFileSync(path.join(consumer,'browser-entry.mjs'),"export {CharacterBuilds} from '@hollow-wake/engine/character/builds';export {StatRules} from '@hollow-wake/engine';export {PassiveGrants} from '@hollow-wake/engine/passives/grants';export {packGrantState} from '@hollow-wake/engine/inventory/gems';export {createCharacterBuilds} from '@hollow-wake/character-builds';");
 const bundled=await build({entryPoints:[path.join(consumer,'browser-entry.mjs')],bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,metafile:true,write:false});
 assert(Object.values(bundled.metafile.outputs).every(out=>!out.imports.length));report.browserBytes=bundled.outputFiles[0].contents.length;assert(report.browserBytes<=256*1024);
 fs.writeFileSync(path.join(consumer,'browser-built.mjs'),bundled.outputFiles[0].contents);
 const browserImports=text=>{for(const entry of Object.values(entries))text=text.replaceAll("'@hollow-wake/engine"+(entry?'/'+entry:'')+"'","'./browser-built.mjs'");return text.replaceAll("'./character-build-fixture.mjs'","'./browser-fixture.mjs'");};
 fs.writeFileSync(path.join(consumer,'browser-fixture.mjs'),browserImports(fixture));
 fs.writeFileSync(path.join(consumer,'browser-adoption.test.mjs'),browserImports(adoption));
 fs.writeFileSync(path.join(consumer,'browser-commands.test.mjs'),browserImports(commands));
 fs.writeFileSync(path.join(consumer,'browser-contracts.mjs'),"import './browser-adoption.test.mjs';\nimport './browser-commands.test.mjs';\n"+browserImports(contract));
 const hostile="Math.random=()=>{throw Error('ambient RNG')};globalThis.fetch=()=>{throw Error('network')};for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw Error(key)}});";
 fs.writeFileSync(path.join(consumer,'hostile.test.mjs'),hostile+"await import('./browser-contracts.mjs');");contracts('browser','hostile.test.mjs');
 fs.writeFileSync(path.join(consumer,'factory-smoke.mjs'),"import fs from 'node:fs';import assert from 'node:assert/strict';const pack=JSON.parse(fs.readFileSync(new URL('./node_modules/@hollow-wake/character-builds/builds.json',import.meta.url)));"+hostile+`
 const {createCharacterBuilds}=await import('./browser-built.mjs');const builds=createCharacterBuilds(pack),def=pack.definitions.classes.find(c=>c.id==='magician');
 const input={level:1,classId:def.id,baseAttrs:def.attributes,allocated:[],choices:{},grafts:{},equipped:{},containers:{},features:[],relicEnabled:true,relicEmpowerment:0,learned:[]};
 const before=JSON.stringify(input),first=builds.open(input,Array(8).fill(null)),next=builds.rebuild(first,{...input,level:2});
 assert.equal(builds.stat(next,'life')-builds.stat(first,'life'),pack.definitions.progression.lifePerLevel);assert.equal(JSON.stringify(input),before);
 assert.deepEqual(builds.investment(next),{learned:[],grants:[]});console.log('standalone authored factory passed');`);
 success('factory-browser',['factory-smoke.mjs']);report.factoryBrowser=true;
 fs.writeFileSync(path.join(consumer,'types.ts'),`import {createCharacterBuilds} from '@hollow-wake/character-builds';
 import type {CharacterBuild,CharacterBuildInput,CharacterBuildService,CharacterBuildAdoption} from '@hollow-wake/engine/character/builds';
 declare const input:CharacterBuildInput;const builds:CharacterBuildService=createCharacterBuilds({});const first=builds.open(input,[]);const next=builds.rebuild(first,input);
 builds.read(next);builds.investment(next);builds.lineages(next);builds.stat(next,'life');
 builds.rebuild(first,input,{replaceLearned:['bolt']});builds.canSocket(first,'bolt','repeat',{mode:'chain'});
 // @ts-expect-error replacement identities must be strings
 builds.rebuild(first,input,{replaceLearned:[1]});
 // @ts-expect-error rolled support choices must be string identities
 builds.canSocket(first,'bolt','repeat',{mode:1});
 // @ts-expect-error compatibility queries need an owned build handle
 builds.canSocket(input,'bolt','repeat');
 // @ts-expect-error opaque handles cannot be constructed
 const forged:CharacterBuild={};
 // @ts-expect-error a save is not a continuation
 builds.rebuild(input,input);
 // @ts-expect-error binding values must be IDs or null
 builds.open(input,[1]);
 // @ts-expect-error unknown command field
 builds.rebuild(first,input,{clock:1});
 // @ts-expect-error a live world is not a durable input
 builds.open({...input,world:{}},[]);
 // @ts-expect-error lineage entries are read-only
 builds.lineages(first).clear();
 // @ts-expect-error grant host identities are numeric
 builds.rebuild(first,input,{grants:[{skillId:'x',hostUid:'1',state:{sockets:[]}}]});
 // @ts-expect-error learned investment is an ordered list
 builds.open({...input,learned:new Map()},[]);
 declare const adoption:CharacterBuildAdoption;builds.read(builds.adopt(input,[],adoption));
 // @ts-expect-error source history contains identifiers
 builds.adopt(input,[],{...adoption,sourceOrder:[1]});
 // @ts-expect-error every observed grant needs its current level
 builds.adopt(input,[],{...adoption,grants:[{skillId:'x',state:{sockets:[]}}]});
 // @ts-expect-error numeric granting-host identity
 builds.adopt(input,[],{...adoption,grants:[{skillId:'x',level:1,hostUid:'1',state:{sockets:[]}}]});
 // @ts-expect-error a live actor is not part of the durable observation contract
 builds.adopt(input,[],{...adoption,liveActor:{}});
 // @ts-expect-error adoption requires explicit observations
 builds.adopt(input,[]);
 `);
 success('types',[path.join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','types.ts']);report.types=16;
 const installed=path.join(consumer,'node_modules/@hollow-wake/engine'),module=path.join(installed,'dist/character-builds.js'),original=fs.readFileSync(module,'utf8');report.moduleBytes=Buffer.byteLength(original);assert(report.moduleBytes<=16*1024);
 const faults=[
  ['shared-sheet','prior.sheet.fork()','prior.sheet'],
  ['cold-existing-grant','const old = prior?.frame ?? empty;','const old = empty;'],
  ['shared-companion','inst: cloneSkill(row.inst)','inst: row.inst'],
  ['lost-learned-update','const def = inst.def;\n                p.updateLearned(inst, payload);','const def = inst.def;\n                void payload;'],
  ['lost-grant-edit','p.updateGrant(inst, edit.state);','void edit;'],
  ['lost-learned-lock','inst.locked = true;','delete inst.locked;'],
  ['lost-learned-replacement','replacements?.has(payload.skillId) ? undefined : frame.meta.knownSkills.get(payload.skillId)','frame.meta.knownSkills.get(payload.skillId)'],
  ['lost-replacement-bar','frame.actor.skills[n] = known.get(id) ?? null;','frame.actor.skills[n] = null;'],
  ['lost-support-rolls','return fits(def, inst, rolled);','return fits(def, inst);'],
  ['lost-lineage','lineage ?? Object.freeze({})','Object.freeze({})'],
  ['ignore-replaced-edit',"throw Error('Edited grant no longer belongs to this build');",'void inst;'],
  ['skip-slot-rebuild','// Slot grafts depend on the requested positions. Re-evaluate them on the\n            // owned graph; this second pass has no live effect callbacks.\n            this.#equipment.derive(frame);','void frame;'],
  ['cold-adopted-grant','p.updateGrant(inst, row.state);','p.equipment.restoreGrant(inst, row.state);'],
  ['truncate-adopted-sockets',"throw Error('Stale adopted grant sockets');",'void row;'],
  ['cold-adopted-learned','if (adoption)\n                    p.updateLearned(inst, payload);','void payload;'],
  ['reordered-live-sources','for (const id of adoption.sourceOrder)\n                sheet.setSource(id, []);','for (const id of [...adoption.sourceOrder].reverse())\n                sheet.setSource(id, []);'],
  ['ignore-observed-grant-level',' || frame.seat.grantedInsts?.get(row.skillId)?.level !== row.level',''],
  ['allow-missing-adopted-grant',"throw Error('Stale adopted grant set');",'void adoptedGrants;'],
  ['allow-missing-adopted-companion',"throw Error('Stale adopted companions');",'void companions;'],
 ];
 for(const[name,needle,replacement]of faults){
  assert.equal(original.split(needle).length,2,name+' target changed');fs.writeFileSync(module,original.replace(needle,replacement));
  try{const child=run('fault-'+name,['--test','contracts.test.mjs']);assert.equal(child.status,1,name+' escaped');assert(logs['fault-'+name].includes('ERR_ASSERTION'),name+' did not reach an assertion');report.faults.push({name,detected:true,logSha256:sha256(logs['fault-'+name])});}
  finally{fs.writeFileSync(module,original);}
 }
 contracts('restored');report.restored=true;
 const retain='frame: completedFrame(frame)';assert.equal(original.split(retain).length,2,'Retention fault target changed');
 fs.writeFileSync(module,original.replace(retain,'frame'));
 try{const child=run('fault-retained-draft',['--expose-gc','retention.mjs']);assert.equal(child.status,1,'Retained draft escaped');assert(logs['fault-retained-draft'].includes('ERR_ASSERTION'));
  const adopted=run('fault-retained-adoption',['--expose-gc','retention.mjs','adopt']);assert.equal(adopted.status,1,'Retained adopted draft escaped');assert(logs['fault-retained-adoption'].includes('ERR_ASSERTION'));
  report.faults.push({name:'retained-draft-callbacks',detected:true,logSha256:sha256(logs['fault-retained-draft']),adoptionLogSha256:sha256(logs['fault-retained-adoption'])});}
 finally{fs.writeFileSync(module,original);}
 success('retention-restored',['--expose-gc','retention.mjs']);assert.deepEqual(JSON.parse(logs['retention-restored']),report.retention.runs[0]);report.retention.restored=true;
 success('adoption-retention-restored',['--expose-gc','retention.mjs','adopt']);assert.deepEqual(JSON.parse(logs['adoption-retention-restored']),report.adoptionRetention.runs[0]);report.adoptionRetention.restored=true;
 const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));verifyReference(path.join(root,'.reference'),lock);
 const compileGame=async(source,name)=>{const entry=path.join(work,name+'.cjs'),game=await build({stdin:{contents:fs.readFileSync(path.join(root,source),'utf8'),loader:'ts',resolveDir:path.join(root,'.reference/balance')},bundle:true,platform:'node',format:'cjs',target:'es2022',outfile:entry,metafile:true,
  plugins:[{name:'installed-character-build',setup(b){b.onResolve({filter:/^authored\//},a=>({path:path.join(consumer,'node_modules/@hollow-wake/character-builds',a.path==='authored/factory'?'index.js':'builds.json')}));}}]});
 for(const file of Object.keys(game.metafile.inputs))if(file.startsWith('.reference/'))assert.equal(sha256(fs.readFileSync(path.join(root,file))),lock.files[file.slice('.reference/'.length)],file);return entry;};
 const entry=await compileGame('test/character-builds-game.ts','course');
 const expected={};for(const[name,field]of [['character-builds','rows'],['character-build-classes','classes']]){
  const base=path.join(root,'baseline',name),accepted=JSON.parse(fs.readFileSync(path.join(base,'acceptance.json'))),bytes=gunzipSync(fs.readFileSync(path.join(base,'observations.json.gz')));
  assert.equal(sha256(bytes),accepted.sha256);expected[field]=JSON.parse(bytes).rows;for(const file of ['acceptance.json','observations.json.gz'])report.sources['baseline/'+name+'/'+file]=sha256(fs.readFileSync(path.join(base,file)));
 }
 for(let n=0;n<2;n++){
  const output=path.join(work,'observations-'+n+'.json');success('game-'+n,[entry,output],work);const bytes=fs.readFileSync(output),observed=JSON.parse(bytes);
  assert.deepEqual(observed.rows.map(({label,observation})=>({label,observation})),expected.rows);assert.deepEqual(observed.classes,expected.classes);
  report.game.runs.push({sha256:sha256(bytes)});
 }
 assert.equal(report.game.runs[0].sha256,report.game.runs[1].sha256);report.game.observations=93;
 const adoptionBase=path.join(root,'baseline/character-adoption'),accepted=JSON.parse(fs.readFileSync(path.join(adoptionBase,'acceptance.json'))),adoptedBytes=gunzipSync(fs.readFileSync(path.join(adoptionBase,'observations.json.gz')));
 assert.equal(sha256(adoptedBytes),accepted.sha256);for(const file of ['acceptance.json','observations.json.gz'])report.sources['baseline/character-adoption/'+file]=sha256(fs.readFileSync(path.join(adoptionBase,file)));
 const adoptedEntry=await compileGame('test/character-adoption-game.ts','adoption');report.adoption={observations:5,contracts:18,runs:[]};
 for(let n=0;n<2;n++){const output=path.join(work,'adoption-'+n+'.json');success('adoption-'+n,[adoptedEntry,output],work);const bytes=fs.readFileSync(output),observed=JSON.parse(bytes);
  assert.equal(observed.rows.length,18);assert.equal(JSON.stringify({original:observed.original}),adoptedBytes.toString());report.adoption.runs.push({sha256:sha256(bytes)});}
 assert.equal(report.adoption.runs[0].sha256,report.adoption.runs[1].sha256);report.passed=true;
}catch(error){report.error=String(error);process.exitCode=1;}
finally{
 try{report.inputsUnchanged=Object.entries(report.sources).every(([f,h])=>sha256(fs.readFileSync(path.join(root,f)))===h);assert(report.inputsUnchanged);}
 catch(error){report.passed=false;report.error=String(error);process.exitCode=1;}
 assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;
 const compressed=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(compressed);fs.writeFileSync(path.join(owned,'character-build-package.logs.json.gz'),compressed);
 fs.writeFileSync(path.join(owned,'character-build-package.json'),JSON.stringify(report,null,2)+'\n');
}
console.log({passed:report.passed,contracts:report.contracts,faults:report.faults,game:report.game,browserBytes:report.browserBytes,moduleBytes:report.moduleBytes,cleaned:report.cleaned,error:report.error});
