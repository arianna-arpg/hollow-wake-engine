import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {root,writeJSON} from './reference-utils.mjs';import {buildResourceContent} from './compile-resource-content.mjs';
const a=path.join(root,'.artifacts'),content=path.join(a,'resource-content-package');buildResourceContent(content);
const npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const archives=[root,content].map(cwd=>JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',a,'--cache',path.join(a,'npm-cache')],{cwd,encoding:'utf8'}))[0]);
assert(archives[1].unpackedSize<=48*1024);
const consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-resource-events-'));writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',...archives.map(p=>path.join(a,p.filename)),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe'});
for(const file of ['resource-cycle.mjs','resource-events.mjs'])fs.copyFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/examples',file),path.join(consumer,file));
fs.writeFileSync(path.join(consumer,'run.mjs'),`
import fs from 'node:fs';import assert from 'node:assert/strict';
Math.random=()=>{throw new Error('Ambient RNG');};globalThis.fetch=()=>{throw new Error('Network');};for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw new Error(key);}});
const {resourceEventCycle}=await import('./resource-events.mjs');
const pack=JSON.parse(fs.readFileSync(new URL(import.meta.resolve('@hollow-wake/resource-content/resources.json')))),result=resourceEventCycle(pack);
assert.deepEqual(result,{ready:true,power:.25,soulsBefore:4,flask:1,duringLock:0,afterLock:1,distantBank:0,distantGauge:0,randomDraws:0});
console.log(JSON.stringify({installedConsumer:true,shippedExamples:true,cycle:result,contentId:pack.contentId}));
`);
fs.writeFileSync(path.join(consumer,'consumer.ts'),`
import {ResourceEvents,type ResourceEventPorts,type ResourceEventSkill,type ResourceEvent} from '@hollow-wake/engine/resources/events';
type Position={x:number;y:number};type Victim={rarity:string};type Actor={skills:ResourceEventSkill[]};
declare const ports:ResourceEventPorts<Actor,ResourceEventSkill,Position,Victim>;declare const actor:Actor;
const runtime=new ResourceEvents(ports,{deathRadius:360});const event:ResourceEvent='enemyDeath';
runtime.dispatch(actor,event,{x:0,y:0});runtime.fires(actor,actor.skills[0],{on:'hit',amount:1,chance:.5},'hit',undefined,undefined,{rarity:'rare'});
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022'],types:[]},include:['consumer.ts']});
execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(consumer,'tsconfig.json')],{cwd:consumer,stdio:'pipe'});
const result=JSON.parse(execFileSync(process.execPath,['run.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,NODE_PATH:''}}));
writeJSON(path.join(a,'resource-event-package-verification.json'),{...result,typeConsumer:true,node:process.version,runtimeArchive:archives[0].integrity});console.log(result);
