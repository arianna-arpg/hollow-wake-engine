import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const artifacts=path.join(root,'.artifacts'),output=fs.mkdtempSync(path.join(artifacts,'buff-package-'));
const npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const packed=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',output,'--cache',path.join(artifacts,'npm-cache')],{cwd:root,encoding:'utf8'}))[0];
const consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-buffs-'));writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',path.join(output,packed.filename),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe'});
fs.copyFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/examples/buffs.mjs'),path.join(consumer,'example.mjs'));
fs.writeFileSync(path.join(consumer,'run.mjs'),`
import assert from 'node:assert/strict';
Math.random=()=>{throw Error('Ambient randomness');};Date.now=()=>{throw Error('Ambient clock');};globalThis.fetch=()=>{throw Error('Network');};
for(const key of ['window','document','localStorage','performance'])Object.defineProperty(globalThis,key,{get(){throw Error(key);}});
const {buffEncounter}=await import('./example.mjs'),first=buffEncounter(),second=buffEncounter();
assert.deepEqual(first,{stages:[{life:120,stacks:2,clocks:[4,4]},{life:140,stacks:4,clocks:[3,3,8,8]},{life:130,stacks:3,clocks:[3,8,8]},{life:120,stacks:2,clocks:[5,5]},{life:100,stacks:0,clocks:[]}],gains:2,cues:[{id:'endurance',count:1}]});
assert.deepEqual(second,first);assert.notEqual(first.stages,second.stages);assert.notEqual(first.stages[0].clocks,second.stages[0].clocks);
console.log(JSON.stringify({installedConsumer:true,isolatedSimulations:true,first}));
`);
let types=`
import {StatRules,StatSheet,type Modifier} from '@hollow-wake/engine';
import {BuffRuntime,type BuffDefinition,type BuffOwner,type BuffPorts} from '@hollow-wake/engine/combat/buffs';
import {compileBuffDefinition} from '@hollow-wake/engine/combat/buff-content';
type Tag='melee'|'spell';interface Definition extends BuffDefinition<Modifier,Tag>{hostMetadata:{id:number}}
interface Actor extends BuffOwner<Definition,Tag>{sheet:StatSheet;actorId:string}
const rules=new StatRules({life:{base:100}});
const ports:BuffPorts<Modifier,Definition,Actor>={publish(a,id,mods){a.sheet.setSource(id,mods);},removeSource(a,id){a.sheet.removeSource(id);},release(a,d,id,count){const actorId:string=a.actorId;const metadata:number=d.hostMetadata.id;}};
const runtime=new BuffRuntime<Modifier,Tag,Definition,Actor>(ports),actor:Actor={buffs:new Map(),gainEvents:[],sheet:new StatSheet(rules),actorId:'hero'};
const def:Definition={type:'buff',id:'might',duration:4,mods:[],consumeOnUse:{},hostMetadata:{id:4}};
runtime.grant(actor,def,1,0,['melee']);runtime.spend(actor,'hit',['spell']);runtime.consume(actor,'might');runtime.advance(actor,1);runtime.remove(actor,'might');runtime.synchronize(actor,'might');
// @ts-expect-error Concrete owner requirements remain enforced.
runtime.advance({buffs:new Map(),gainEvents:[]},1);
// @ts-expect-error A native definition retains required host metadata.
runtime.grant(actor,{type:'buff',id:'missing',duration:1,mods:[]});
// @ts-expect-error The caller's tag vocabulary remains narrow.
runtime.grant(actor,def,1,0,['attack']);
// @ts-expect-error Unsupported consumption events cannot silently pass.
runtime.spend(actor,'cast');
// @ts-expect-error Modifier types retain their stat shape.
const bad:Definition={...def,mods:[{value:2}]};
// @ts-expect-error Port owner types cannot be narrowed unsafely.
const narrow:typeof ports={...ports,release:(a:Actor & {extra:number})=>undefined};
const compiled=compileBuffDefinition({type:'buff',id:'owned',duration:1,mods:[]},rules);
// @ts-expect-error Compiled definitions are readonly.
compiled.duration=8;
// @ts-expect-error Compiled modifier lists are readonly.
compiled.mods.push({stat:'life',kind:'flat',value:2});
const inferred=new BuffRuntime(ports);inferred.grant(actor,def);
`;
for(const key of ['publish','removeSource','release','consume'])types+=`\n// @ts-expect-error ${key} must complete synchronously.\nconst async_${key}:typeof ports={...ports,${key}:async()=>undefined};\n`;
fs.writeFileSync(path.join(consumer,'consumer.ts'),types);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022'],types:[]},include:['consumer.ts']});
try{execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(consumer,'tsconfig.json')],{cwd:consumer,stdio:'pipe'});}catch(error){console.error(String(error.stdout??''),String(error.stderr??''));throw error;}
const result=JSON.parse(execFileSync(process.execPath,['run.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,NODE_PATH:''}}));
const modules=[];for(const name of ['buffs','buff-content']){const bytes=fs.readFileSync(path.join(consumer,'node_modules/@hollow-wake/engine/dist',name+'.js'));assert(bytes.equals(fs.readFileSync(path.join(root,'dist',name+'.js'))));modules.push({name,bytes:bytes.length,sha256:sha256(bytes)});}
assert(modules.reduce((sum,m)=>sum+m.bytes,0)<=18*1024);
writeJSON(path.join(artifacts,'buff-package-verification.json'),{...result,typeConsumer:true,asyncPortsRejected:4,modules,archive:packed.integrity,output,consumer,node:process.version});console.log(result);
