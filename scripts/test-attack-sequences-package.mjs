import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {gzipSync} from 'node:zlib';
import {root,sha256,writeJSON} from './reference-utils.mjs';
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const owned=fs.realpathSync(path.join(root,'.artifacts')),directory=fs.mkdtempSync(path.join(owned,'attack-sequences-package-owned-')),npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const consumer=path.join(directory,'consumer'),report={passed:false},captured={};
const env={...process.env,TEMP:directory,TMP:directory,TMPDIR:directory,NODE_PATH:'',NODE_COMPILE_CACHE:path.join(directory,'compile-cache')};
try{
const [packed]=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--ignore-scripts','--pack-destination',directory,'--cache',path.join(directory,'npm-cache')],{cwd:root,encoding:'utf8',windowsHide:true,env}));
fs.mkdirSync(consumer);writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',path.join(directory,packed.filename),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe',windowsHide:true,env});
fs.copyFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/examples/attack-sequences.mjs'),path.join(consumer,'example.mjs'));
fs.writeFileSync(path.join(consumer,'run.mjs'),`import assert from 'node:assert/strict';
Math.random=()=>{throw Error('Ambient random');};Date.now=()=>{throw Error('Ambient clock');};globalThis.fetch=()=>{throw Error('Network');};
for(const name of ['window','document','localStorage'])Object.defineProperty(globalThis,name,{get(){throw Error('Host API '+name);}});
const {createAttackSequenceDemo}=await import('./example.mjs');
const spec={thrown:{type:'projectile',speed:20,radius:1,range:100},recovery:{meleeRange:1,bleed:.3,missCooldown:2,look:'ground'},bounce:{seconds:2,distance:10,radius:2,charge:'charge',amount:1,cap:4,airLook:'air',nova:{count:8,power:.5}}};
const a=createAttackSequenceDemo(spec),b=createAttackSequenceDemo(spec),i=a.controller.prepare(a.owner,a.host,a.target.pos),j=b.controller.prepare(b.owner,b.host,b.target.pos);
a.controller.landed(a.owner,i,a.target,20,15,0);const p={caster:a.owner,inst:i,pos:{...a.target.pos},tier:0,mult:2};assert(a.controller.contact(p,a.target));
const marker=a.actors.find(actor=>actor.owner===a.owner);assert.equal(marker.pos.z,10);a.owner.pos={...marker.pos};a.controller.update(.1);
assert.equal(a.deliveries.length,1);assert.equal(a.deliveries[0].inst.def.delivery.count,8);assert.equal(a.owner.skillRecoveryLocks.size,0);assert.equal(b.owner.skillRecoveryLocks.size,1);
b.controller.update(0);assert.equal(b.owner.cooldowns.get(j.def.id),2);a.controller.clearAll();b.controller.clearAll();
console.log(JSON.stringify({caught:true,dimensions:3,nova:8,isolated:true}));`);
fs.writeFileSync(path.join(consumer,'types.ts'),`import {AttackSequences,type AttackSequencePorts,type SequenceActor,type SequenceSkill,type SequenceProjectile,type AttackSequenceSpec} from '@hollow-wake/engine/combat/attack-sequences';
import {AttackSequenceContent,attackSequenceErrors} from '@hollow-wake/engine/combat/attack-sequence-content';
type Position={x:number;y:number;z:number};type Mod={stat:string;kind:'more'|'increased';value:number};
type Delivery={type:'melee';range:number;arcDeg:number}|{type:'projectile';speed:number;range:number;radius:number};
interface Skill extends SequenceSkill<Skill,Mod,string,Delivery>{def:{id:string;name:string;tags:string[];delivery:Delivery;attackSequence?:AttackSequenceSpec<Mod,Delivery>;custom:string}}
interface Actor extends SequenceActor<Actor,Skill,Position,Mod,string>{custom:string}
interface Projectile extends SequenceProjectile<Actor,Skill,Position>{custom:string}
type Ports=AttackSequencePorts<Actor,Skill,Projectile,Position,Mod,string,Delivery>;
declare const ports:Ports;declare const actor:Actor;declare const skill:Skill;declare const shot:Projectile;
const runtime=new AttackSequences(ports);const prepared:Skill=runtime.prepare(actor,skill,{x:1,y:2,z:3});runtime.flight(shot);runtime.clear(actor,prepared);
// @ts-expect-error Every spatial dimension belongs to this host.
runtime.prepare(actor,skill,{x:1,y:2});
// @ts-expect-error Delivery completion must be synchronous.
const asyncPorts:Ports={...ports,execute:async()=>{}};
// @ts-expect-error Cleanup must complete before later observations.
const deferredCleanup:Ports={...ports,filterWork:async()=>{}};
// @ts-expect-error A spatial query returns an immediate scalar.
const asyncDistance:Ports={...ports,distance:async()=>1};
const content=new AttackSequenceContent<Skill,Mod,string,Delivery>({patch:()=>undefined,innateMods:()=>[],tags:i=>new Set(i.def.tags),make:(definition,level)=>{
const custom:string=definition.custom;void custom;return{def:definition,level,sockets:[]};}},['attack','melee','aoe','physical']);
const payload:Skill=content.payload(skill,{type:'projectile',speed:1,range:1,radius:1});void payload;
// An extended host policy containing both delivery variants needs no explicit
// generic arguments; diagnostics do not manufacture any typed payload.
interface ExtendedPolicy extends AttackSequenceSpec<Mod,Delivery>{cycleBuff?:{type:'buff';id:string;duration:number;mods:Mod[];clearOnHit?:true}}
declare const extended:ExtendedPolicy;const errors:string[]=attackSequenceErrors(extended);void errors;
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022'],types:[]},include:['types.ts']});
for(const[name,args]of [['types',[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(consumer,'tsconfig.json')]],['consumer',['run.mjs']]]){const file=path.join(directory,name+'.txt'),fd=fs.openSync(file,'wx');try{execFileSync(process.execPath,args,{cwd:consumer,windowsHide:true,stdio:['ignore',fd,fd],env});}finally{fs.closeSync(fd);captured[name]=fs.readFileSync(file,'utf8');}}
const modules={};let total=0;for(const name of ['attack-sequences','attack-sequence-content','attack-sequence-types','attack-sequence-owned']){const b=fs.readFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/dist',name+'.js'));assert(b.equals(fs.readFileSync(path.join(root,'dist',name+'.js'))));modules[name]={sha256:sha256(b),bytes:b.length};total+=b.length;}assert(total<=32*1024);
Object.assign(report,{passed:true,installedConsumer:true,typeConsumer:true,isolatedSimulations:true,dimensions:3,jsBytes:total,modules,integrity:packed.integrity});
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{assert.equal(path.dirname(fs.realpathSync(directory)),owned);assert(!fs.existsSync(path.join(directory,'.git')));fs.rmSync(directory,{recursive:true,maxRetries:3});report.cleaned=true;const logs=gzipSync(JSON.stringify(captured),{level:9});report.logsSha256=sha256(logs);fs.writeFileSync(path.join(owned,'attack-sequences-package.logs.json.gz'),logs);writeJSON(path.join(owned,'attack-sequences-package.json'),report);}
assert(report.passed,report.failure);console.log(report);
