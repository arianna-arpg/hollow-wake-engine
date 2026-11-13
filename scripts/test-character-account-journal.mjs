import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {build} from 'esbuild';import {spawnSync} from 'node:child_process';import {gzipSync} from 'node:zlib';
import {root,sha256} from './reference-utils.mjs';
import {pathToFileURL} from 'node:url';
const owned=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(owned,'character-account-journal-owned-'));
const report={passed:false,sources:{},faults:[]},logs={};
const capture=f=>{const b=fs.readFileSync(path.join(root,f));report.sources[f]=sha256(b);return b.toString();};
try{
 capture('scripts/test-character-account-journal.mjs');
 const replacements=new Map([
  ['account-workshop-core.js',capture('src/account-workshop-core.ts')],
  ['character-workshop-boundary.js',capture('src/character-workshop-boundary.ts')]
 ]);
 const course=capture('test/character-build-journal.test.mjs');
 const run=async(name,boundary)=>{
  const outfile=path.join(work,name+'.mjs');
  await build({stdin:{contents:course,loader:'js',resolveDir:path.join(root,'test')},outfile,bundle:true,platform:'node',format:'esm',target:'es2022',logLevel:'silent',
   plugins:[{name:'character-account-journal',setup(b){
    b.onResolve({filter:/shared-account\/fixtures\.mjs$/},()=>({path:pathToFileURL(path.join(root,'test/shared-account/fixtures.mjs')).href,external:true}));
    b.onResolve({filter:/\.js$/},a=>{const file=path.resolve(a.resolveDir,a.path);if(path.dirname(file)===path.join(root,'dist')&&!replacements.has(path.basename(file))&&path.basename(file)!=='account-workshop-complete.js')return{path:pathToFileURL(file).href,external:true};});
    b.onLoad({filter:/\.js$/},a=>{const key=path.basename(a.path);if(replacements.has(key))return{contents:key==='character-workshop-boundary.js'?boundary:replacements.get(key),loader:'ts',resolveDir:path.join(root,'dist')};});
   }}]});
  const child=spawnSync(process.execPath,[outfile],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:6*1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_COMPILE_CACHE:path.join(work,'cache')}});
  logs[name]={stdout:child.stdout,stderr:child.stderr};assert(!child.error&&!child.signal,String(child.error));return child;
 };
 const source=replacements.get('character-workshop-boundary.js');
 for(const n of ['control','fresh-control']){const child=await run(n,source);assert.equal(child.status,0,child.stderr);}
 for(const[name,needle,replacement,expected]of [
  ['reuse-final-for-before','before:view(previous),after:view(next)','before:view(next),after:view(next)',undefined],
  ['skip-account-journal','if(previous!==next)accounts.push','if(false)accounts.push',undefined],
  ['duplicate-account-views','let value=views.get(account);','let value:PreparedAccountView|undefined;', 'same admitted account state must share one frozen view']
 ]){
  assert.equal(source.split(needle).length,2);const child=await run(name,source.replace(needle,replacement));assert.equal(child.status,1,name+' escaped');assert.match(child.stderr,/ERR_ASSERTION/);if(expected)assert(child.stderr.includes(expected));report.faults.push({name,detected:true});
 }
 const restored=await run('restored',source);assert.equal(restored.status,0,restored.stderr);report.restored=true;report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 try{report.inputsUnchanged=Object.entries(report.sources).every(([f,h])=>sha256(fs.readFileSync(path.join(root,f)))===h);}catch{report.inputsUnchanged=false;}
 report.passed&&=report.inputsUnchanged;assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;
 const bytes=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(bytes);fs.writeFileSync(path.join(owned,'character-account-journal.logs.json.gz'),bytes);fs.writeFileSync(path.join(owned,'character-account-journal.json'),JSON.stringify(report,null,2)+'\n');
}
assert(report.passed,report.failure);console.log({passed:true,existingJournalCases:15,newAccountCases:4,faults:report.faults.length,restored:true,cleaned:true});
