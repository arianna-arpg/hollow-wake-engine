import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const artifacts=path.join(root,'.artifacts'),output=fs.mkdtempSync(path.join(artifacts,'proc-effects-package-'));
const npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const packed=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',output,'--cache',path.join(artifacts,'npm-cache')],{cwd:root,encoding:'utf8'}))[0];
const consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-proc-effects-'));writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',path.join(output,packed.filename),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe'});
fs.copyFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/examples/proc-effects.mjs'),path.join(consumer,'example.mjs'));
fs.writeFileSync(path.join(consumer,'run.mjs'),`
import assert from 'node:assert/strict';
Math.random=()=>{throw new Error('Ambient random');};globalThis.fetch=()=>{throw new Error('Network');};
for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw new Error(key);}});
const {wardCycle}=await import('./example.mjs');const expected={ward:226,draws:3,nextReady:4,cues:[{time:0,ward:116},{time:2,ward:226}],tails:[{time:0,depth:0},{time:2,depth:0}]};
const first=wardCycle(),second=wardCycle();assert.deepEqual(first,expected);assert.deepEqual(second,expected);assert.notEqual(first.cues,second.cues);
const {gainWard,scaleProcEffect,applyWardEffect}=await import('@hollow-wake/engine/combat/effects');
const dead={dead:true,ward:8};assert.equal(gainWard(dead,10,{rate(){throw new Error('Dead query');}}),0);
const fx=Object.freeze({type:'ward',flat:10});assert.equal(scaleProcEffect(fx,1),fx);assert.equal(scaleProcEffect(fx,0),fx);assert.equal(scaleProcEffect(fx,2).flat,20);
const body={dead:false,ward:0};assert.equal(applyWardEffect(body,fx,{maximumLife:()=>100,gain(a,n){return gainWard(a,n,{rate:()=>.5});}}),true);assert.equal(body.ward,5);
console.log(JSON.stringify({installedConsumer:true,...first,isolatedSimulations:true}));
`);
fs.writeFileSync(path.join(consumer,'consumer.ts'),`
import {scaleProcEffect,gainWard,applyWardEffect,type WardState,type WardResourcePorts,type WardEffectPorts,type WardEffect} from '@hollow-wake/engine/combat/effects';
interface Body extends WardState {id:string}
const body:Body={id:'hero',dead:false,ward:0};const rate:WardResourcePorts<Body>={rate:a=>a.id?1:0};
const ports:WardEffectPorts<Body>={maximumLife:()=>100,gain:(a,n)=>gainWard(a,n,rate)};
const scaled=scaleProcEffect({type:'ward',flat:10} as const,2);const kind:'ward'=scaled.type;const magnitude:number|undefined=scaled.flat;
const effect:WardEffect=scaled;applyWardEffect(body,effect,ports);
const ordinary=scaleProcEffect({type:'ward',flat:10,pctMaxLife:.1,applicationId:'ward'},2);applyWardEffect(body,ordinary,ports);
const cast=scaleProcEffect({type:'cast',cast:{skillId:'firebolt',mult:0,metadata:{voice:'blue'}}},2);const castKind:'cast'=cast.type;
// @ts-expect-error Scaling cannot preserve an authored numeric literal type.
const literal:10=scaled.flat;
// @ts-expect-error Resource ports preserve the host actor subtype.
gainWard({dead:false,ward:0},1,rate);
// @ts-expect-error Effect ports preserve the host actor subtype.
applyWardEffect({ward:0},effect,ports);
// @ts-expect-error Asynchronous rate ports are not valid.
const asyncRate:WardResourcePorts<Body>={rate:async()=>1};
// @ts-expect-error Magnitudes are numeric.
scaleProcEffect({type:'ward',flat:'10'},2);
// @ts-expect-error Known typed shapes do not imply an unknown executor.
scaleProcEffect({type:'future-effect'},2);
// @ts-expect-error Minimum magnitude types do not promise arbitrary metadata.
const metadata=scaled.metadata;
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022'],types:[]},include:['consumer.ts']});
try{execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(consumer,'tsconfig.json')],{cwd:consumer,stdio:'pipe'});}catch(error){console.error(String(error.stdout??''),String(error.stderr??''));throw error;}
const result=JSON.parse(execFileSync(process.execPath,['run.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,NODE_PATH:''}}));
const installed=fs.readFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/dist/proc-effects.js'));assert(installed.equals(fs.readFileSync(path.join(root,'dist/proc-effects.js'))));assert(installed.length<=4096);
writeJSON(path.join(artifacts,'proc-effects-package-verification.json'),{...result,typeConsumer:true,moduleBytes:installed.length,moduleSha256:sha256(installed),archive:packed.integrity,output,consumer,node:process.version});console.log(result);
