import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {gzipSync} from 'node:zlib';import {build} from 'esbuild';import {root,sha256} from './reference-utils.mjs';
const owned=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(owned,'character-world-browser-owned-'));
const report={passed:false,sources:{},scope:'Standalone browser bundle: placement, world reconciliation and frame authorization execute with hostile ambient globals. Durable owner and assembled adapter are exported; their complete lifecycles are covered separately by the actual-game/SQLite course. This is not a physical browser or device run.'},logs={};
try{
 const names=['durable-character-located-owner','character-spill-placement','character-world-located-deliveries','character-world-adapter'];
 for(const file of [...names.map(name=>'src/'+name+'.ts'),'scripts/test-character-world-browser.mjs'])report.sources[file]=sha256(fs.readFileSync(path.join(root,file)));
 const result=await build({stdin:{contents:names.map(name=>`export * from './${name}.ts';`).join('\n'),resolveDir:path.join(root,'src'),loader:'ts'},bundle:true,platform:'browser',target:'es2022',format:'esm',minify:true,metafile:true,write:false,logLevel:'silent'});
 assert(Object.values(result.metafile.outputs).every(value=>value.imports.length===0));
 for(const file of Object.keys(result.metafile.inputs).filter(file=>file!=='<stdin>')){
  const absolute=path.resolve(root,file),relative=path.relative(root,absolute).replaceAll('\\','/');
  assert(!relative.startsWith('../')&&!relative.startsWith('.reference/'),'Unexpected original-game dependency: '+relative);
  assert(['src/random.ts','src/session-json.ts','src/validation.ts'].includes(relative)||names.some(name=>relative==='src/'+name+'.ts'),relative);
  report.sources[relative]=sha256(fs.readFileSync(absolute));
 }
 const bundle=result.outputFiles[0].contents;report.browserBytes=bundle.length;report.gzipBytes=gzipSync(bundle).length;report.bundleSha256=sha256(bundle);
 fs.writeFileSync(path.join(work,'adapter.mjs'),bundle);
 const driver=`import assert from 'node:assert/strict';
Math.random=()=>{throw Error('ambient random');};globalThis.fetch=()=>{throw Error('ambient network');};
for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw Error(key);}});
const {CharacterWorldAdapter,DurableCharacterOwner,HollowWakeSpillPlacement,WorldDeliveryBinding,LocatedPickupFrame}=await import('./adapter.mjs');
assert.equal(typeof DurableCharacterOwner.open,'function');assert.equal(typeof CharacterWorldAdapter.open,'function');
const policy=new HollowWakeSpillPlacement({observe:()=>({worldKey:'world',pos:{x:20,y:30},tier:0}),clamp:(_world,pos)=>pos,canPickup:()=>true});
const before=policy.seed(3),planned=policy.prepare({groupKey:'group',state:before,rows:[{id:1,characterKey:'source',drop:{kind:'support'}}]});
assert.equal(before.random.draws,0);assert.equal(planned.state.random.draws,3);assert.equal(Object.hasOwn(planned.placements[0].placement,'tier'),false);
const row={id:1,characterKey:'source',drop:{kind:'support'},placement:planned.placements[0].placement};
const items=new Map();let next=0;
const binding=new WorldDeliveryBinding({groupKey:'group',worldKey:'world',admitDrop:value=>value,admitPlacement:(value,drop)=>policy.admitPlacement(value,drop),world:{
 list:()=>[...items.keys()],inspect:handle=>items.get(handle),create:value=>{const handle=next++;items.set(handle,value);return handle;},remove:handle=>{items.delete(handle);}
}});
assert.deepEqual(binding.reconcile({groupKey:'group',revision:1,rows:[row]}),{revision:1,created:1,retired:0,preserved:0});
assert.deepEqual(binding.reconcile({groupKey:'group',revision:1,rows:[row]}),{revision:1,created:0,retired:0,preserved:1});assert.deepEqual([...items.keys()],[0]);
let frame,submissions=0;const request={groupKey:'group',characterKey:'hero',delivery:row};
frame=new LocatedPickupFrame({groupKey:'group',binding,characterOf:seat=>seat,owner:{status:'ready',submit(actions){
 submissions++;assert.deepEqual(actions,[{kind:'pickup',characterKey:'hero',deliveryId:1}]);assert.equal(frame.authorizePickup(request),true);assert.equal(frame.authorizePickup(request),false);return Promise.resolve('saved');
}}});
frame.begin();frame.offer(0,'hero');frame.cancel();assert.equal(submissions,0);
frame.begin();frame.offer(0,'hero');frame.offer(0,'hero');const pending=frame.end();assert.equal(frame.authorizePickup(request),false);assert.equal(await pending,'saved');assert.equal(submissions,1);
assert.deepEqual(binding.reconcile({groupKey:'group',revision:2,rows:[]}),{revision:2,created:0,retired:1,preserved:0});assert.throws(()=>binding.pickup(0,'hero'),/foreign-world-delivery/);
console.log(JSON.stringify({placement:true,world:true,frame:true,zeroHandle:true,hostileGlobals:true,durableOwnerExportOnly:true,assembledAdapterExportOnly:true}));
`;
 fs.writeFileSync(path.join(work,'check.mjs'),driver);report.driverSha256=sha256(Buffer.from(driver));
 const child=spawnSync(process.execPath,[path.join(work,'check.mjs')],{cwd:work,windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_COMPILE_CACHE:path.join(work,'compile-cache')}});
 logs.control={stdout:child.stdout,stderr:child.stderr};assert(!child.error&&!child.signal&&child.status===0,child.stderr);report.observed=JSON.parse(child.stdout);report.passed=true;
}catch(error){report.error=String(error);process.exitCode=1;}
finally{
 report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(fs.readFileSync(path.join(root,file)))===hash);if(!report.inputsUnchanged){report.passed=false;process.exitCode=1;}
 assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;
 const compressed=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(compressed);fs.writeFileSync(path.join(owned,'character-world-browser.logs.json.gz'),compressed);fs.writeFileSync(path.join(owned,'character-world-browser.json'),JSON.stringify(report,null,2)+'\n');
}
console.log({passed:report.passed,browserBytes:report.browserBytes,gzipBytes:report.gzipBytes,observed:report.observed,cleaned:report.cleaned,error:report.error});
