import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';import {build} from 'esbuild';
import {root,sha256} from './reference-utils.mjs';
assert.equal(process.argv.length,2);
const baseline='4e598576ddbd9c9a16facd0440778a68bd500005';
const owned=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(owned,'guard-benchmark-owned-'));
const report={passed:false,baseline,scope:'guard update kernel; synthetic host ports, no complete actor frame or device acceptance',node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,sources:{},samples:[]};
try{
 const original=execFileSync('git',['show',baseline+':src/guard-arts.ts'],{cwd:root,encoding:'utf8'}),candidate=fs.readFileSync(path.join(root,'src/guard-arts.ts'),'utf8');
 report.baselineSourceSha256=sha256(original);
 for(const file of ['src/guard-arts.ts','test/guard-arts.test.mjs','scripts/benchmark-guard-continuation.mjs'])report.sources[file]=sha256(fs.readFileSync(path.join(root,file)));
 const tests=fs.readFileSync(path.join(root,'test/guard-arts.test.mjs'),'utf8'),marker="test('state and limits are explicit";
 assert.equal(tests.split(marker).length,2);const fixture=tests.slice(0,tests.indexOf(marker)).replace("import test from 'node:test';\n",'');
 for(const[name,contents]of Object.entries({baseline:original,candidate})){
  await build({stdin:{contents,loader:'ts'},bundle:true,platform:'node',format:'esm',target:'es2022',outfile:path.join(work,name+'-runtime.mjs')});
  fs.writeFileSync(path.join(work,name+'-fixture.mjs'),fixture.replace("'../dist/guard-arts.js'","'./"+name+"-runtime.mjs'")+"\nexport {fixture,skill,actor};\n");
 }
 fs.writeFileSync(path.join(work,'measure.mjs'),`
import assert from 'node:assert/strict';import {performance} from 'node:perf_hooks';
import * as baseline from './baseline-fixture.mjs';import * as candidate from './candidate-fixture.mjs';
const modes={baseline,candidate},frames=1200,warmup=300;
function run(mode,count){
 const api=modes[mode],spec={absorb:{fraction:.5,duration:4,cooldown:8},intervention:{cooldown:8,label:'Return'},plates:{interval:1,max:3,reduction:.2,label:'Plates'}};
 const f=api.fixture(spec);let writes=0;
 class Interceptors extends Map {set(key,value){writes++;return super.set(key,value);}}
 for(let i=1;i<count;i++)f.world.actors.push(api.actor(i+1,[api.skill(spec)]));
 for(const actor of f.world.actors){actor.lifeDamageInterceptors=new Interceptors();actor.casting={inst:actor.skills[0],mode:'guard',held:true};f.runtime.sync(actor);f.runtime.cast(actor,actor.skills[0]);}
 for(let i=0;i<warmup;i++){f.world.time+=1/60;f.runtime.update(1/60);}
 globalThis.gc();const before=process.memoryUsage().heapUsed,previous=writes,start=performance.now();
 for(let i=0;i<frames;i++){f.world.time+=1/60;f.runtime.update(1/60);}
 const milliseconds=performance.now()-start,heapBeforeGC=process.memoryUsage().heapUsed;globalThis.gc();const retainedHeapDelta=process.memoryUsage().heapUsed-before;
 const callbackWrites=writes-previous;assert.equal(callbackWrites,mode==='baseline'?count*frames:0);
 const receipt={next:f.state.nextSource,visuals:f.runtime.visuals,actors:f.world.actors.map(actor=>({life:actor.life,intervention:actor.guardIntervention,buffs:[...actor.buffs],sources:[...actor.sources],layers:[...actor.absorbLayers].map(([key,r])=>({key,amount:r.amount,remaining:r.remaining,source:r.source.def.id})),states:[...f.state.owners.get(actor)].map(([host,s])=>({host:host.def.id,key:s.key,policy:s.policy,plates:s.plates,clock:s.plateClock,lastCast:s.lastCast,blasts:s.blasts,intact:s.intact,broken:s.broken}))}))};
 return{mode,count,frames,milliseconds,callbackWrites,heapGrowthBeforeGC:heapBeforeGC-before,retainedHeapDelta,receipt};
}
const samples=[];
for(const count of [1,32,128])for(let round=0;round<5;round++){
 const order=round%2?['candidate','baseline']:['baseline','candidate'],a=run(order[0],count),b=run(order[1],count);assert.deepEqual(a.receipt,b.receipt);
 const {receipt:ar,...left}=a,{receipt:br,...right}=b;samples.push({count,round,first:order[0],results:[left,right],receiptsEqual:true});
}
console.log(JSON.stringify({passed:true,samples}));
`);
 const child=spawnSync(process.execPath,['--expose-gc','measure.mjs'],{cwd:work,windowsHide:true,encoding:'utf8',timeout:240000,maxBuffer:2*1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_COMPILE_CACHE:path.join(work,'compile-cache')}});
 assert(!child.error&&!child.signal&&child.status===0,child.stderr||String(child.error));assert.equal(child.stderr,'');const measured=JSON.parse(child.stdout);assert(measured.passed);report.samples=measured.samples;
 const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
 report.medians=[1,32,128].map(count=>({actors:count,...Object.fromEntries(['baseline','candidate'].map(mode=>[mode,median(report.samples.filter(r=>r.count===count).map(row=>row.results.find(r=>r.mode===mode).milliseconds))]))}));
 report.passed=true;
}finally{
 report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(fs.readFileSync(path.join(root,file)))===hash);report.passed=report.passed&&report.inputsUnchanged;
 assert.equal(path.dirname(fs.realpathSync(work)),owned);fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;
 fs.writeFileSync(path.join(owned,'guard-continuation-benchmark.json'),JSON.stringify(report,null,2)+'\n');
}
console.log({passed:report.passed,samples:report.samples.length,medians:report.medians,cleaned:true});
