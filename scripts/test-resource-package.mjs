import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {gunzipSync} from 'node:zlib';
import {root,writeJSON} from './reference-utils.mjs';import {buildResourceContent} from './compile-resource-content.mjs';
const a=path.join(root,'.artifacts'),content=path.join(a,'resource-content-package');buildResourceContent(content);
const npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),archives=[root,content].map(cwd=>JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',a,'--cache',path.join(a,'npm-cache')],{cwd,encoding:'utf8'}))[0]);
assert(archives[1].unpackedSize<=48*1024,'Resource content exceeded 48 KiB');assert.deepEqual(archives[1].files.map(f=>f.path).sort(),['LICENSE.md','README.md','manifest.json','package.json','resources.json']);
const consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-resources-'));writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',...archives.map(p=>path.join(a,p.filename)),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe'});
fs.copyFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/examples/resource-cycle.mjs'),path.join(consumer,'resource-cycle.mjs'));
fs.writeFileSync(path.join(consumer,'costs.json'),gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-twenty-two/resource-costs.json.gz'))));
fs.writeFileSync(path.join(consumer,'run.mjs'),`
import fs from 'node:fs';import assert from 'node:assert/strict';
Math.random=()=>{throw new Error('Ambient RNG');};globalThis.fetch=()=>{throw new Error('Network');};for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw new Error(key);}});
const {ResourceContent}=await import('@hollow-wake/engine/resources/content'),{chargeCostReady,chargePayment}=await import('@hollow-wake/engine/resources/charges'),{resourceActor,resourceCycle}=await import('./resource-cycle.mjs');
const pack=JSON.parse(fs.readFileSync(new URL(import.meta.resolve('@hollow-wake/resource-content/resources.json')))),content=new ResourceContent(pack),result=resourceCycle(pack);
assert.deepEqual(result,{wisp:1,speed:1.09,drained:4,drainingSpeed:1.17,blocked:4,released:true,ready:true,paid:{mult:1,consumed:1},retiredTreeClocks:0,feed:3,partialReady:true,power:.25,duringLock:0,afterLock:1,flaskRemaining:0,contentId:pack.contentId});
let checks=0;const actor=resourceActor(content),other=resourceActor(content),cases=JSON.parse(fs.readFileSync('costs.json')).cases;
for(const c of cases){const cost=c.cost??undefined;actor.state.charges.clear();if(cost)actor.state.charges.set(cost.charge,c.have);assert.equal(chargeCostReady(c.have,cost),c.ready);assert.deepEqual(chargePayment(c.have,cost),c.payment);assert.deepEqual(actor.runtime.pay(cost),c.payment);assert.deepEqual([...actor.state.charges],c.after.charges);checks++;}
assert.equal(other.state.charges.size,0);assert.equal(other.sheet.sourceNames().length,0);
console.log(JSON.stringify({installedConsumer:true,authoredPaymentStates:checks,cycle:result,independentActors:true}));
`);
fs.writeFileSync(path.join(consumer,'consumer.ts'),`
import {ResourceContent,type ResourceContentPack,type ResourceSkill} from '@hollow-wake/engine/resources/content';
import {ChargeRuntime,createChargeState,type ChargePorts,chargeCostReady,type ChargePayment} from '@hollow-wake/engine/resources/charges';
import {gaugeEffOf,gaugeSpend,type GaugeInstance,type GaugeTerms} from '@hollow-wake/engine/resources/gauges';
import type {Modifier} from '@hollow-wake/engine';
declare const pack:ResourceContentPack;const content=new ResourceContent(pack);
type Skill={def:ResourceSkill}&GaugeInstance;declare const ports:ChargePorts<Skill,Modifier>;const runtime=new ChargeRuntime(createChargeState(),ports);
const skill=content.skill('grave_tide')!;const terms:GaugeTerms=gaugeEffOf(skill.gauge!,1,1,1,content.pack.gaugeTuning);gaugeSpend({def:skill} as Skill,skill.gauge!,terms);
const paid:ChargePayment=runtime.pay(content.support('slow_brew')?.chargeCost);const ready:boolean=chargeCostReady(5,skill.chargeCost);void paid;void ready;
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022'],types:[]},include:['consumer.ts']});
execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(consumer,'tsconfig.json')],{cwd:consumer,stdio:'pipe'});
const result=JSON.parse(execFileSync(process.execPath,['run.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,NODE_PATH:''}}));
writeJSON(path.join(a,'resource-package-verification.json'),{...result,typeConsumer:true,node:process.version,archiveBytes:archives[1].size,unpackedBytes:archives[1].unpackedSize});console.log(result);
