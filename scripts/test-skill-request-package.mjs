import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { root, writeJSON } from './reference-utils.mjs';
const artifacts = path.join(root, '.artifacts');
const npm = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const archive = JSON.parse(execFileSync(process.execPath, [npm, 'pack', '--json', '--pack-destination', artifacts, '--cache', path.join(artifacts, 'npm-cache')], { cwd: root, encoding: 'utf8' }))[0];
const consumer = fs.mkdtempSync(path.join(os.tmpdir(), 'hollow-request-'));
writeJSON(path.join(consumer, 'package.json'), { private: true, type: 'module' });
execFileSync(process.execPath, [npm, 'install', path.join(artifacts, archive.filename), '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', path.join(consumer, 'cache')], { cwd: consumer, stdio: 'pipe' });
fs.copyFileSync(path.join(consumer, 'node_modules/@hollow-wake/engine/examples/skill-request.mjs'), path.join(consumer, 'skill-request.mjs'));
fs.writeFileSync(path.join(consumer, 'run.mjs'), `
import assert from 'node:assert/strict';
Math.random=()=>{throw new Error('Ambient RNG');};globalThis.fetch=()=>{throw new Error('Network');};
for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw new Error(key);}});
const {requestCycle}=await import('./skill-request.mjs');const result=requestCycle();
assert.deepEqual(result,{sealedPress:false,toggled:true,disarmed:true,refused:false,continued:true,useLock:.25,events:['acted','metadata','acted','acted','host-continuation']});
console.log(JSON.stringify({installedConsumer:true,shippedExample:true,result}));
`);
fs.writeFileSync(path.join(consumer, 'consumer.ts'), `
import {SkillRequest,type SkillRequestPorts,type SkillRequestResult,type RequestActor,type RequestInstance,type RequestEffect} from '@hollow-wake/engine/casting/request';
interface Skill extends RequestInstance {sockets:readonly string[];extraMods?:readonly number[]}
interface Actor extends RequestActor<Skill,string> {name:string;clingTo?:{id:string;slot:number}}
interface Seat {actor:Actor}
interface Aim {x:number;y:number}
declare const ports:SkillRequestPorts<Actor,Skill,Seat,Aim,string>,actor:Actor,skill:Skill,aim:Aim;
const policy=new SkillRequest<Actor,Skill,Seat,Aim,string>(ports);
const inferred=new SkillRequest(ports);inferred.preflight(actor,skill,aim,true);
const result:SkillRequestResult=policy.preflight(actor,skill,aim);
if(result!=='continue'){const handled:boolean=result;}
const effects:readonly RequestEffect[]=[{type:'relocateConstruct',radius:12},{type:'damage'}];
// @ts-expect-error The host must check continuation before returning a boolean.
const premature:boolean=policy.preflight(actor,skill,aim);
// @ts-expect-error A different host's aim shape cannot cross this boundary.
policy.preflight(actor,skill,'wrong aim');
// @ts-expect-error Actor identity has a concrete host-owned type.
ports.actorById(123);
`);
writeJSON(path.join(consumer, 'tsconfig.json'), { compilerOptions: { strict: true, noEmit: true, target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022'], types: [] }, include: ['consumer.ts'] });
execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', path.join(consumer, 'tsconfig.json')], { cwd: consumer, stdio: 'pipe' });
const result = JSON.parse(execFileSync(process.execPath, ['run.mjs'], { cwd: consumer, encoding: 'utf8', env: { ...process.env, NODE_PATH: '' } }));
assert(result.installedConsumer && result.shippedExample);
writeJSON(path.join(artifacts, 'skill-request-package-verification.json'), { ...result, typeConsumer: true, node: process.version, runtimeArchive: archive.integrity });
console.log(result);
