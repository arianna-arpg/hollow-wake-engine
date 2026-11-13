import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {gzipSync,gunzipSync} from 'node:zlib';import {build,transform} from 'esbuild';
import {root,sha256} from './reference-utils.mjs';import {buildCharacterBuilds} from './compile-character-builds.mjs';
import {craftingPack} from './compile-crafting-content.mjs';import {passivePack} from './compile-passive-content.mjs';
import {equipmentPack} from './compile-item-content.mjs';import {ItemContent} from '../dist/item-rules.js';
import {unlockContentPack} from './compile-unlock-content.mjs';import {memoryRewardPack} from './compile-memory-rewards.mjs';
import {progressionGatePack} from './compile-progression-gates.mjs';
import {buildCharacterTriggerQuery} from './build-character-trigger-query.mjs';
import {patchWorldDelivery} from './character-world-delivery-overlay.mjs';
const defaultFaults=[
 {name:'skip-entry-item-shape',file:'src/complete-account-commands.ts',edits:[['array(value.items);record(value.equipped);array(value.overflow);','record(value.equipped);array(value.overflow);']]},
 {name:'forget-owned-identity-floor',file:'src/complete-account-commands.ts',edits:[['return floor;','return 1;']]},
 {name:'drop-journal',file:'src/account-workshop-core.ts',edits:[['if(journal)journal.push','if(false&&journal)journal.push']]},
 {name:'drop-stale-guard',file:'src/complete-account-commands.ts',edits:[["need(equal(inventory,held.state)&&equal(scope.characterInput,held.character)&&nextUid===held.nextUid,'stale-character-continuation')","need(true,'stale-character-continuation')"]]}
];

/** Shared build/ownership harness. The accepted base course and original
 * observation archives are immutable; optional courses append independent checks. */
