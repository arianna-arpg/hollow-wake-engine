import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import {build} from 'esbuild';import {gzipSync} from 'node:zlib';
import {root,sha256} from './reference-utils.mjs';
const mode='verify';
const owned=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(owned,'character-world-lifetime-owned-'));
const file=path.join(root,'src','character-world-adapter.ts');let source=fs.readFileSync(file,'utf8');
const report={passed:false,mode,sources:{'src/character-world-adapter.ts':sha256(source),'scripts/test-character-world-lifetime.mjs':sha256(fs.readFileSync(import.meta.filename))}},logs={};
try{
 const driver=`import assert from 'node:assert/strict';import {setImmediate as tick} from 'node:timers/promises';
import {CharacterWorldAdapter} from './adapter.mjs';
const group={revision:1,body:{outbox:{rows:[]}}};
async function setup(){
 const world={marker:new Array(1024).fill(71)},owner={status:'ready',read:()=>structuredClone(group),submit(){throw Error('not used');}};
 const adapter=await CharacterWorldAdapter.open({world:{groupKey:'group',worldKey:'scene',admitDrop:x=>x,admitPlacement:x=>x,
  world:{list:()=>{void world.marker;return[];},inspect:()=>undefined,create:()=>{throw Error('not used');},remove:()=>{}}},
  characterOf:()=>undefined,isCurrent:()=>true,createOwner:async()=>owner,restore:()=>{},
  live:{prepare:p=>p,publish:()=>{},discard:()=>{},recoverRequired:()=>{}}});
 let offer;adapter.update(callback=>{offer=callback;});
 return{adapter,offer,owner:new WeakRef(owner),world:new WeakRef(world)};
}
const held=await setup();await tick();global.gc();await tick();
assert(held.owner.deref()&&held.world.deref(),'Ready adapter lost its owned context');held.adapter.dispose();
let released=false;
for(let n=0;n<40;n++){await tick();global.gc();await tick();if(!held.owner.deref()&&!held.world.deref()){released=true;break;}}
assert.equal(held.adapter.status,'disposed');
assert.throws(()=>held.offer(0,'hero'),/expired-world-eligibility/);
if(process.argv[2]==='released')assert(released,'Disposed adapter retains owner or scene');
else assert(!released,'Expected retained predecessor context');
console.log(JSON.stringify({released,heldDisposedAdapter:true}));`;
 fs.writeFileSync(path.join(work,'check.mjs'),driver);
 const run=async(name,contents,expected)=>{
  const bundled=await build({stdin:{contents,loader:'ts',resolveDir:path.join(root,'src')},bundle:true,format:'esm',platform:'browser',target:'es2022',write:false,metafile:true,logLevel:'silent'});
  for(const input of Object.keys(bundled.metafile.inputs).filter(f=>f!=='<stdin>'))report.sources[input]=sha256(fs.readFileSync(path.resolve(root,input)));
  fs.writeFileSync(path.join(work,'adapter.mjs'),bundled.outputFiles[0].contents);
  const child=spawnSync(process.execPath,['--expose-gc',path.join(work,'check.mjs'),expected],{cwd:work,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:1024*1024,
   env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_COMPILE_CACHE:path.join(work,'cache')}});
  logs[name]={stdout:child.stdout,stderr:child.stderr};assert(!child.error&&!child.signal,String(child.error));return child;
 };
 {
  const child=await run('control',source,'released');assert.equal(child.status,0,child.stderr);report.observed=JSON.parse(child.stdout);
  const needle='this.#options = undefined;';assert.equal(source.split(needle).length,2);
  const fault=await run('retain-options',source.replace(needle,';'),'released');assert.equal(fault.status,1);assert.match(fault.stderr,/Disposed adapter retains owner or scene/);
  const callback="this.#current(); need(this.#frame, 'world-adapter-disposed'); this.#frame.offer(handle, seat);";assert.equal(source.split(callback).length,2);
  const retained=await run('retain-callback',source.replace(callback,'this.#current(); frame.offer(handle, seat);'),'released');assert.equal(retained.status,1);assert.match(retained.stderr,/Disposed adapter retains owner or scene/);
  assert.equal((await run('restored',source,'released')).status,0);report.faultDetected=true;report.restored=true;
  report.faults=2;report.retainedEligibilityCallback=true;
 }
 report.passed=true;
}catch(error){report.error=String(error);process.exitCode=1;}
finally{
 report.inputsUnchanged=Object.entries(report.sources).every(([f,h])=>sha256(fs.readFileSync(path.resolve(root,f)))===h);report.passed&&=report.inputsUnchanged;
 assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;
 const bytes=gzipSync(JSON.stringify(logs));report.logsSha256=sha256(bytes);const stem='character-world-lifetime';
 fs.writeFileSync(path.join(owned,stem+'.logs.json.gz'),bytes);fs.writeFileSync(path.join(owned,stem+'.json'),JSON.stringify(report,null,2)+'\n');
}
console.log({passed:report.passed,mode,observed:report.observed,faultDetected:report.faultDetected,cleaned:report.cleaned,error:report.error});
