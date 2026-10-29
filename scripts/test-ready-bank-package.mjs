import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const directory=fs.mkdtempSync(path.join(root,'.artifacts/ready-bank-package-')),npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const [packed]=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',directory,'--cache',path.join(root,'.artifacts/npm-cache')],{cwd:root,encoding:'utf8'}));
const consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-ready-bank-'));writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',path.join(directory,packed.filename),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe'});
fs.copyFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/examples/ready-cooldown-bank.mjs'),path.join(consumer,'example.mjs'));
fs.writeFileSync(path.join(consumer,'run.mjs'),`import assert from 'node:assert/strict';
Math.random=()=>{throw Error('Ambient RNG');};Date.now=()=>{throw Error('Ambient clock');};globalThis.window=undefined;
const {runReadyBankCycle}=await import('./example.mjs');const a=runReadyBankCycle(),b=runReadyBankCycle();
assert.deepEqual(a,{extraUses:2,credit:1,ready:{hits:3,progress:0.125},after:{hits:1,progress:0.125},clocks:[],totals:[['command',8]],position:{x:10,y:3,z:-2}});
assert.deepEqual(b,a);assert.notEqual(a.ready,b.ready);assert.notEqual(a.totals,b.totals);console.log(JSON.stringify(a));`);
fs.writeFileSync(path.join(consumer,'types.ts'),`import {refundReadyCooldown,consumeReadyCooldownBank,publishReadyCooldownBank,type ReadyCooldownBankPorts,type ReadyCooldownBankPresentation} from '@hollow-wake/engine/combat/ready-cooldown-bank';
const actor={cooldowns:new Map<string,number>()},host={def:{id:'command'}},bank={owner:actor,host,bank:0};
const ports:ReadyCooldownBankPorts<typeof actor,typeof host>={enabled:()=>true,price:()=>8,maxExtra:()=>4};
const presentation:ReadyCooldownBankPresentation<typeof actor>={clear:()=>{},publish:()=>{}};
refundReadyCooldown(actor,host,bank,17,ports);const extra:number=consumeReadyCooldownBank(actor,host,bank,false,ports);publishReadyCooldownBank(bank,ports,presentation);
// @ts-expect-error Publication must finish synchronously.
const bad:ReadyCooldownBankPresentation<typeof actor>={clear:async()=>{},publish:()=>{}};
// @ts-expect-error Prices cannot be asynchronous.
const badPrice:ReadyCooldownBankPorts<typeof actor,typeof host>={...ports,price:async()=>8};
// @ts-expect-error Clock operations require a writable store.
refundReadyCooldown({cooldowns:actor.cooldowns as ReadonlyMap<string,number>},host,bank,1,ports);
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022'],types:[]},include:['types.ts']});
try{execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(consumer,'tsconfig.json')],{cwd:consumer,stdio:'pipe'});}catch(error){console.error(String(error.stdout??''));throw error;}
const result=JSON.parse(execFileSync(process.execPath,['run.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,NODE_PATH:''}}));
const bytes=fs.readFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/dist/ready-cooldown-bank.js'));assert(bytes.equals(fs.readFileSync('dist/ready-cooldown-bank.js')));assert(bytes.length<=3072);
const report={passed:true,directory,consumer,result,installedConsumer:true,typeConsumer:true,isolatedSimulations:true,jsBytes:bytes.length,moduleSha256:sha256(bytes),integrity:packed.integrity};writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/ready-bank-package.json',report);console.log(report);
