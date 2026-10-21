import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {root,writeJSON} from './reference-utils.mjs';
const artifacts=path.join(root,'.artifacts'),npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const archive=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',artifacts,'--cache',path.join(artifacts,'npm-cache')],{cwd:root,encoding:'utf8'}))[0];
const consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-interactive-casting-'));writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',path.join(artifacts,archive.filename),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe'});
fs.copyFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/examples/interactive-casting.mjs'),path.join(consumer,'interactive-casting.mjs'));
fs.writeFileSync(path.join(consumer,'run.mjs'),`
import assert from 'node:assert/strict';
Math.random=()=>{throw new Error('Ambient RNG');};globalThis.fetch=()=>{throw new Error('Network');};
for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw new Error(key);}});
const {interactiveCastingCycle}=await import('./interactive-casting.mjs');const result=interactiveCastingCycle();
assert.deepEqual(result,{deliveries:[{kind:'timing',power:1.7,active:false},{kind:'focus',power:1,active:false}],cues:['perfect'],fizzles:1,resources:{focus:[8,6],timed:[14,8]},cooldowns:[1,2]});
console.log(JSON.stringify({installedConsumer:true,shippedExample:true,result}));
`);
fs.writeFileSync(path.join(consumer,'consumer.ts'),`
import {advanceFocusCast,pressCastTiming,focusCastDuration,focusWithinReach,focusFizzleCooldown,type FocusCastState,type FocusCastSpec,type FocusCastOutcome,type CastPressState,type CastTimingCue} from '@hollow-wake/engine/casting/interactive';
const focus:FocusCastState={elapsed:0,total:focusCastDuration(2,1),held:true};const spec:FocusCastSpec={time:2};
const outcome:FocusCastOutcome|undefined=advanceFocusCast(focus,spec,.016,focusWithinReach(10,20));
if(outcome?.kind==='release'){const multiplier:number=outcome.multiplier;}
const cast:CastPressState={mode:'perfect',elapsed:.75,total:1};const cue:CastTimingCue|undefined=pressCastTiming(cast);
const clock:number=focusFizzleCooldown(2,1,1);
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022'],types:[]},include:['consumer.ts']});
execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(consumer,'tsconfig.json')],{cwd:consumer,stdio:'pipe'});
const result=JSON.parse(execFileSync(process.execPath,['run.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,NODE_PATH:''}}));assert(result.installedConsumer&&result.shippedExample);
writeJSON(path.join(artifacts,'interactive-casting-package-verification.json'),{...result,typeConsumer:true,node:process.version,runtimeArchive:archive.integrity});console.log(result);
