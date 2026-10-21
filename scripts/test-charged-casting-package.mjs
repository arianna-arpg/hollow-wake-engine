import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {root,writeJSON} from './reference-utils.mjs';

const artifacts=path.join(root,'.artifacts');
const npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const archive=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',artifacts,'--cache',path.join(artifacts,'npm-cache')],{cwd:root,encoding:'utf8'}))[0];
const consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-charged-casting-'));
writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',path.join(artifacts,archive.filename),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe'});
fs.copyFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/examples/charged-casting.mjs'),path.join(consumer,'charged-casting.mjs'));
fs.writeFileSync(path.join(consumer,'run.mjs'),`
import assert from 'node:assert/strict';
Math.random=()=>{throw new Error('Ambient RNG');};globalThis.fetch=()=>{throw new Error('Network');};
for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw new Error(key);}});
const {chargedCastingCycle}=await import('./charged-casting.mjs');
const result=chargedCastingCycle();
assert.deepEqual(result,{delivered:[{name:'charge',power:1.25,active:false},{name:'stages',power:1.8,active:false}],stages:[{name:'stages',stage:1},{name:'stages',stage:2}],blockedStage:1,remaining:{a:[14,8],b:[0,4]},draws:0});
console.log(JSON.stringify({installedConsumer:true,shippedExample:true,result}));
`);
fs.writeFileSync(path.join(consumer,'consumer.ts'),`
import {ChargedCasting,type ChargedCastState,type ChargedCastingPorts,chargeCastDuration,overchargeCastDuration} from '@hollow-wake/engine/casting/charged';
type State=ChargedCastState & {id:string};type Actor={cast:State|null};
declare const ports:ChargedCastingPorts<Actor,State>;declare const actor:Actor;
const runtime=new ChargedCasting(ports);runtime.advance(actor,.016);
const charge:number=chargeCastDuration(2,1);const staged:number=overchargeCastDuration(.8,.75,1);
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022'],types:[]},include:['consumer.ts']});
execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(consumer,'tsconfig.json')],{cwd:consumer,stdio:'pipe'});
const result=JSON.parse(execFileSync(process.execPath,['run.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,NODE_PATH:''}}));
assert(result.installedConsumer&&result.shippedExample);
writeJSON(path.join(artifacts,'charged-casting-package-verification.json'),{...result,typeConsumer:true,node:process.version,runtimeArchive:archive.integrity});
console.log(result);
