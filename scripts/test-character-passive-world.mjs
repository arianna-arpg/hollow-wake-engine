import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {gzipSync,gunzipSync} from 'node:zlib';import {build} from 'esbuild';import {root,sha256} from './reference-utils.mjs';
import {patchPassiveActionsWorld} from './passive-actions-world-overlay.mjs';
const owned=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(owned,'character-passive-world-owned-'));
const read=f=>fs.readFileSync(path.join(root,f)),report={passed:false,sources:{},runs:[],faults:[],expectedObservationsRegenerated:false},logs={};
try{
 const capture=f=>{const bytes=read(f);report.sources[f]=sha256(bytes);return bytes;};
 const lock=JSON.parse(capture('baseline/source-lock.json')),worldFile=path.join(root,'.reference/src/engine/world.ts');
 const raw=capture('.reference/src/engine/world.ts');assert.equal(sha256(raw),lock.files['src/engine/world.ts']);let world=patchPassiveActionsWorld(raw.toString());
 const anchor='session:seat=>sdkPassiveHost(seat.meta),';assert.equal(world.split(anchor).length,2);
 world=world.replace(anchor,anchor+"writePassives:(seat,value)=>{const {classId,...rest}=value;Object.assign(seat.meta,rest,{allocated:new Set(value.allocated)});},learned:seat=>seat.meta.knownSkills.values(),granted:seat=>seat.grantedInsts?.values()??[],");
 const originalHarness=capture('reference/export-passive-policy-host.ts').toString().replaceAll('\r\n','\n');
 const begin=originalHarness.indexOf('const refresh:()=>void='),end=originalHarness.indexOf("const start=classStartNode",begin);assert(begin>=0&&end>begin);
 const harness=originalHarness.slice(0,begin)+"import {refreshSdkPassivePolicy as refresh} from '../src/engine/passivePolicyAdapter';\n"+originalHarness.slice(end);
 let bridge=capture('adapters/hollow-wake/passivePolicyAdapter.ts').toString().replaceAll('\r\n','\n');
 const importLine="import { refreshSdkPassiveGrants } from './passiveGrantAdapter';\n";assert.equal(bridge.split(importLine).length,2);bridge=bridge.replace(importLine,'');
 assert.equal(bridge.split(' refreshSdkPassiveGrants();').length,2);bridge=bridge.replace(' refreshSdkPassiveGrants();','');
 const core=capture('test/character-passive/world-actions.ts').toString(),expected=JSON.parse(gunzipSync(capture('baseline/milestone-ten/passive-policy-host.json.gz')));
 for(const f of ['scripts/test-character-passive-world.mjs','scripts/passive-actions-world-overlay.mjs'])capture(f);
 const compile=async(name,source)=>{
  const outfile=path.join(work,name+'.mjs');
  const result=await build({stdin:{contents:harness,loader:'ts',resolveDir:path.join(root,'.reference/balance')},bundle:true,platform:'node',format:'esm',target:'es2022',outfile,metafile:true,logLevel:'silent',
   plugins:[{name:'passive-action-overlay',setup(b){
    b.onResolve({filter:/^(candidate\/passive-actions|@hollow-wake\/engine\/passives)$/},a=>({path:path.join(root,a.path.startsWith('candidate/')?'test/character-passive/world-actions.ts':'dist/passive-policy.js')}));
    b.onResolve({filter:/^candidate\/(borrowed-passive-actions|passive-commands|passive-effects)$/},a=>({path:path.join(root,a.path==='candidate/borrowed-passive-actions'?'dist/passive-actions.js':'src/character-'+a.path.slice(10)+'.ts')}));
    b.onResolve({filter:/^\.\/passive-actions\.js$/},()=>({path:path.join(root,'dist/passive-actions.js')}));
    b.onResolve({filter:/passivePolicyAdapter$/},()=>({path:path.join(root,'adapters/hollow-wake/passivePolicyAdapter.ts')}));
    b.onLoad({filter:/\.[jt]s$/},a=>{
     if(path.resolve(a.path)===worldFile)return{contents:world,loader:'ts',resolveDir:path.dirname(worldFile)};
     if(path.resolve(a.path)===path.join(root,'adapters/hollow-wake/passivePolicyAdapter.ts'))return{contents:bridge,loader:'ts',resolveDir:path.join(root,'.reference/src/engine')};
     if(path.resolve(a.path)===path.join(root,'test/character-passive/world-actions.ts'))return{contents:source,loader:'ts',resolveDir:path.join(root,'test/character-passive')};
     if(/character-passive-(commands|effects)\.ts$/.test(a.path))return{contents:capture(path.relative(root,a.path)).toString(),loader:'ts',resolveDir:path.join(root,'src')};
    });
   }}]});
  for(const f of Object.keys(result.metafile.inputs))if(f!=='<stdin>'){
   const bytes=capture(f);if(f.startsWith('.reference/'))assert.equal(sha256(bytes),lock.files[f.slice(11)]);
  }
  return outfile;
 };
 const run=(name,file)=>{
  const output=path.join(work,name),child=spawnSync(process.execPath,[file,output],{cwd:work,windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024,
   env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_COMPILE_CACHE:path.join(work,'compile-cache')}});
  logs[name]={stdout:child.stdout,stderr:child.stderr};assert(!child.error&&!child.signal,String(child.error));assert.equal(child.status,0,child.stderr);
  const actual=JSON.parse(fs.readFileSync(path.join(output,'passive-policy-host.json')));assert.deepEqual(actual,expected,name);return actual;
 };
 const control=await compile('control',core);
 for(let n=0;n<2;n++){const actual=run('control-'+n,control);report.runs.push({rows:actual.rows.length,sha256:sha256(JSON.stringify(actual))});}
 run('restored',control);report.restored=true;report.originalWorldTransitions=42;report.completeCharacterAdmissionQualified=false;report.durableAcknowledgementQualified=false;report.borrowedFallbacks=["ensureRealmRoots","grantRealmPoints"];report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 report.inputsUnchanged=Object.entries(report.sources).every(([f,h])=>sha256(read(f))===h);report.passed&&=report.inputsUnchanged;
 assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;
 const bytes=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(bytes);fs.writeFileSync(path.join(owned,'character-passive-world.logs.json.gz'),bytes);
 fs.writeFileSync(path.join(owned,'character-passive-world.json'),JSON.stringify(report,null,2)+'\n');
}
assert(report.passed,report.failure);console.log({passed:true,originalWorldTransitions:report.originalWorldTransitions,faults:report.faults.length,restored:true,cleaned:true});
