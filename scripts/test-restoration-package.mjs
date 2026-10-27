import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {root,sha256,writeJSON} from './reference-utils.mjs';
const artifacts=path.join(root,'.artifacts'),output=fs.mkdtempSync(path.join(artifacts,'restoration-package-')),
  npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const [packed]=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',output,'--cache',path.join(artifacts,'npm-cache')],{cwd:root,encoding:'utf8'}));
const consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-restoration-'));writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',path.join(output,packed.filename),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe'});
fs.copyFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/examples/resource-restoration.mjs'),path.join(consumer,'example.mjs'));
fs.writeFileSync(path.join(consumer,'run.mjs'),`
import assert from 'node:assert/strict';
Math.random=()=>{throw Error('Ambient randomness');};Date.now=()=>{throw Error('Ambient clock');};globalThis.fetch=()=>{throw Error('Network');};
for(const key of ['window','document','localStorage','performance'])Object.defineProperty(globalThis,key,{get(){throw Error(key);}});
const {restorationExample}=await import('./example.mjs'),first=restorationExample(),second=restorationExample();
assert.deepEqual(first,{shieldGain:30,poiseGain:100,mana:60,events:1,procGrew:true,sharedTags:true,otherMana:40,notices:1});
assert.deepEqual(second,first);assert.notEqual(first,second);
console.log(JSON.stringify({installedConsumer:true,isolatedSimulations:true,first}));
`);
let types=`
import {gainEnergyShield,gainPoise,applyInstantRestoration,applyProcRestoration,
 type ShieldGainState,type PoiseGainState,type InstantRestorationState,type ProcRestorationState,
 type ResourceRestorationPorts,type ProcRestorationEffect} from '@hollow-wake/engine/combat/restoration';
import {compileInstantRestorationEffect,compileProcRestorationEffect} from '@hollow-wake/engine/combat/restoration-content';
interface Actor extends ShieldGainState,PoiseGainState,InstantRestorationState<string[]>,ProcRestorationState {id:string}
interface Cue {color:string}
const ports:ResourceRestorationPorts<Actor,Cue>={maximumShield:()=>100,maximumPoise:()=>80,maximumMana:()=>100,
 poiseOvercharge:()=>.5,availableMana:()=>60,restoreLife:()=>0,restoreShield:()=>0,restorePoise:()=>0,
 gainShield:(a,n)=>gainEnergyShield(a,n,ports),gainPoise:(a,n)=>gainPoise(a,n,ports),noteGain:()=>undefined};
const actor:Actor={id:'hero',dead:false,mana:40,es:40,poise:40,esDelay:5,esJustFilled:false,gainEvents:[]};
const instant=compileInstantRestorationEffect({type:'restore',resource:'es',amount:3});
const proc=compileProcRestorationEffect({type:'restore',resource:'mana',pctMax:.2});
applyInstantRestoration<Actor,string[],Cue>(actor,instant,ports,{tags:['spell'],feedingCue:{color:'blue'}});
applyInstantRestoration<Actor,string[],Cue>(actor,instant,ports,{feedingCue:false});
applyProcRestoration(actor,proc,ports);gainEnergyShield(actor,3,ports);gainPoise(actor,4,ports);
// @ts-expect-error Shield gains require the death gate and full flag.
gainEnergyShield({es:50},3,ports);
// @ts-expect-error Proc life healing has a separate schema.
const life:ProcRestorationEffect={type:'restore',resource:'life'};
// @ts-expect-error Owned content is readonly.
proc.flat=5;
// @ts-expect-error Tags keep the host's exact type.
applyInstantRestoration<Actor,string[],Cue>(actor,instant,ports,{tags:2});
// @ts-expect-error Cue specifications keep the host's exact type.
applyInstantRestoration<Actor,string[],Cue>(actor,instant,ports,{feedingCue:{wrong:1}});
// @ts-expect-error Host ports cannot require a narrower actor.
const narrow:typeof ports={...ports,maximumShield:(a:Actor & {extra:number})=>a.extra};
// @ts-expect-error Event queue append must complete synchronously.
const asyncQueue:InstantRestorationState<string[]>={mana:0,esDelay:0,gainEvents:{length:0,push:async()=>1}};
`;
const portNames=['maximumShield','maximumPoise','maximumMana','poiseOvercharge','availableMana',
  'restoreLife','restoreShield','restorePoise','gainShield','gainPoise','noteGain'];
for(const key of portNames)types+=`
// @ts-expect-error ${key} must complete synchronously.
const async_${key}:typeof ports={...ports,${key}:async()=>undefined};
`;
fs.writeFileSync(path.join(consumer,'consumer.ts'),types);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022'],types:[]},include:['consumer.ts']});
try{execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(consumer,'tsconfig.json')],{cwd:consumer,stdio:'pipe'});}catch(error){console.error(String(error.stdout??''));throw error;}
const result=JSON.parse(execFileSync(process.execPath,['run.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,NODE_PATH:''}}));
const modules=['resource-restoration','resource-restoration-content'].map(name=>{const bytes=fs.readFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/dist',name+'.js'));
  assert(bytes.equals(fs.readFileSync(path.join(root,'dist',name+'.js'))));return {name,bytes:bytes.length,sha256:sha256(bytes)};});
assert(modules.reduce((sum,module)=>sum+module.bytes,0)<=8192,'Restoration modules exceed the fixed 8 KiB allowance');
writeJSON(path.join(artifacts,'restoration-package-verification.json'),{...result,typeConsumer:true,asyncPortsRejected:portNames.length,
  asyncQueueRejected:true,modules,archive:packed.integrity,output,consumer,node:process.version});console.log(result);
