import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import ts from 'typescript';
import {root,sha256} from './reference-utils.mjs';

// Substitute one module only in a child loader; never rewrite src or dist.
const owned=fs.realpathSync(path.join(root,'.artifacts'));
const work=fs.mkdtempSync(path.join(owned,'complete-inventory-faults-owned-'));
const report={passed:false,sources:{},faults:[]},logs={};
const files=['scripts/test-complete-inventory-faults.mjs','test/complete-inventory.test.mjs',
 'src/crafting-session-data.ts','src/character-inventory-commands.ts','src/workshop-character-complete.ts',
 'src/character-delivery-codec.ts','src/workshop-character-progression.ts'];
try{
 for(const file of files)report.sources[file]=sha256(fs.readFileSync(path.join(root,file)));
 const loader=path.join(work,'loader.mjs'),preload=path.join(work,'preload.mjs');
 fs.writeFileSync(loader,`let target,source;
export function initialize(data){({target,source}=data);}
export function load(url,context,next){return url===target?{format:'module',source,shortCircuit:true}:next(url,context);}
`);
 const run=(name,file,source)=>{
  const target=file?pathToFileURL(path.join(root,'dist',path.basename(file,'.ts')+'.js')).href:'';
  fs.writeFileSync(preload,`import {register} from 'node:module';register(${JSON.stringify(pathToFileURL(loader).href)},{data:${JSON.stringify({target,source})}});`);
  const child=spawnSync(process.execPath,['--import',pathToFileURL(preload).href,'--test','--test-reporter=spec','test/complete-inventory.test.mjs'],{
   cwd:root,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:2*1024*1024,
   env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_COMPILE_CACHE:path.join(work,'cache')}
  });
  logs[name]={stdout:child.stdout,stderr:child.stderr};assert(!child.error&&!child.signal,String(child.error));return child;
 };
 const clean=run('control');assert.equal(clean.status,0,clean.stdout+clean.stderr);assert.match(clean.stdout,/pass 7/);
 const faults=[
  ['cold-skill-budget-bypassed','src/crafting-session-data.ts','this.#skillPayload(gem,false);','this.#skillPayload(gem,true);','retained investment uses the shared structural checks'],
  ['retained-investment-pruned','src/crafting-session-data.ts','this.#skillPayload(gem,true);','this.#skillPayload(gem,false);','retained investment uses the shared structural checks'],
  ['unknown-graft-accepted','src/workshop-character-complete.ts','this.workshop.skills.skill(target);','void target;','retained grafts require authored identities'],
  ['carrier-not-closed','src/character-inventory-commands.ts',"const closed=replyObject(this.#kernel.command({op:'close',profile:0}));need(closed.ok,'inventory-carrier-close-refused');",';','inventory preparation is detached'],
  ['account-rng-reset','src/character-inventory-commands.ts','content:this.#identity,random,nextUid:',"content:this.#identity,random:{algorithm:'mulberry32/v1',state:1,draws:0},nextUid:",'inventory preparation is detached'],
  ['support-identity-unchecked','src/character-delivery-codec.ts','data.supportState(support);','void support;','bare-gem delivery admission preserves detached investment'],
  ['negative-ability-currency','src/workshop-character-progression.ts','Number.isFinite(n)&&n>=0','Number.isFinite(n)','ability currency is admitted separately']
 ];
 for(const[name,file,from,to,label]of faults){
  const original=fs.readFileSync(path.join(root,file),'utf8');assert.equal(original.split(from).length,2,name);
  const changed=ts.transpileModule(original.replace(from,to),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  const child=run(name,file,changed),output=child.stdout+child.stderr;
  assert.equal(child.status,1,name+' escaped');assert.match(output,/ERR_ASSERTION|AssertionError|Error: (invalid-skill-tree|already-open)/);
  assert(output.includes('✖ '+label),name+' failed outside its contract');
  report.faults.push({name,detected:true,logSha256:sha256(JSON.stringify(logs[name]))});
 }
 const restored=run('restored');assert.equal(restored.status,0,restored.stdout+restored.stderr);assert.match(restored.stdout,/pass 7/);
 report.restored=true;report.passed=true;
}catch(error){report.error=String(error);process.exitCode=1;}
finally{
 report.inputsUnchanged=Object.entries(report.sources).every(([f,h])=>sha256(fs.readFileSync(path.join(root,f)))===h);
 if(!report.inputsUnchanged){report.passed=false;process.exitCode=1;}
 assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));
 fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;
 const zipped=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(zipped);
 fs.writeFileSync(path.join(owned,'complete-inventory-faults.logs.json.gz'),zipped);
 fs.writeFileSync(path.join(owned,'complete-inventory-faults.json'),JSON.stringify(report,null,2)+'\n');
}
console.log({passed:report.passed,faults:report.faults.length,restored:report.restored,cleaned:report.cleaned,error:report.error});
