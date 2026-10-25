import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {root,writeJSON} from './reference-utils.mjs';import {buildProcContent,procPack} from './compile-proc-content.mjs';
const artifacts=path.join(root,'.artifacts'),npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const contentPath=fs.mkdtempSync(path.join(artifacts,'proc-content-package-')),built=buildProcContent(contentPath);assert.deepEqual(built,procPack(),'Content compilation must repeat exactly');
const pack=cwd=>JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',artifacts,'--cache',path.join(artifacts,'npm-cache')],{cwd,encoding:'utf8'}))[0];
const archive=pack(root),contentArchive=pack(contentPath);
const consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-procs-'));writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',path.join(artifacts,archive.filename),path.join(artifacts,contentArchive.filename),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe'});
fs.copyFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/examples/procs.mjs'),path.join(consumer,'procs.mjs'));
fs.writeFileSync(path.join(consumer,'run.mjs'),`
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
Math.random=()=>{throw new Error('Ambient RNG');};globalThis.fetch=()=>{throw new Error('Network');};
for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw new Error(key);}});
const {procCycle}=await import('./procs.mjs');const cycle=procCycle();assert.deepEqual(cycle,{ward:20,draws:3,nextReady:4});
const read=name=>fs.readFileSync(new URL(import.meta.resolve('@hollow-wake/proc-content/'+name)),'utf8');
const manifest=JSON.parse(read('manifest.json'));for(const [name,entry]of Object.entries(manifest.files)){const bytes=read(name);assert.equal(Buffer.byteLength(bytes),entry.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);}
const {ProcContent}=await import('@hollow-wake/engine/combat/procs'),{StatSheet,StatRules}=await import('@hollow-wake/engine');
const data=JSON.parse(read('procs.json')),content=new ProcContent(data),stats=JSON.parse(read('stats.json')),sheet=new StatSheet(new StatRules(stats));
assert.equal(content.allIds().length,147);assert.equal(content.riders().length,1);assert.equal(Object.keys(stats).length,298);assert.deepEqual(manifest.dynamicStatIds,['procRider_static_shrapnel']);
assert.equal(Object.hasOwn(stats,'procRider_static_shrapnel'),false);assert.equal(sheet.get('procRider_static_shrapnel'),0);assert.equal(sheet.get('procPower_brutal_strike'),1);
data.procs[0].effect.damageScale=99;assert.equal(content.definition('brutal_strike').effect.damageScale,.6);
assert.equal(content.triggerIds('hit').add,undefined);
console.log(JSON.stringify({installedConsumer:true,...cycle,procs:content.allIds().length,riders:content.riders().length,stats:Object.keys(stats).length,dynamicStatIds:manifest.dynamicStatIds,contentId:content.pack.contentId}));
`);
fs.writeFileSync(path.join(consumer,'consumer.ts'),`
import {ProcRuntime,ProcContent,BorrowedProcRegistry,type ProcActor,type ProcSkill,type ProcDefinition,type ProcRiderDefinition,type ProcPorts} from '@hollow-wake/engine/combat/procs';
interface Body extends ProcActor {hostId:number}
interface Skill extends ProcSkill {tags:ReadonlySet<string>}
declare const actor:Body;declare const skill:Skill;
declare const ports:ProcPorts<Body,Skill,ProcDefinition,ProcRiderDefinition,ReadonlySet<string>,unknown,unknown>;
const content=new ProcContent({schemaVersion:1,capability:'proc-dispatch/v1',contentId:'typed',rules:{maxExtraDepth:2,depthFalloff:.5,ppmCatchup:4},procs:[],riders:[]});
const runtime=new ProcRuntime(content,ports);runtime.own(actor,'condition',{inst:skill,condition:'lowLife'});
const borrowed=new BorrowedProcRegistry({definitions:()=>content.candidates('hit'),definition:id=>content.definition(id),riders:()=>content.riders()},content.configuration);new ProcRuntime(borrowed,ports);
// @ts-expect-error Host actor subtype is preserved.
runtime.own({} as ProcActor,'heal');
// @ts-expect-error Trigger vocabulary is explicit.
runtime.own(actor,'unknown');
// @ts-expect-error Owned registry arrays are read-only.
content.pack.procs.push({id:'x',trigger:'heal',effect:{type:'ward'}});
// @ts-expect-error Membership does not expose mutation.
content.triggerIds('heal')?.add('x');
// @ts-expect-error Read callbacks are synchronous.
const asyncPort:ProcPorts<Body,Skill,ProcDefinition,ProcRiderDefinition,ReadonlySet<string>,unknown,unknown>={...ports,time:async()=>1};
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022'],types:[]},include:['consumer.ts']});
try{execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(consumer,'tsconfig.json')],{cwd:consumer,stdio:'pipe'});}catch(error){console.error(String(error.stdout??''),String(error.stderr??''));throw error;}
const result=JSON.parse(execFileSync(process.execPath,['run.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,NODE_PATH:''}}));
writeJSON(path.join(artifacts,'proc-package-verification.json'),{...result,typeConsumer:true,node:process.version,runtimeArchive:archive.integrity,contentArchive:contentArchive.integrity});console.log(result);
