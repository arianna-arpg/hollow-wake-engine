import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const directory=fs.mkdtempSync(path.join(root,'.artifacts/sequence-recovery-package-')),npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const [packed]=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',directory,'--cache',path.join(root,'.artifacts/npm-cache')],{cwd:root,encoding:'utf8'}));
const consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-sequence-recovery-'));writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',path.join(directory,packed.filename),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe'});
fs.copyFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/examples/sequence-recovery.mjs'),path.join(consumer,'example.mjs'));
fs.writeFileSync(path.join(consumer,'run.mjs'),`import assert from 'node:assert/strict';
Math.random=()=>{throw Error('Ambient RNG');};Date.now=()=>{throw Error('Ambient clock');};globalThis.window=undefined;
const {runSequenceRecoveryCycle}=await import('./example.mjs');const a=runSequenceRecoveryCycle(),b=runSequenceRecoveryCycle();
assert.deepEqual(a,{flyingHeld:true,airborneHeld:true,groundedHeld:true,returnedReady:true,caught:0,removed:2,done:true,clocks:[['axe',1]],totals:[['axe',1]],active:0});assert.deepEqual(b,a);assert.notEqual(a.clocks,b.clocks);assert.notEqual(a.totals,b.totals);console.log(JSON.stringify(a));`);
fs.writeFileSync(path.join(consumer,'types.ts'),`import {lockSequenceRecovery,releaseSequenceRecovery,settleSequenceRecoveries,type SequenceRecoveryPorts} from '@hollow-wake/engine/combat/sequence-recovery';
const owner={skillRecoveryLocks:new Set<string>(),cooldowns:new Map<string,number>(),cooldownTotals:new Map<string,number>()};
const state={owner,host:{def:{id:'axe'}},spec:{recovery:{missCooldown:1},catchBuff:true},caught:0,key:'catch'};
const cast={state,caught:0,connected:false,done:false},active=new Set([cast]);
const ports:SequenceRecoveryPorts<typeof cast>={flying:(_c,s)=>{const key:string=s.key;return !!key;},pending:()=>false,objects:()=>[],clearCatch:s=>{const key:string=s.key;void key;}};
lockSequenceRecovery(state);settleSequenceRecoveries(active,ports);releaseSequenceRecovery(state,false);
// @ts-expect-error Catch publication must finish synchronously.
const bad:SequenceRecoveryPorts<typeof cast>={...ports,clearCatch:async()=>{}};
// @ts-expect-error Queue observations cannot be asynchronous.
const badQueue:SequenceRecoveryPorts<typeof cast>={...ports,pending:async()=>false};
// @ts-expect-error Settlement removes completed casts.
settleSequenceRecoveries(active as ReadonlySet<typeof cast>,ports);
// @ts-expect-error Locking needs writable clocks.
lockSequenceRecovery({...state,owner:{...owner,cooldowns:owner.cooldowns as ReadonlyMap<string,number>}});
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022'],types:[]},include:['types.ts']});
try{execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(consumer,'tsconfig.json')],{cwd:consumer,stdio:'pipe'});}catch(error){console.error(String(error.stdout??''));throw error;}
const result=JSON.parse(execFileSync(process.execPath,['run.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,NODE_PATH:''}}));
const bytes=fs.readFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/dist/sequence-recovery.js'));assert(bytes.equals(fs.readFileSync('dist/sequence-recovery.js')));assert(bytes.length<=4096);
const report={passed:true,directory,consumer,result,installedConsumer:true,typeConsumer:true,isolatedSimulations:true,jsBytes:bytes.length,moduleSha256:sha256(bytes),integrity:packed.integrity};writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/sequence-recovery-package.json',report);console.log(report);
