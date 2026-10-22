import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {root,writeJSON} from './reference-utils.mjs';
const artifacts=path.join(root,'.artifacts');
const npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const archive=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',artifacts,'--cache',path.join(artifacts,'npm-cache')],{cwd:root,encoding:'utf8'}))[0];
const consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-dispatch-'));
writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',path.join(artifacts,archive.filename),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe'});
fs.copyFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/examples/skill-dispatch.mjs'),path.join(consumer,'skill-dispatch.mjs'));
fs.writeFileSync(path.join(consumer,'run.mjs'),`
import assert from 'node:assert/strict';
Math.random=()=>{throw new Error('Ambient RNG');};globalThis.fetch=()=>{throw new Error('Network');};
for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw new Error(key);}});
const {dispatchCycle}=await import('./skill-dispatch.mjs');const result=dispatchCycle();
assert.deepEqual(result,{started:true,ownedAim:true,early:false,completed:true,refused:false,mana:16,targetLife:38,
events:['acted','paid','opening','delivered','castseal']});
console.log(JSON.stringify({installedConsumer:true,shippedExample:true,threeDimensionalAim:true,result}));
`);
fs.writeFileSync(path.join(consumer,'consumer.ts'),`
import {SkillDispatch,type SkillDispatchPorts,type DispatchActor,type DispatchInstance,type DispatchZone,type DispatchCast}
from '@hollow-wake/engine/casting/dispatch';
interface Skill extends DispatchInstance {sockets:readonly string[]}
interface Aim {x:number;y:number;z:number}
interface Facing {yaw:number;pitch:number}
interface Actor extends DispatchActor<Skill,Aim,Facing,string> {id:string;name:string}
interface Zone extends DispatchZone<Actor,Skill> {hostField:number}
interface Target {actor?:Actor;surface:string}
type Tags=ReadonlySet<'spell'|'attack'>;type Mods=readonly {value:number}[];
declare const ports:SkillDispatchPorts<Actor,Skill,Aim,Facing,Target,Tags,Mods,Zone,string>;
declare const actor:Actor,skill:Skill,aim:Aim;
const policy=new SkillDispatch<Actor,Skill,Aim,Facing,Target,Tags,Mods,Zone,string>(ports);
const inferred=new SkillDispatch(ports);const result:boolean=inferred.request(actor,skill,aim,true);
policy.request(actor,skill,aim);actor.aimPos=null;
const cast:DispatchCast<Skill,Aim,string>={inst:skill,mode:'concentration',aim,elapsed:0,total:1,held:true,baseMult:1,quarryId:'quarry'};
// @ts-expect-error A 2D aim cannot silently discard this host's third dimension.
policy.request(actor,skill,{x:1,y:2});
// @ts-expect-error The host's facing representation is concrete.
actor.facing=0;
// @ts-expect-error Quarry identity follows the host, not a fixed numeric ABI.
cast.quarryId=4;
// @ts-expect-error Result is a boolean, never a continuation sentinel.
const sentinel:'continue'=policy.request(actor,skill,aim);
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022'],types:[]},include:['consumer.ts']});
execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(consumer,'tsconfig.json')],{cwd:consumer,stdio:'pipe'});
const result=JSON.parse(execFileSync(process.execPath,['run.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,NODE_PATH:''}}));
assert(result.installedConsumer&&result.shippedExample&&result.threeDimensionalAim);
writeJSON(path.join(artifacts,'skill-dispatch-package-verification.json'),{...result,typeConsumer:true,node:process.version,runtimeArchive:archive.integrity});
console.log(result);
