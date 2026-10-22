import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {root,writeJSON} from './reference-utils.mjs';
const artifacts=path.join(root,'.artifacts'),npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const archive=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',artifacts,'--cache',path.join(artifacts,'npm-cache')],{cwd:root,encoding:'utf8'}))[0];
const consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-admission-'));writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',path.join(artifacts,archive.filename),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe'});
fs.copyFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/examples/skill-admission.mjs'),path.join(consumer,'skill-admission.mjs'));
fs.writeFileSync(path.join(consumer,'run.mjs'),`
import assert from 'node:assert/strict';
Math.random=()=>{throw new Error('Ambient RNG');};globalThis.fetch=()=>{throw new Error('Network');};
for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw new Error(key);}});
const {admissionCycle}=await import('./skill-admission.mjs');const result=admissionCycle();
assert.deepEqual(result,{busy:false,banksWhileBusy:0,ready:true,ammo:3,broke:false,reflex:true,castPreserved:true,life:90,mana:0});
console.log(JSON.stringify({installedConsumer:true,shippedExample:true,result}));
`);
fs.writeFileSync(path.join(consumer,'consumer.ts'),`
import {SkillAdmission,type SkillAdmissionPorts,type AdmissionState,type AdmissionSkill,type AdmissionGate,type AdmissionDelivery} from '@hollow-wake/engine/casting/admission';
type Actor=AdmissionState<AdmissionSkill>&{name:string};
declare const ports:SkillAdmissionPorts<Actor,AdmissionSkill,AdmissionGate,AdmissionDelivery>;
declare const actor:Actor;declare const skill:AdmissionSkill;
const policy=new SkillAdmission(ports);const ready:boolean=policy.canUse(actor,skill);
const refusal:AdmissionGate|null=policy.unmetGate(actor,skill);
const body:boolean=policy.canAct(actor),reflex:boolean=policy.isReflex(actor,skill),prime:boolean=policy.primedPourOpen(actor,skill);
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022'],types:[]},include:['consumer.ts']});
execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(consumer,'tsconfig.json')],{cwd:consumer,stdio:'pipe'});
const result=JSON.parse(execFileSync(process.execPath,['run.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,NODE_PATH:''}}));assert(result.installedConsumer&&result.shippedExample);
writeJSON(path.join(artifacts,'skill-admission-package-verification.json'),{...result,typeConsumer:true,node:process.version,runtimeArchive:archive.integrity});console.log(result);
