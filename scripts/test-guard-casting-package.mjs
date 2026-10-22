import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {root,writeJSON} from './reference-utils.mjs';
const artifacts=path.join(root,'.artifacts'),npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const archive=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',artifacts,'--cache',path.join(artifacts,'npm-cache')],{cwd:root,encoding:'utf8'}))[0];
const consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-guard-'));writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',path.join(artifacts,archive.filename),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe'});
fs.copyFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/examples/guard-casting.mjs'),path.join(consumer,'guard-casting.mjs'));
fs.writeFileSync(path.join(consumer,'run.mjs'),`
import assert from 'node:assert/strict';
Math.random=()=>{throw new Error('Ambient RNG');};
globalThis.fetch=()=>{throw new Error('Network');};
for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw new Error(key);}});
const {guardCycle}=await import('./guard-casting.mjs');const result=guardCycle();
assert.deepEqual(result,{pulses:['wall','wall'],warnings:[{actor:'sentinel',deadline:1}],bashes:[{actor:'wall',payload:60},{actor:'sentinel',payload:45}],mana:[90,90],bothReleased:true});
console.log(JSON.stringify({installedConsumer:true,shippedExample:true,result}));
`);
fs.writeFileSync(path.join(consumer,'consumer.ts'),`
import {GuardCasting,guardBashReady,guardAiHold,guardDuration,type GuardCastState,type GuardCastingPorts,type GuardCastSpec,type GuardBashSpec} from '@hollow-wake/engine/casting/guard';
type Actor={mana:number};type State=GuardCastState&{spec:GuardCastSpec};type Bash=GuardBashSpec&{id:string};type Context={mods:readonly number[]};
declare const ports:GuardCastingPorts<Actor,State,Bash,Context>;
declare const actor:Actor;declare const state:State;
const runtime=new GuardCasting(ports,{beatInterval:1,releaseFloor:.25,armTime:1});runtime.refresh(actor,state);runtime.advance(actor,state,.016);
const readiness:{clock:number;armed:boolean;line:boolean;ready:boolean}=guardBashReady(state);
const duration:number=guardDuration(.6,.4);const hold:number=guardAiHold(state);
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022'],types:[]},include:['consumer.ts']});
execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(consumer,'tsconfig.json')],{cwd:consumer,stdio:'pipe'});
const result=JSON.parse(execFileSync(process.execPath,['run.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,NODE_PATH:''}}));assert(result.installedConsumer&&result.shippedExample);
writeJSON(path.join(artifacts,'guard-casting-package-verification.json'),{...result,typeConsumer:true,node:process.version,runtimeArchive:archive.integrity});console.log(result);
