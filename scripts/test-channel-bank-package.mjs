import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {root,writeJSON} from './reference-utils.mjs';
const artifacts=path.join(root,'.artifacts'),npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const archive=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',artifacts,'--cache',path.join(artifacts,'npm-cache')],{cwd:root,encoding:'utf8'}))[0];
const consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-banks-'));writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',path.join(artifacts,archive.filename),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe'});
fs.copyFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/examples/channel-banks.mjs'),path.join(consumer,'channel-banks.mjs'));
fs.writeFileSync(path.join(consumer,'run.mjs'),`
import assert from 'node:assert/strict';
Math.random=()=>{throw new Error('Ambient RNG');};globalThis.fetch=()=>{throw new Error('Network');};
for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw new Error(key);}});
const {bankCycle}=await import('./channel-banks.mjs');const result=bankCycle();
assert.deepEqual(result,{damage:[2,5,5,1],bankDeleted:true,detachedFill:-.0625,retainedInstance:true,stable:true});
console.log(JSON.stringify({installedConsumer:true,shippedExample:true,namespacedCorrection:true,separateSamplingPhase:true,result}));
`);
fs.writeFileSync(path.join(consumer,'consumer.ts'),`
import {ChannelBanks,type ChannelBank,type ChannelBankPorts,type ChannelBankOwner} from '@hollow-wake/engine/casting/banks';
import {ActorGaugePublisher,type ActorGaugeSources,type ActorGaugeSink} from '@hollow-wake/engine/stats/gauges';
interface Skill {id:string;payload:{name:string}}
interface Spec {decay?:number;bankAt?:number;hostLabel:string}
interface Actor extends ChannelBankOwner<Skill,Spec> {name:string;statuses:ActorGaugeSources['statuses'];charges:Map<string,number>}
declare const ports:ChannelBankPorts<Actor,Skill,Spec>,actor:Actor,skill:Skill,spec:Spec,sink:ActorGaugeSink;
const banks=new ChannelBanks(ports);
const bank:ChannelBank<Skill,Spec>=banks.bind(actor,skill,spec);
const label:string=bank.spec.hostLabel;
const prior:ChannelBank<Skill,Spec>|undefined=banks.lookup(actor,skill);banks.decay(actor,.016);
const gauges=new ActorGaugePublisher();const published:boolean=gauges.refresh(actor,sink);gauges.invalidate();gauges.reset();
const sparse:ActorGaugeSources={statuses:[{id:'poison'}],charges:new Map(),reserves:new Map([['investigation',{}]])};
gauges.refresh(sparse,sink);
// @ts-expect-error Host skill payload is retained, not erased by the generic API.
banks.bind(actor,{id:'missing-payload'},spec);
// @ts-expect-error Host authored spec fields remain required.
banks.bind(actor,skill,{decay:1});
// @ts-expect-error Gauge counts are numeric.
gauges.refresh({statuses:[],charges:new Map<string,string>()},sink);
// @ts-expect-error Decay returns no snapshot receipt.
const receipt:boolean=banks.decay(actor,.016);
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022'],types:[]},include:['consumer.ts']});
try{execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(consumer,'tsconfig.json')],{cwd:consumer,stdio:'pipe'});}catch(error){console.error(String(error.stdout??''),String(error.stderr??''));throw error;}
const result=JSON.parse(execFileSync(process.execPath,['run.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,NODE_PATH:''}}));assert(result.installedConsumer&&result.namespacedCorrection&&result.separateSamplingPhase);
writeJSON(path.join(artifacts,'channel-bank-package-verification.json'),{...result,typeConsumer:true,node:process.version,runtimeArchive:archive.integrity});console.log(result);
