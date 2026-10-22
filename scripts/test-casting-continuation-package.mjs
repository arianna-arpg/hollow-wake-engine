import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {root,writeJSON} from './reference-utils.mjs';
const artifacts=path.join(root,'.artifacts');
const npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const archive=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',artifacts,'--cache',path.join(artifacts,'npm-cache')],{cwd:root,encoding:'utf8'}))[0];
const consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-continuation-'));
writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',path.join(artifacts,archive.filename),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe'});
fs.copyFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/examples/casting-continuation.mjs'),path.join(consumer,'casting-continuation.mjs'));
fs.writeFileSync(path.join(consumer,'run.mjs'),`
import assert from 'node:assert/strict';
Math.random=()=>{throw new Error('Ambient RNG');};globalThis.fetch=()=>{throw new Error('Network');};
for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw new Error(key);}});
const {continuationCycle}=await import('./casting-continuation.mjs');const result=continuationCycle();
assert.deepEqual(result,{started:true,ownedAim:true,early:false,completed:true,refused:false,mana:16,targetLife:38,recovery:.1,
events:['acted','paid','opening','delivered','clicked','castseal']});
console.log(JSON.stringify({installedConsumer:true,shippedExample:true,threeDimensionalAim:true,requestThroughDelivery:true,result}));
`);
fs.writeFileSync(path.join(consumer,'consumer.ts'),`
import {CastingContinuation,type CastingContinuationPorts,type ContinuationActor,type ContinuationInstance,type ContinuationCast}
from '@hollow-wake/engine/casting/continuation';
interface Skill extends ContinuationInstance {sockets:readonly string[]}
interface Aim {x:number;y:number;z:number}
interface Cast extends ContinuationCast<Skill,Aim,string> {hostField?:string}
interface Actor extends ContinuationActor<Cast,Aim,string> {id:string;name:string}
interface Target {actor?:Actor;surface:string}
type Tags=ReadonlySet<'spell'|'attack'>;type Mods=readonly {value:number}[];
declare const ports:CastingContinuationPorts<Actor,Skill,Cast,Aim,Target,Tags,Mods,string>;
declare const actor:Actor,skill:Skill,aim:Aim;
const policy=new CastingContinuation<Actor,Skill,Cast,Aim,Target,Tags,Mods,string>(ports,{channelGrace:.9,focusSlack:30});
const inferred=new CastingContinuation(ports,{channelGrace:.9,focusSlack:30});
const result:void=inferred.advance(actor,.016);policy.press(actor);
const cast:Cast={inst:skill,mode:'concentration',aim,elapsed:0,total:1,held:true,baseMult:1,quarryId:'quarry'};
// @ts-expect-error A 2D aim cannot silently discard this host's third dimension.
cast.aim={x:1,y:2};
// @ts-expect-error Quarry identity follows the host, not a fixed numeric ABI.
cast.quarryId=4;
// @ts-expect-error Continuation mutates borrowed state and does not return a receipt.
const receipt:boolean=policy.advance(actor,.016);
// @ts-expect-error The host's cast retains its concrete skill type.
cast.inst={def:{id:'missing-sockets',cooldown:0}};
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022'],types:[]},include:['consumer.ts']});
try {
  execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(consumer,'tsconfig.json')],{cwd:consumer,stdio:'pipe'});
} catch(error) {console.error(String(error.stdout??''),String(error.stderr??''));throw error;}
const result=JSON.parse(execFileSync(process.execPath,['run.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,NODE_PATH:''}}));
assert(result.installedConsumer&&result.requestThroughDelivery&&result.threeDimensionalAim);
writeJSON(path.join(artifacts,'casting-continuation-package-verification.json'),{...result,typeConsumer:true,node:process.version,runtimeArchive:archive.integrity});
console.log(result);
