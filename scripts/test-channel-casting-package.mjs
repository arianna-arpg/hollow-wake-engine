import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {root,writeJSON} from './reference-utils.mjs';
const artifacts=path.join(root,'.artifacts'),npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const archive=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',artifacts,'--cache',path.join(artifacts,'npm-cache')],{cwd:root,encoding:'utf8'}))[0];
const consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-channel-'));writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',path.join(artifacts,archive.filename),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe'});
fs.copyFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/examples/channel-casting.mjs'),path.join(consumer,'channel-casting.mjs'));
fs.writeFileSync(path.join(consumer,'run.mjs'),`
import assert from 'node:assert/strict';
Math.random=()=>{throw new Error('Ambient RNG');};
globalThis.fetch=()=>{throw new Error('Network');};
for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw new Error(key);}});
const {channelCycle}=await import('./channel-casting.mjs');const result=channelCycle();
assert.deepEqual(result,{deliveries:[
 {actor:'rain',kind:'pulse',power:1.25},{actor:'rain',kind:'pulse',power:1.5},
 {actor:'gather',kind:'release',power:1},{actor:'rain',kind:'persist',power:1.21875},
 {actor:'rain',kind:'persist',power:.9375}],completions:['gather'],rainMana:4,gatherMana:8,
 spentBrim:0,remainingPersists:0,bothReleased:true});
console.log(JSON.stringify({installedConsumer:true,shippedExample:true,result}));
`);
fs.writeFileSync(path.join(consumer,'consumer.ts'),`
import {ChannelCasting,channelInterval,channelWindup,channelRamp,channelCurve,advanceChannelPersistence,
 type ChannelCastState,type ChannelCastingPorts,type ChannelCastSpec,type ChannelPersistence} from '@hollow-wake/engine/casting/channel';
type Actor={mana:number};type State=ChannelCastState&{spec:ChannelCastSpec};type Target={id:number};type Context={mods:readonly number[]};
declare const ports:ChannelCastingPorts<Actor,State,Target,Context>;
declare const actor:Actor;declare const state:State;declare const target:Target;declare const pending:ChannelPersistence;
const runtime=new ChannelCasting(ports,.5);runtime.advance(actor,state,.016,target);
const interval:number=channelInterval(1,2);const windup:number=channelWindup(.2,2);
const ramp:number=channelRamp({per:.5,max:2,curve:'exponential'},1);const curve:number=channelCurve('quadIn',.5);
const outcome:number|null|undefined=advanceChannelPersistence(pending,.016,false);
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022'],types:[]},include:['consumer.ts']});
execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(consumer,'tsconfig.json')],{cwd:consumer,stdio:'pipe'});
const result=JSON.parse(execFileSync(process.execPath,['run.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,NODE_PATH:''}}));assert(result.installedConsumer&&result.shippedExample);
writeJSON(path.join(artifacts,'channel-casting-package-verification.json'),{...result,typeConsumer:true,node:process.version,runtimeArchive:archive.integrity});console.log(result);
