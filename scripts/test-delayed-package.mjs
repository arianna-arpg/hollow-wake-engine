import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const artifacts=path.join(root,'.artifacts'),output=fs.mkdtempSync(path.join(artifacts,'delayed-package-'));
const npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const packed=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',output,'--cache',path.join(artifacts,'npm-cache')],{cwd:root,encoding:'utf8'}))[0];
const consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-delayed-'));writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',path.join(output,packed.filename),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe'});
fs.copyFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/examples/delayed-bursts.mjs'),path.join(consumer,'example.mjs'));
fs.writeFileSync(path.join(consumer,'run.mjs'),`
import assert from 'node:assert/strict';
Math.random=()=>{throw new Error('Ambient random');};Date.now=()=>{throw new Error('Ambient clock');};globalThis.fetch=()=>{throw new Error('Network');};
for(const key of ['window','document','localStorage','performance'])Object.defineProperty(globalThis,key,{get(){throw new Error(key);}});
const {delayedEncounter}=await import('./example.mjs');
const common=['warning:12','warning:10.5','flash:10.5','heal:ally','text:+12','damage:enemy','text:20','sweep:enemy','kill:enemy'];
const first=delayedEncounter(),second=delayedEncounter(),reset=delayedEncounter(true);
assert.deepEqual(first,{ally:62,enemy:0,survivor:20,pending:1,events:[...common,'damage:survivor','text:20','sweep:survivor']});
assert.deepEqual(second,first);assert.notEqual(second.events,first.events);
assert.deepEqual(reset,{ally:62,enemy:0,survivor:40,pending:0,events:[...common,'reset']});
const {compileDelayedBurstEffect}=await import('@hollow-wake/engine/combat/delayed');
assert.throws(()=>compileDelayedBurstEffect({type:'delayedBurst',at:'self',delay:-1,radius:0},[]));
const fx=compileDelayedBurstEffect({type:'delayedBurst',at:'self',delay:0,radius:0,damage:{type:'custom',base:-1,perLevel:2}},['custom']);assert(Object.isFrozen(fx.damage));
console.log(JSON.stringify({installedConsumer:true,isolatedSimulations:true,normal:first,reset}));
`);
let types=`
import {DelayedBursts,compileDelayedBurstEffect,type DelayedBurstOwner,type DelayedBurstActor,type DelayedBurstPorts,type PendingBurst} from '@hollow-wake/engine/combat/delayed';
interface Actor extends DelayedBurstOwner,DelayedBurstActor<'fire'> {id:string}
interface Host {pending:PendingBurst<Actor,'fire'>[];actors:Actor[];time:number}
const actor:Actor={id:'hero',pos:{x:0,y:0},tier:0,team:'blue',level:1,radius:1,life:100,dead:false,untargetable:false,invulnerable:false,esBroke:false,hitFlash:0};
const host:Host={pending:[],actors:[actor],time:0};
const ports:DelayedBurstPorts<Host,Actor,Actor,'fire'>={
 queue:w=>w.pending,time:w=>w.time,actors:w=>w.actors,clearQueue(w){w.pending=[];},warning(_w,b){const id:string=b.owner.id;},flash(){},
 heal(_w,a,n){const id:string=a.id;return n;},mitigate(_w,a,t,n){const id:string=a.id;const type:'fire'=t;return n;},text(){},shieldBreak(){},sweepDefenses(){},kill(){},
};
const scheduler=new DelayedBursts(ports),fx=compileDelayedBurstEffect({type:'delayedBurst',at:'self',delay:0,radius:1},['fire'] as const);
scheduler.schedule(host,actor,fx,'#fff');scheduler.advance(host);scheduler.reset(host);
const frozen:Readonly<typeof ports>=Object.freeze(ports);new DelayedBursts(frozen);
// @ts-expect-error Preserve the owner subtype required by the port table.
scheduler.schedule(host,{pos:{x:0,y:0},tier:0,team:'blue',level:1},fx,'#fff');
// @ts-expect-error Preserve the concrete host subtype.
scheduler.advance({pending:[],time:0});
// @ts-expect-error Payload numeric fields remain numeric.
scheduler.schedule(host,actor,{...fx,radius:'wide'},'#fff');
// @ts-expect-error Host damage names are constrained.
scheduler.schedule(host,actor,{...fx,damage:{type:'cold',base:1,perLevel:0}},'#fff');
// @ts-expect-error Compiled content is readonly.
fx.radius=10;
// @ts-expect-error Nested compiled magnitude is readonly.
if(fx.damage)fx.damage.base=10;
// @ts-expect-error A narrower actor requirement cannot replace the declared port.
const narrow:typeof ports={...ports,heal:(_w,a:Actor & {extra:number},n)=>a.extra+n};
`;
for(const key of ['queue','time','actors','clearQueue','warning','flash','heal','mitigate','text','shieldBreak','sweepDefenses','kill'])types+=`\n// @ts-expect-error The ${key} port must complete synchronously.\nconst async_${key}:typeof ports={...ports,${key}:async()=>undefined};\n`;
fs.writeFileSync(path.join(consumer,'consumer.ts'),types);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022'],types:[]},include:['consumer.ts']});
try{execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(consumer,'tsconfig.json')],{cwd:consumer,stdio:'pipe'});}catch(error){console.error(String(error.stdout??''),String(error.stderr??''));throw error;}
const result=JSON.parse(execFileSync(process.execPath,['run.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,NODE_PATH:''}}));
const installed=fs.readFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/dist/delayed-bursts.js'));assert(installed.equals(fs.readFileSync(path.join(root,'dist/delayed-bursts.js'))));assert(installed.length<=8192);
writeJSON(path.join(artifacts,'delayed-package-verification.json'),{...result,typeConsumer:true,asyncPortsRejected:12,moduleBytes:installed.length,moduleSha256:sha256(installed),archive:packed.integrity,output,consumer,node:process.version});console.log(result);
