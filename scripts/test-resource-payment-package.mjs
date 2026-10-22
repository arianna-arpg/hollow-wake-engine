import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {root,writeJSON} from './reference-utils.mjs';
const artifacts=path.join(root,'.artifacts'),npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const archive=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',artifacts,'--cache',path.join(artifacts,'npm-cache')],{cwd:root,encoding:'utf8'}))[0];
const consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-payment-'));writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',path.join(artifacts,archive.filename),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe'});
fs.copyFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/examples/resource-payment.mjs'),path.join(consumer,'resource-payment.mjs'));
fs.writeFileSync(path.join(consumer,'run.mjs'),`
import assert from 'node:assert/strict';
Math.random=()=>{throw new Error('Ambient RNG');};globalThis.fetch=()=>{throw new Error('Network');};
for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw new Error(key);}});
const {paymentCycle}=await import('./resource-payment.mjs');const result=paymentCycle();
assert.deepEqual(result,{admitted:[true,true,true],refused:true,events:[{actor:'fighter',amount:10,remaining:90}],mage:{mana:0,es:20,debt:5,reserved:5},fighter:{life:40,debt:5,reserved:5}});
console.log(JSON.stringify({installedConsumer:true,shippedExample:true,result}));
`);
fs.writeFileSync(path.join(consumer,'consumer.ts'),`
import {ResourcePayment,type ResourcePaymentPorts,type PaymentState,type PaymentDebt,type PaymentSpec,type ResourceCost} from '@hollow-wake/engine/resources/payment';
type Loan=PaymentDebt&{spec:PaymentSpec};type Actor=PaymentState<Loan>&{name:string};type Context={extra:readonly number[]};
declare const ports:ResourcePaymentPorts<Actor,Loan,Context>;declare const actor:Actor;declare const cost:ResourceCost;
const policy=new ResourcePayment(ports);const affordable:boolean=policy.canAfford(actor,cost);
if(affordable)policy.pay(actor,cost);policy.advanceDebt(actor,.016,8);
const mana:number=policy.availableMana(actor),life:number=policy.lifeCeiling(actor),room:number=policy.headroom(actor,'life');
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022'],types:[]},include:['consumer.ts']});
execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(consumer,'tsconfig.json')],{cwd:consumer,stdio:'pipe'});
const result=JSON.parse(execFileSync(process.execPath,['run.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,NODE_PATH:''}}));assert(result.installedConsumer&&result.shippedExample);
writeJSON(path.join(artifacts,'resource-payment-package-verification.json'),{...result,typeConsumer:true,node:process.version,runtimeArchive:archive.integrity});console.log(result);
