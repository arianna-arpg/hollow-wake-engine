import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {root,sha256,writeJSON} from './reference-utils.mjs';
const artifacts=path.join(root,'.artifacts'),output=fs.mkdtempSync(path.join(artifacts,'life-recovery-package-')),
  npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const [packed]=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',output,'--cache',path.join(artifacts,'npm-cache')],{cwd:root,encoding:'utf8'}));
const consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-recovery-'));writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',path.join(output,packed.filename),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe'});
fs.copyFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/examples/life-recovery.mjs'),path.join(consumer,'example.mjs'));
fs.writeFileSync(path.join(consumer,'run.mjs'),`
import assert from 'node:assert/strict';
Math.random=()=>{throw Error('Ambient randomness');};Date.now=()=>{throw Error('Ambient clock');};globalThis.fetch=()=>{throw Error('Network');};
for(const key of ['window','document','localStorage','performance'])Object.defineProperty(globalThis,key,{get(){throw Error(key);}});
const {recoveryExample}=await import('./example.mjs'),first=recoveryExample(),second=recoveryExample();
assert.deepEqual(first,{signalled:true,afterHeal:70,refilled:100,eventTotal:20,stamps:1});
assert.deepEqual(second,first);assert.notEqual(first,second);
console.log(JSON.stringify({installedConsumer:true,isolatedSimulations:true,first}));
`);
let types=`
import {healLife,refillLife,applyProcHeal,type HealingState,type LifeRecoveryPorts,type ProcHealingEffect} from '@hollow-wake/engine/combat/recovery';
import {compileProcHealingEffect} from '@hollow-wake/engine/combat/recovery-content';
interface Actor extends HealingState {id:string;heal(amount:number):number}
const ports:LifeRecoveryPorts<Actor>={ceiling:a=>100,maximumLife:a=>100,rate:a=>1,recent:a=>undefined,
  tapped:(a,n)=>undefined,observed:(a,n,silent)=>undefined};
const actor:Actor={id:'hero',life:50,dead:false,healedSince:0,heal(amount){return healLife(this,amount,ports);}};
const compiled=compileProcHealingEffect({type:'heal',flat:3});
applyProcHeal(actor,compiled,ports,actor.heal);refillLife(actor,ports);
// @ts-expect-error Healing requires the event accumulator and death gate.
healLife({life:50},3,ports);
// @ts-expect-error Targeted skill fields are a separate schema.
const skill:ProcHealingEffect={type:'heal',amount:3};
// @ts-expect-error Owned content is readonly.
compiled.flat=5;
// @ts-expect-error The method retains its receiver type.
applyProcHeal(actor,compiled,ports,function(this:number,n:number){return n;});
// @ts-expect-error Host ports cannot require a narrower actor.
const narrow:typeof ports={...ports,rate:(a:Actor & {extra:number})=>a.extra};
`;
for(const key of ['ceiling','maximumLife','rate','tapped','observed','recent'])types+=`
// @ts-expect-error ${key} must complete synchronously.
const async_${key}:typeof ports={...ports,${key}:async()=>undefined};
`;
fs.writeFileSync(path.join(consumer,'consumer.ts'),types);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022'],types:[]},include:['consumer.ts']});
try{execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(consumer,'tsconfig.json')],{cwd:consumer,stdio:'pipe'});}catch(error){console.error(String(error.stdout??''));throw error;}
const result=JSON.parse(execFileSync(process.execPath,['run.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,NODE_PATH:''}}));
const modules=['life-recovery','life-recovery-content'].map(name=>{const bytes=fs.readFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/dist',name+'.js'));
  assert(bytes.equals(fs.readFileSync(path.join(root,'dist',name+'.js'))));return {name,bytes:bytes.length,sha256:sha256(bytes)};});
assert(modules.reduce((sum,module)=>sum+module.bytes,0)<=4*1024,'Recovery modules exceed the 4 KiB size allowance');
writeJSON(path.join(artifacts,'life-recovery-package-verification.json'),{...result,typeConsumer:true,asyncPortsRejected:6,modules,archive:packed.integrity,output,consumer,node:process.version});console.log(result);
