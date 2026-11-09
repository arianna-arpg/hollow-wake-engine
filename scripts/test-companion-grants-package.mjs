import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {gzipSync} from 'node:zlib';
import ts from 'typescript';import {build} from 'esbuild';import {root,sha256} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';
const owned=path.join(root,'.artifacts');fs.mkdirSync(owned,{recursive:true});
const work=fs.mkdtempSync(path.join(owned,'companion-grants-package-owned-')),consumer=path.join(work,'consumer');fs.mkdirSync(consumer);
const spec='@hollow-wake/engine/companions/grants',logs={},report={passed:false,contracts:14,faults:[],sources:{}};
for(const file of ['src/companion-grants.ts','test/companion-grants.test.mjs','scripts/test-companion-grants-package.mjs','package.json','package-lock.json'])report.sources[file]=sha256(fs.readFileSync(path.join(root,file)));
const run=(label,args,cwd=consumer)=>{const child=spawnSync(process.execPath,args,{cwd,encoding:'utf8',windowsHide:true,timeout:240000,maxBuffer:8*1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_PATH:'',NODE_COMPILE_CACHE:path.join(work,'compile-cache')}});logs[label]=(child.stdout??'')+'\n'+(child.stderr??'');assert(!child.error&&!child.signal,label+': '+child.error);return child;};
const success=(label,args,cwd)=>{const child=run(label,args,cwd);assert.equal(child.status,0,logs[label].slice(-7000));return child;};
const contracts=(label,file='contracts.test.mjs')=>{success(label,['--test',file]);assert(/(?:#|ℹ) pass 14\b/.test(logs[label]));};
try{
 success('pack',[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work,'--cache',path.join(work,'npm-cache')],root);
 const archive=path.join(work,JSON.parse(logs.pack)[0].filename);report.archiveSha256=sha256(fs.readFileSync(archive));
 fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
 success('install',[npmCli(),'install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(work,'npm-cache')]);
 const test=fs.readFileSync(path.join(root,'test/companion-grants.test.mjs'),'utf8').replace("'../dist/companion-grants.js'",JSON.stringify(spec));
 fs.writeFileSync(path.join(consumer,'contracts.test.mjs'),test);contracts('installed');
 const bundle=await build({stdin:{contents:'export * from '+JSON.stringify(spec)+';',resolveDir:consumer},bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,metafile:true,write:false});
 assert(Object.values(bundle.metafile.outputs).every(row=>!row.imports.length));report.browserBytes=bundle.outputFiles[0].contents.length;assert(report.browserBytes<3*1024);
 fs.writeFileSync(path.join(consumer,'browser-built.mjs'),bundle.outputFiles[0].contents);
 fs.writeFileSync(path.join(consumer,'browser-contracts.mjs'),test.replace(JSON.stringify(spec),"'./browser-built.mjs'"));
 fs.writeFileSync(path.join(consumer,'hostile.test.mjs'),"Math.random=()=>{throw Error('ambient RNG')};globalThis.fetch=()=>{throw Error('network')};for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw Error(key)}});await import('./browser-contracts.mjs');");contracts('browser','hostile.test.mjs');
 fs.writeFileSync(path.join(consumer,'types.ts'),`import {CompanionGrants,companionReservationUnit,type CompanionGrantPorts,type CompanionGrantState,type CompanionReservationPorts,type CompanionSpawn} from '${spec}';
type O={dead:boolean;downed:boolean};type D={id:string};type S={def:D;level:number};type B={dead:boolean};type L={type:'summon';persistent?:{respawnTime:number;reserve?:number};position:{x:number;y:number;z:number}};
declare const ports:CompanionGrantPorts<O,D,S,L>,owner:O,defs:D[],price:CompanionReservationPorts<O,S,Set<string>,number[]>;
const state:CompanionGrantState<S,B>={};const runtime=new CompanionGrants<O,D,S,B,L>(ports);
runtime.derive(state,owner,defs,id=>id,body=>void body,(body,skill)=>{void body;void skill;});
runtime.update(state,owner,.016,body=>!body.dead,(skill,delivery)=>{const count:1=delivery.count;const p:{x:number;y:number;z:number}=delivery.position;const removed:undefined=delivery.persistent;void skill;void count;void p;void removed;return null;},body=>void body);
declare const inst:S,delivery:L;const amount:number=companionReservationUnit(owner,inst,delivery,price);void amount;
declare const spawn:CompanionSpawn<L>;const one:1=spawn.maxActive;void one;
`);
 success('types',[path.join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','types.ts']);report.types=true;
 const module=path.join(consumer,'node_modules/@hollow-wake/engine/dist/companion-grants.js'),original=fs.readFileSync(module,'utf8');report.moduleBytes=Buffer.byteLength(original);assert(report.moduleBytes<=5*1024);
 const source=fs.readFileSync(path.join(root,'src/companion-grants.ts'),'utf8');
 const compile=text=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 assert.equal(original.replace(/\r\n/g,'\n').replace(/\/\/# sourceMappingURL=.*\n?$/,''),compile(source).replace(/\r\n/g,'\n'),'Mutation compiler must reproduce the installed runtime');
 const faults=[
  ['fractional-level','Math.floor(p.grantedLevel(owner,def))','p.grantedLevel(owner,def)'],
  ['uncapped-level','Math.min(p.maxLevel(def),Math.floor(p.grantedLevel(owner,def)))','Math.floor(p.grantedLevel(owner,def))'],
  ['cold-warm-instance','let row=previous.get(def.id);','let row=undefined;'],
  ['old-relic-provenance','row.inst.relicSource=relicSource(def.id);','void relicSource;'],
  ['dead-body-retired','if(!next.has(id)&&row.body&&!row.body.dead)','if(!next.has(id)&&row.body)'],
  ['early-map-publication','for(const def of defs){','state.grants=next;for(const def of defs){'],
  ['scaled-owner-death','row.remaining=d.persistent.respawnTime;continue;','row.remaining=d.persistent.respawnTime*p.respawnScale(owner,row.inst);continue;'],
  ['unscaled-body-death','d.persistent.respawnTime*p.respawnScale(owner,row.inst)','d.persistent.respawnTime'],
  ['downed-timer-spent','if(row.body||owner.downed)continue;','if(row.body)continue;'],
  ['missing-body-retained','row.body&&!contains(row.body)','row.body&&false'],
  ['authored-delivery-reused','spawn(row.inst,{...d,persistent:undefined,poolGroup:undefined,exclusiveGroup:undefined,count:1,maxActive:1})','spawn(row.inst,d)'],
  ['null-body-retained','})??undefined;','});'],
  ['zero-price-query-skipped','const tags=ports.tags(inst),mods=ports.modifiers(inst);','if(!delivery.persistent?.reserve)return 0;const tags=ports.tags(inst),mods=ports.modifiers(inst);'],
  ['reservation-multiplier-lost','*ports.reservationMultiplier(owner,inst,tags,mods)',''],
 ];
 for(const[name,needle,replacement]of faults){
  assert.equal(source.split(needle).length,2,name+' target');fs.writeFileSync(module,compile(source.replace(needle,replacement)));
  try{assert.equal(run(name,['--test','contracts.test.mjs']).status,1,name+' escaped');assert(logs[name].includes('ERR_ASSERTION'),name+' failed outside behavior');report.faults.push({name,detected:true,logSha256:sha256(logs[name])});}
  finally{fs.writeFileSync(module,original);}
 }
 contracts('restored');report.restored=true;report.passed=true;
}catch(error){report.failure=String(error);throw error;}
finally{
 try{report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(fs.readFileSync(path.join(root,file)))===hash);const bytes=gzipSync(JSON.stringify(logs),{level:9});fs.writeFileSync(path.join(owned,'companion-grants-package.logs.json.gz'),bytes);report.logsSha256=sha256(bytes);}
 finally{assert.equal(path.dirname(fs.realpathSync(work)),fs.realpathSync(owned));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;report.passed=report.passed&&report.inputsUnchanged;fs.writeFileSync(path.join(owned,'companion-grants-package.json'),JSON.stringify(report,null,2)+'\n');}
}
assert(report.passed);console.log({passed:true,contracts:14,faults:report.faults.length,moduleBytes:report.moduleBytes,browserBytes:report.browserBytes,cleaned:report.cleaned});
