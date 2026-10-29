import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {root,sha256,writeJSON} from './reference-utils.mjs';
const artifacts=path.join(root,'.artifacts'),output=fs.mkdtempSync(path.join(artifacts,'cooldown-package-')),
  npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const [packed]=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',output,'--cache',path.join(artifacts,'npm-cache')],{cwd:root,encoding:'utf8'}));
const consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-cooldown-'));writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',path.join(output,packed.filename),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe'});
fs.copyFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/examples/cooldowns.mjs'),path.join(consumer,'example.mjs'));
fs.writeFileSync(path.join(consumer,'run.mjs'),`
import assert from 'node:assert/strict';
Math.random=()=>{throw Error('Ambient randomness');};Date.now=()=>{throw Error('Ambient clock');};globalThis.fetch=()=>{throw Error('Network');};
for(const key of ['window','document','localStorage','performance'])Object.defineProperty(globalThis,key,{get(){throw Error(key);}});
const {cooldownExample}=await import('./example.mjs'),first=cooldownExample(),second=cooldownExample();
assert.deepEqual(first,{changed:true,clocks:[['dash',5],['meteor',4]],otherClocks:[['dash',8],['meteor',4],['unslotted',2]],selectorsOwned:true});
assert.deepEqual(second,first);assert.notEqual(second,first);
console.log(JSON.stringify({installedConsumer:true,isolatedSimulations:true,first}));
`);
fs.writeFileSync(path.join(consumer,'consumer.ts'),`
import {applyProcCooldown,type CooldownClocks,type CooldownState,type ProcCooldownEffect} from '@hollow-wake/engine/combat/cooldowns';
import {compileProcCooldownEffect,COOLDOWN_CONTENT_LIMITS} from '@hollow-wake/engine/combat/cooldown-content';
const actor:CooldownState={cooldowns:new Map([['dash',8]]),skills:[null,{def:{id:'dash',tags:['movement']}}]};
const effect=compileProcCooldownEffect({type:'cooldown',seconds:1,tags:[]});
const changed:boolean=applyProcCooldown(actor,effect,{def:{id:'trigger'}});applyProcCooldown(actor,effect,null);applyProcCooldown(actor,effect);
const clocks:CooldownClocks={set(){return this;},delete(){return false;},*[Symbol.iterator](){yield ['a',1] as const;}};
applyProcCooldown({cooldowns:clocks,skills:[]},effect);
// @ts-expect-error Content is readonly.
effect.seconds=2;
// @ts-expect-error Nested content is readonly.
effect.tags?.push('fire');
// @ts-expect-error Content limits are immutable.
COOLDOWN_CONTENT_LIMITS.selectorEntries=1;
// @ts-expect-error A mutation-capable clock store is required.
const readOnly:CooldownState={cooldowns:new Map() as ReadonlyMap<string,number>,skills:[]};
// @ts-expect-error Clock writes must finish synchronously.
const asyncSet:CooldownClocks={...clocks,set:async()=>clocks};
// @ts-expect-error Clock deletions must finish synchronously.
const asyncDelete:CooldownClocks={...clocks,delete:async()=>true};
// @ts-expect-error A proc cooldown effect cannot be replaced by the distinct skill effect schema.
const wrong:ProcCooldownEffect={type:'reduceCooldowns',seconds:1};
// @ts-expect-error Native flags are true or omitted.
const falseFlag:ProcCooldownEffect={type:'cooldown',reset:false};
// @ts-expect-error Triggers retain a live definition identity, not a copied ID string.
applyProcCooldown(actor,effect,'dash');
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022'],types:[]},include:['consumer.ts']});
try{execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(consumer,'tsconfig.json')],{cwd:consumer,stdio:'pipe'});}catch(error){console.error(String(error.stdout??''));throw error;}
const result=JSON.parse(execFileSync(process.execPath,['run.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,NODE_PATH:''}}));
const modules=['cooldowns','cooldown-content'].map(name=>{const bytes=fs.readFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/dist',name+'.js'));
 assert(bytes.equals(fs.readFileSync(path.join(root,'dist',name+'.js'))));return {name,bytes:bytes.length,sha256:sha256(bytes)};});
assert(modules.reduce((sum,row)=>sum+row.bytes,0)<=8192,'Cooldown modules exceed the prospective 8 KiB package budget');
writeJSON(path.join(artifacts,'cooldown-package-verification.json'),{...result,typeConsumer:true,asyncMutationsRejected:true,modules,archive:packed.integrity,output,consumer,node:process.version});console.log(result);
