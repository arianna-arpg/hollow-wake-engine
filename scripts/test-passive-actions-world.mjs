import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {gzipSync,gunzipSync} from 'node:zlib';import {build} from 'esbuild';import {root,sha256} from './reference-utils.mjs';
import {patchPassiveActionsWorld} from './passive-actions-world-overlay.mjs';
const owned=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(owned,'passive-actions-world-owned-'));
const read=f=>fs.readFileSync(path.join(root,f)),report={passed:false,sources:{},runs:[],faults:[],expectedObservationsRegenerated:false},logs={};
try{
 const capture=f=>{const bytes=read(f);report.sources[f]=sha256(bytes);return bytes;};
 const lock=JSON.parse(capture('baseline/source-lock.json')),worldFile=path.join(root,'.reference/src/engine/world.ts');
 const raw=capture('.reference/src/engine/world.ts');assert.equal(sha256(raw),lock.files['src/engine/world.ts']);const world=patchPassiveActionsWorld(raw.toString());
 const originalHarness=capture('reference/export-passive-policy-host.ts').toString().replaceAll('\r\n','\n');
 const begin=originalHarness.indexOf('const refresh:()=>void='),end=originalHarness.indexOf("const start=classStartNode",begin);assert(begin>=0&&end>begin);
 const harness=originalHarness.slice(0,begin)+"import {refreshSdkPassivePolicy as refresh} from '../src/engine/passivePolicyAdapter';\n"+originalHarness.slice(end);
 let bridge=capture('adapters/hollow-wake/passivePolicyAdapter.ts').toString().replaceAll('\r\n','\n');
 const importLine="import { refreshSdkPassiveGrants } from './passiveGrantAdapter';\n";assert.equal(bridge.split(importLine).length,2);bridge=bridge.replace(importLine,'');
 assert.equal(bridge.split(' refreshSdkPassiveGrants();').length,2);bridge=bridge.replace(' refreshSdkPassiveGrants();','');
 const core=capture('src/passive-actions.ts').toString(),expected=JSON.parse(gunzipSync(capture('baseline/milestone-ten/passive-policy-host.json.gz')));
 for(const f of ['scripts/test-passive-actions-world.mjs','scripts/passive-actions-world-overlay.mjs'])capture(f);
 const compile=async(name,source)=>{
  const outfile=path.join(work,name+'.mjs');
  const result=await build({stdin:{contents:harness,loader:'ts',resolveDir:path.join(root,'.reference/balance')},bundle:true,platform:'node',format:'esm',target:'es2022',outfile,metafile:true,logLevel:'silent',
   plugins:[{name:'passive-action-overlay',setup(b){
    b.onResolve({filter:/^(candidate\/passive-actions|@hollow-wake\/engine\/passives)$/},a=>({path:path.join(root,a.path.startsWith('candidate/')?'src/passive-actions.ts':'dist/passive-policy.js')}));
    b.onResolve({filter:/passivePolicyAdapter$/},()=>({path:path.join(root,'adapters/hollow-wake/passivePolicyAdapter.ts')}));
    b.onLoad({filter:/\.[jt]s$/},a=>{
     if(path.resolve(a.path)===worldFile)return{contents:world,loader:'ts',resolveDir:path.dirname(worldFile)};
     if(path.resolve(a.path)===path.join(root,'adapters/hollow-wake/passivePolicyAdapter.ts'))return{contents:bridge,loader:'ts',resolveDir:path.join(root,'.reference/src/engine')};
     if(path.resolve(a.path)===path.join(root,'src/passive-actions.ts'))return{contents:source,loader:'ts',resolveDir:path.join(root,'src')};
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
 for(const[name,needle,replacement]of [
  ['skip-root-rebuild','if(this.#p.session(seat).ensureRealmRoots(realm).length)this.#p.recalculate(seat);','this.#p.session(seat).ensureRealmRoots(realm);'],
  ['company-before-rebuild','p.recalculate(seat);p.refreshCompany(seat);return true;','p.refreshCompany(seat);p.recalculate(seat);return true;'],
  ['skip-summon-refresh','for(const body of bodies)if(p.alive(body))p.refreshSummon(seat,body);','void bodies;'],
  ['skip-graft-rebuild','  p.recalculate(seat);\n  for(const id of [previous,skillId])','  for(const id of [previous,skillId])']]){
  assert.equal(core.split(needle).length,2,name);const broken=await compile(name,core.replace(needle,replacement));
  assert.throws(()=>run(name,broken),{code:'ERR_ASSERTION'},name+' escaped');report.faults.push({name,detected:true});
 }
 run('restored',control);report.restored=true;report.originalWorldTransitions=42;report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 report.inputsUnchanged=Object.entries(report.sources).every(([f,h])=>sha256(read(f))===h);report.passed&&=report.inputsUnchanged;
 assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;
 const bytes=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(bytes);fs.writeFileSync(path.join(owned,'maintained-passive-actions-world.logs.json.gz'),bytes);
 fs.writeFileSync(path.join(owned,'maintained-passive-actions-world.json'),JSON.stringify(report,null,2)+'\n');
}
assert(report.passed,report.failure);console.log({passed:true,originalWorldTransitions:report.originalWorldTransitions,faults:report.faults.length,restored:true,cleaned:true});
