import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {root, writeJSON} from './reference-utils.mjs';
const artifacts = path.join(root, '.artifacts');
const npm = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const archive = JSON.parse(execFileSync(process.execPath, [npm, 'pack', '--json', '--pack-destination', artifacts, '--cache', path.join(artifacts, 'npm-cache')], {cwd: root, encoding: 'utf8'}))[0];
const consumer = fs.mkdtempSync(path.join(os.tmpdir(), 'hollow-intent-'));
writeJSON(path.join(consumer, 'package.json'), {private: true, type: 'module'});
execFileSync(process.execPath, [npm, 'install', path.join(artifacts, archive.filename), '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', path.join(consumer, 'cache')], {cwd: consumer, stdio: 'pipe'});
fs.copyFileSync(path.join(consumer, 'node_modules/@hollow-wake/engine/examples/skill-intent.mjs'), path.join(consumer, 'skill-intent.mjs'));
fs.writeFileSync(path.join(consumer, 'run.mjs'), `
import assert from 'node:assert/strict';
Math.random=()=>{throw new Error('Ambient RNG');};globalThis.fetch=()=>{throw new Error('Network');};
for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw new Error(key);}});
const {intentCycle}=await import('./skill-intent.mjs');const result=intentCycle();
assert.deepEqual(result,{firstFace:'opener',nextFace:'finisher',hudReady:true,finisherReady:false,fundedReady:true,sealedPress:false,expiredFace:'opener',sharedSockets:true});
const {CastSeals}=await import('@hollow-wake/engine/casting/seals');
const spec={open:{ids:['open']},shut:{ids:['before']}},calls=[];
const issues=new CastSeals(()=>new Set()).issues(spec,id=>{calls.push(id);if(id==='open')spec.shut={ids:['after']};return false;});
assert.deepEqual(calls,['open','before']);
assert.deepEqual(issues,["open.ids names no skill 'open'","shut.ids names no skill 'before'"]);
const {SkillInstances}=await import('@hollow-wake/engine/casting/instances');
const {SkillIntent}=await import('@hollow-wake/engine/casting/intent');
const definitions={host:{id:'host',effects:[]},art:{id:'art',effects:[]}},replacement={...definitions.art,revision:2};
const owner=new SkillInstances({skill:id=>definitions[id]});
const policy=new SkillIntent(owner,{conversion:()=>({when:'live',skillId:'art'}),conversionHolds:()=>{definitions.art=replacement;return true;}});
assert.equal(policy.slotFace({}, {def:definitions.host}),replacement);
console.log(JSON.stringify({installedConsumer:true,shippedExample:true,validationRowSnapshot:true,liveConversionDefinition:true,result}));
`);
fs.writeFileSync(path.join(consumer, 'consumer.ts'), `
import {CastSeals,type CastSealSpec,type CastSealContext} from '@hollow-wake/engine/casting/seals';
import {SkillInstances,type SkillInstancePorts,type IntentInstance,type InstanceActor,type ComboCursor} from '@hollow-wake/engine/casting/instances';
import {SkillIntent,type IntentActor,type SkillIntentPorts} from '@hollow-wake/engine/casting/intent';
interface Skill extends IntentInstance {sockets: readonly string[]}
interface Actor extends IntentActor<Skill> {name:string}
interface Seal extends CastSealSpec {label:string}
interface Seat {known:ReadonlySet<string>}
declare const instancePorts:SkillInstancePorts<Skill>, ports:SkillIntentPorts<Actor,Skill,Seat,Seal>;
declare const actor:Actor, skill:Skill;
const instances=new SkillInstances<Actor,Skill>(instancePorts);
const policy=new SkillIntent(instances,ports);
const seal:Seal|null=policy.castSealed(actor,skill), face:Skill['def']=policy.slotFace(actor,skill);
const step:Skill|null=policy.queuedStep(actor,skill), cursor:ComboCursor=instances.cursor(actor,skill);
const registry=new CastSeals<CastSealContext&{inst:Skill}>(()=>new Set<string>());
registry.register('open',context=>context.seated);
const closed:boolean=registry.shuts({}, {inst:skill,seated:true});
`);
writeJSON(path.join(consumer, 'tsconfig.json'), {compilerOptions: {strict: true, noEmit: true, target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022'], types: []}, include: ['consumer.ts']});
execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', path.join(consumer, 'tsconfig.json')], {cwd: consumer, stdio: 'pipe'});
const result = JSON.parse(execFileSync(process.execPath, ['run.mjs'], {cwd: consumer, encoding: 'utf8', env: {...process.env, NODE_PATH: ''}}));
assert(result.installedConsumer && result.shippedExample);
writeJSON(path.join(artifacts, 'skill-intent-package-verification.json'), {...result, typeConsumer: true, node: process.version, runtimeArchive: archive.integrity});
console.log(result);