export async function runCharacterComposition({name='character-composition',entry='scripts/test-character-composition.mjs',extensions=[],beforeFinish,
 compressedJSON={},extraAliases={},gameHarnesses=[],faults=defaultFaults,reportFields={},timeout=180000,extraSharedModules=[]}={}){
assert(/^[a-z][a-z-]+$/.test(name));
const owned=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(owned,name+'-owned-'));
const read=f=>fs.readFileSync(path.join(root,f)),json=f=>JSON.parse(read(f));
const report={passed:false,sources:{},runs:[],faults:[],expectedObservationsRegenerated:false},logs={};
try{
 const capture=f=>{const bytes=read(f);report.sources[f]=sha256(bytes);return bytes;};
 const acceptance=JSON.parse(capture('baseline/character-composition/acceptance.json'));
 assert(acceptance.originalOnly&&!acceptance.expectedObservationsRegenerated);
 assert.equal(sha256(read('baseline/source-lock.json')),acceptance.sourceLockSha256);
 assert.equal(json('baseline/source-lock.json').commit,acceptance.sourceCommit);
 for(const f of [entry,'scripts/character-composition-runner.mjs','scripts/character-world-delivery-overlay.mjs',
  'scripts/build-character-trigger-query.mjs',
  'scripts/compile-character-builds.mjs','scripts/compile-crafting-content.mjs','scripts/compile-passive-content.mjs','scripts/compile-item-content.mjs',
  'scripts/compile-unlock-content.mjs','scripts/compile-memory-rewards.mjs','scripts/compile-progression-gates.mjs','baseline/source-lock.json','package.json'])capture(f);
 let course=capture('test/character-composition/course.mjs').toString();assert.equal(sha256(course),acceptance.courseSha256);
 if(beforeFinish){assert(/^[a-z][a-zA-Z0-9]*$/.test(beforeFinish));const anchor='  writeFileSync(process.argv[2],JSON.stringify({rows,sqlite:writer.version()})';assert.equal(course.split(anchor).length,2);course=course.replace(anchor,'  await '+beforeFinish+'();\n'+anchor);}
 for(const file of extensions)course+='\n'+capture(file).toString();
 report.courseExtensions=[...extensions];
 const fixtureMeta=acceptance.archives.fixtures,compressed=capture('baseline/character-composition/original-fixtures.json.gz');
 assert.equal(sha256(compressed),fixtureMeta.archiveSha256);const plain=gunzipSync(compressed);assert.equal(sha256(plain),fixtureMeta.sha256);const fixtures=JSON.parse(plain).fixtures;
 for(const[name,row]of Object.entries(fixtures)){assert.equal(sha256(row.utf8),row.sha256);assert(/^[a-z-]+$/.test(name));fs.writeFileSync(path.join(work,name+'.json'),row.utf8);}
 const factory=path.join(work,'factory'),built=await buildCharacterBuilds(factory);report.factory=built.manifest;
 const buildAcceptance=JSON.parse(capture('baseline/character-builds/acceptance.json')),rows=gunzipSync(capture('baseline/character-builds/observations.json.gz'));assert.equal(sha256(rows),buildAcceptance.sha256);
 const investedPair=JSON.parse(rows).rows.find(r=>r.label==='cold-actual-invested-pair').observation.equipped;
 fs.writeFileSync(path.join(work,'content.json'),JSON.stringify({crafting:craftingPack(new ItemContent(built.pack.items)),passives:passivePack(),equipment:equipmentPack(),investedPair,
  progression:{unlocks:unlockContentPack(),memories:memoryRewardPack(),gates:progressionGatePack()}}));
 const trigger=path.join(work,'trigger.mjs');report.trigger=await buildCharacterTriggerQuery(trigger);Object.assign(report.sources,report.trigger.sources);
 const aliases={};const alias=(name,file)=>{aliases['diagnostic/'+name]=path.join(root,file);};
 for(const[name,module]of Object.entries({'world-adapter':'character-world-adapter','pickup-authority':'character-world-located-deliveries',
  'located-owner':'durable-character-located-owner','located-world':'character-world-located-deliveries','spill-placement':'character-spill-placement',
  'delivery-codec':'character-delivery-codec','inventory-operation':'character-inventory-commands','complete-crafting':'crafting-session-complete',
  'complete-cargo':'workshop-complete-cargo','progression-character':'workshop-character-progression','residence-data':'crafting-session-data','grant-data':'crafting-session-data'}))alias(name,'dist/'+module+'.js');
 for(const[name,module]of Object.entries({'pickup-operation':'character-pickup-commands','merge-operation':'character-merge-commands',
  'progression-operation':'character-progression-commands','bar-operation':'character-bar-commands','rack-operation':'character-rack-commands',
  'support-operation':'character-support-commands','typed-account':'complete-account-commands','typed-workshop':'character-workshop-commands'}))alias(name,'dist/'+module+'.js');
 for(const[name,module]of Object.entries({'world-item-publication':'character-world-item-publication.mjs','world-deliveries':'character-world-deliveries-reuse.mjs',
  'world-harness':'character-world-identities-harness.ts','durable-owner':'durable-character-pickup-owner.mjs','group-store':'sqlite-character-group-store.mjs',
  'admission':'character-workshop-adoption.mjs','complete-owner':'character-course-hosts.mjs','account-kernel':'character-course-hosts.mjs',
  'rack-admission':'character-course-hosts.mjs','retained-character':'character-course-hosts.mjs'}))alias(name,'test/character-composition/'+module);
 aliases['diagnostic/trigger-query']=trigger;
 for(const name of [...Object.keys(fixtures),'content'])aliases['diagnostic/'+name]=path.join(work,name+'.json');
 aliases['authored/factory']=path.join(root,'adapters/embedded/character-builds.mjs');aliases['authored/pack']=path.join(factory,'builds.json');
 aliases['hollow-wake-source/skills']=path.join(root,'.reference/src/engine/skills.ts');aliases['hollow-wake-source/minion-families']=path.join(root,'.reference/src/data/minionFamilies.ts');
 for(const[key,row]of Object.entries(json('package.json').exports)){const file=typeof row==='string'?row:row.import;if(file?.endsWith('.js'))aliases['@hollow-wake/engine'+key.slice(1)]=path.join(root,file);}
 const lock=json('baseline/source-lock.json'),worldFile=path.join(root,'.reference/src/engine/world.ts');
 const world=read('.reference/src/engine/world.ts').toString();assert.equal(sha256(world),lock.files['src/engine/world.ts']);
 const overrides=new Map(),externalAliases=new Set();
 for(const[key,file]of Object.entries(extraAliases))aliases[key]=path.join(root,file);
 for(const[key,file]of Object.entries(compressedJSON)){
  assert(/^[a-z][a-z-]+$/.test(key));const target=path.join(work,key+'.json');fs.writeFileSync(target,gunzipSync(capture(file)));
  const alias='diagnostic/'+key;aliases[alias]=target;externalAliases.add(alias);
 }
 const originalHarnesses=new Set(['test/character-composition/character-world-identities-harness.ts',...gameHarnesses].map(file=>path.join(root,file)));
 const compile=async name=>{
  const outfile=path.join(work,name+'.cjs');
  const result=await build({stdin:{contents:course,loader:'js',resolveDir:path.join(root,'test/character-composition')},bundle:true,platform:'node',format:'cjs',target:'es2022',outfile,metafile:true,logLevel:'silent',
   plugins:[{name:'direct-character-course',setup(b){
    b.onResolve({filter:/.*/},a=>{
     if(aliases[a.path])return{path:aliases[a.path],external:externalAliases.has(a.path)};
    });
    b.onLoad({filter:/\.[cm]?[jt]s$/},a=>{
     const file=path.resolve(a.path);let contents,loader=file.endsWith('.ts')?'ts':'js',resolveDir=path.dirname(file);
     if(file===worldFile)contents=patchWorldDelivery(world);
     else if(originalHarnesses.has(file)){contents=fs.readFileSync(file,'utf8');resolveDir=path.join(root,'.reference/balance');}
     else if(overrides.has(file))contents=overrides.get(file);
     return contents===undefined?undefined:{contents,loader,resolveDir};
    });
   }}]});
  const inputs=Object.keys(result.metafile.inputs);
  for(const name of ['account-workshop-core.js','character-workshop-boundary.js','skill-merge-execution.js','crafting-session-core.js','crafting-session-data.js','character-world-located-deliveries.js',...extraSharedModules])
   assert.equal(inputs.filter(f=>f.endsWith('/'+name)).length,1,'Shared module duplicated: '+name);
  for(const f of inputs)if(f!=='<stdin>'&&!path.resolve(root,f).startsWith(work+path.sep)){
   const hash=sha256(read(f));if(f.startsWith('.reference/'))assert.equal(hash,lock.files[f.slice(11)]);report.sources[f]=hash;
  }
  report.oneSharedModulePerBoundary=true;return outfile;
 };
 const run=(name,file)=>{
  const output=path.join(work,name+'.json'),child=spawnSync(process.execPath,[file,output],{cwd:work,windowsHide:true,encoding:'utf8',timeout,maxBuffer:12*1024*1024,
   env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_COMPILE_CACHE:path.join(work,'compile-cache')}});
  logs[name]={stdout:child.stdout,stderr:child.stderr};assert(!child.error&&!child.signal,String(child.error));return{child,output};
 };
 const control=await compile('control');let expected;
 for(let n=0;n<2;n++){
  const{child,output}=run('control-'+n,control);assert.equal(child.status,0,child.stderr);const actual=fs.readFileSync(output);if(expected)assert(actual.equals(expected));else expected=actual;
  const observations=JSON.parse(actual);assert.equal(observations.rows.length,acceptance.assertions.namedGroups);assert.match(observations.sqlite,/^\d+\.\d+\.\d+$/);
  report.runs.push({sha256:sha256(actual)});report.sqliteVersion=observations.sqlite;report.contracts=observations.rows.length;
 }
 report.metadataOnlyField='sqlite';report.additionalOwnershipContracts=acceptance.assertions.accountOwnership;
 report.additionalMalformedEntryCases=acceptance.assertions.malformedEntries;report.additionalAutomaticCounterCases=acceptance.assertions.automaticCounter;
 report.privateReceiptDependencies=0;
 for(const {name:label,file,edits,expected}of faults){
  let source=capture(file).toString();for(const[needle,replacement]of edits){assert.equal(source.split(needle).length,2,label);source=source.replace(needle,replacement);}
  const changed=await transform(source,{loader:'ts',target:'es2022',format:'esm'});overrides.set(path.join(root,file.replace('src/','dist/').replace('.ts','.js')),changed.code);
  const broken=await compile(label),{child}=run(label,broken);overrides.clear();assert.equal(child.status,1,label+' escaped');assert.match(child.stderr,/ERR_ASSERTION/);
  if(expected)assert(child.stderr.includes(expected),label+' failed for an unrelated reason');report.faults.push({name:label,detected:true,...(expected?{expected}:{})});
 }
 const{child,output}=run('restored',control);assert.equal(child.status,0,child.stderr);assert(fs.readFileSync(output).equals(expected));report.restored=true;Object.assign(report,reportFields);report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 try{report.inputsUnchanged=Object.entries(report.sources).every(([f,h])=>sha256(read(f))===h);}
 catch(error){report.inputsUnchanged=false;report.failure??=String(error);}
 report.passed&&=report.inputsUnchanged;
 assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;
 const bytes=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(bytes);fs.writeFileSync(path.join(owned,name+'.logs.json.gz'),bytes);
 fs.writeFileSync(path.join(owned,name+'.json'),JSON.stringify(report,null,2)+'\n');
}
assert(report.passed,report.failure);console.log({passed:true,contracts:report.contracts,faults:report.faults.length,shared:report.oneSharedModulePerBoundary,cleaned:true});
return report;
}
