import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {root,writeJSON} from './reference-utils.mjs';
const artifacts=path.join(root,'.artifacts'),npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const archive=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',artifacts,'--cache',path.join(artifacts,'npm-cache')],{cwd:root,encoding:'utf8'}))[0];
const consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-conditions-'));writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',path.join(artifacts,archive.filename),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe'});
fs.copyFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/examples/actor-conditions.mjs'),path.join(consumer,'actor-conditions.mjs'));
fs.writeFileSync(path.join(consumer,'run.mjs'),`
import assert from 'node:assert/strict';
Math.random=()=>{throw new Error('Ambient RNG');};globalThis.fetch=()=>{throw new Error('Network');};
for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw new Error(key);}});
const {conditionCycle}=await import('./actor-conditions.mjs');const cycle=conditionCycle();
assert.deepEqual(cycle,{birthEvents:0,damage:[1,2,1],events:['lowLife','recentlyHurt'],ward:30,expired:true,final:['notHurtRecently','fullLife']});
console.log(JSON.stringify({installedConsumer:true,...cycle}));
`);
fs.writeFileSync(path.join(consumer,'consumer.ts'),`
import {ActorConditions,type ActorConditionOwner,type ActorConditionPublication} from '@hollow-wake/engine/stats/conditions';
import {StatSheet} from '@hollow-wake/engine';
interface Body extends ActorConditionOwner {hostId:number}
declare const actor:Body;declare const sheet:StatSheet;
const service=new ActorConditions<Body>({maxLife:a=>a.hostId,maxMana:()=>100,maxEs:()=>0,lowLifeFraction:()=>.35,strideReach:()=>0});
const marker:ActorConditionPublication=null;actor.condSheet=marker;actor.sheet=sheet;
const changed:boolean=service.refresh(actor);const native:boolean=service.holds(actor,'lowLife');const custom:boolean=service.holds(actor,'custom');service.invalidate(actor);
// @ts-expect-error Native events have the optional policy's declared vocabulary.
actor.condRose.push('custom');
// @ts-expect-error The host's subtype is preserved.
service.refresh({} as ActorConditionOwner);
// @ts-expect-error Read ports return numbers, not promises.
new ActorConditions({maxLife:async()=>1,maxMana:()=>1,maxEs:()=>1,lowLifeFraction:()=>.35,strideReach:()=>0});
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022'],types:[]},include:['consumer.ts']});
try{execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(consumer,'tsconfig.json')],{cwd:consumer,stdio:'pipe'});}catch(error){console.error(String(error.stdout??''),String(error.stderr??''));throw error;}
const result=JSON.parse(execFileSync(process.execPath,['run.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,NODE_PATH:''}}));
writeJSON(path.join(artifacts,'actor-condition-package-verification.json'),{...result,typeConsumer:true,node:process.version,runtimeArchive:archive.integrity});console.log(result);
