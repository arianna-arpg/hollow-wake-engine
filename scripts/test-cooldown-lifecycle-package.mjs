import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {root,sha256,writeJSON} from './reference-utils.mjs';
const directory=fs.mkdtempSync(path.join(root,'.artifacts/clock-package-')),npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const [packed]=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',directory,'--cache',path.join(root,'.artifacts/npm-cache')],{cwd:root,encoding:'utf8'}));
const consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-clock-'));writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});execFileSync(process.execPath,[npm,'install',path.join(directory,packed.filename),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe'});
fs.copyFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/examples/cooldown-lifecycle.mjs'),path.join(consumer,'example.mjs'));
fs.writeFileSync(path.join(consumer,'run.mjs'),`import assert from 'node:assert/strict';
Math.random=()=>{throw Error('Ambient randomness');};Date.now=()=>{throw Error('Ambient time');};globalThis.window=undefined;
const {runCooldownCycle}=await import('./example.mjs');const a=runCooldownCycle(),b=runCooldownCycle();
assert.deepEqual(a,{price:6,visited:1,clocks:[['other',2]],totals:[['other',8]],position:{x:10,y:3,z:-2}});assert.deepEqual(b,a);assert.notEqual(a.clocks,b.clocks);console.log(JSON.stringify(a));`);
fs.writeFileSync(path.join(consumer,'types.ts'),`import {advanceSkillCooldowns,calculateSkillCooldown,stampSkillCooldown,refundSkillCooldown,refundCooldownsOnOrb,reduceOtherSkillCooldowns,type RecoveryPorts,type CooldownPricePorts,type CooldownWrites,type OtherCooldownEffect} from '@hollow-wake/engine/combat/cooldown-lifecycle';
const skill={def:{id:'dash'}},actor={skills:[skill,null],cooldowns:new Map<string,number>(),cooldownTotals:new Map<string,number>()};
const rates:RecoveryPorts<typeof actor,typeof skill>={global:()=>1,hasTagged:()=>false,scoped:()=>2};advanceSkillCooldowns(actor,1,rates);
const pricing:CooldownPricePorts<typeof actor,typeof skill,Set<string>,readonly number[]>={tags:()=>new Set(),modifiers:()=>[],absorbCooldown:()=>undefined,read:()=>1};
const price:number=calculateSkillCooldown(actor,skill,10,pricing);stampSkillCooldown(actor,skill,10,{price:()=>price,ultimateCap:()=>3});refundSkillCooldown(actor,'dash');refundCooldownsOnOrb(actor,'life',{seconds:()=>1});
const visits:number=reduceOtherSkillCooldowns(actor,skill.def,{type:'reduceCooldowns',fraction:0.2});
// @ts-expect-error Host stat reads are synchronous.
const asyncRate:RecoveryPorts<typeof actor,typeof skill>={...rates,global:async()=>1};
// @ts-expect-error Clock writes cannot be asynchronous.
const asyncWrite:CooldownWrites={set:async()=>actor.cooldowns,delete:()=>true};
// @ts-expect-error Effect family is distinct from proc reductions.
const wrong:OtherCooldownEffect={type:'cooldown',seconds:1};
// @ts-expect-error Definition identity remains live; a copied id is not accepted.
reduceOtherSkillCooldowns(actor,'dash',{type:'reduceCooldowns'});
// @ts-expect-error Borrowed clocks must support mutation.
advanceSkillCooldowns({...actor,cooldowns:actor.cooldowns as ReadonlyMap<string,number>},1,rates);
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022'],types:[]},include:['types.ts']});
try{execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(consumer,'tsconfig.json')],{cwd:consumer,stdio:'pipe'});}catch(error){console.error(String(error.stdout??''));throw error;}
const result=JSON.parse(execFileSync(process.execPath,['run.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,NODE_PATH:''}})),bytes=fs.readFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/dist/cooldown-lifecycle.js'));assert(bytes.equals(fs.readFileSync(path.join(root,'dist/cooldown-lifecycle.js'))));assert(bytes.length<=6144);
const report={passed:true,directory,consumer,result,installedConsumer:true,typeConsumer:true,isolatedSimulations:true,jsBytes:bytes.length,moduleSha256:sha256(bytes),integrity:packed.integrity};writeJSON('.artifacts/cooldown-lifecycle-package.json',report);console.log(report);
