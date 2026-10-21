import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {root, writeJSON} from './reference-utils.mjs';
const artifacts = path.join(root, '.artifacts');
const npm = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const archive = JSON.parse(execFileSync(process.execPath, [npm, 'pack', '--json', '--pack-destination', artifacts, '--cache', path.join(artifacts, 'npm-cache')], {cwd: root, encoding: 'utf8'}))[0];
const consumer = fs.mkdtempSync(path.join(os.tmpdir(), 'hollow-ammunition-'));
writeJSON(path.join(consumer, 'package.json'), {private: true, type: 'module'});
execFileSync(process.execPath, [npm, 'install', path.join(artifacts, archive.filename), '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', path.join(consumer, 'cache')], {cwd: consumer, stdio: 'pipe'});
fs.copyFileSync(path.join(consumer, 'node_modules/@hollow-wake/engine/examples/ammunition.mjs'), path.join(consumer, 'ammunition.mjs'));
fs.writeFileSync(path.join(consumer, 'run.mjs'), `
import assert from 'node:assert/strict';
Math.random = () => { throw new Error('Ambient RNG'); };
globalThis.fetch = () => { throw new Error('Network'); };
for (const key of ['window','document','localStorage']) Object.defineProperty(globalThis,key,{get(){throw new Error(key);}});
const {ammunitionCycle} = await import('./ammunition.mjs');
const result = ammunitionCycle();
assert.deepEqual(result, {
  deliveries: [
    {skill:'sample-rifle',multiplier:1}, {skill:'sample-rifle',multiplier:2}, {skill:'sample-rifle',multiplier:2},
    {skill:'sample-fuel',multiplier:1.25}, {skill:'sample-fuel',multiplier:1.25}, {skill:'sample-fuel',multiplier:1}, {skill:'sample-fuel',multiplier:1.25},
  ], stamps:[{count:0,reloading:false,timer:0},{count:0,reloading:false,timer:0}],
  restored:1,refusedWhileReloading:true,refusedWithoutBank:true,
  gunner:{mana:5,bank:{count:2,timer:0,reloading:false},clocks:[]},
  caster:{mana:0,bank:{count:0,timer:0}},independentBanks:true,
});
console.log(JSON.stringify({installedConsumer:true,shippedExample:true,result}));
`);
fs.writeFileSync(path.join(consumer, 'consumer.ts'), `
import {Ammunition,requiresUseCharge,useChargeReady,commitAmmunitionPress,type AmmunitionPorts,type AmmunitionSkill,type AmmunitionPressPorts,type AmmunitionPress,type UseChargeBank,type UseChargeSpec} from '@hollow-wake/engine/resources/ammunition';
type Skill = AmmunitionSkill & {spec:UseChargeSpec};
declare const ports:AmmunitionPorts<Skill>;
declare const skill:Skill;
const banks = new Map<string,UseChargeBank>();
const runtime = new Ammunition(banks,ports);
const cap:number = runtime.capacity(skill);
const bank:UseChargeBank = runtime.bank(skill);
runtime.spendOne(skill);runtime.advance(.016);
const added:number = runtime.restore(skill,1);
const required:boolean = requiresUseCharge(skill.spec);
const ready:boolean = useChargeReady(skill.spec,bank.count);
declare const sinks:AmmunitionPressPorts<null,Skill>;
const receipt:AmmunitionPress = commitAmmunitionPress(null,skill,skill.spec,sinks);
`);
writeJSON(path.join(consumer, 'tsconfig.json'), {compilerOptions: {strict: true, noEmit: true, target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022'], types: []}, include: ['consumer.ts']});
execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', path.join(consumer, 'tsconfig.json')], {cwd: consumer, stdio: 'pipe'});
const result = JSON.parse(execFileSync(process.execPath, ['run.mjs'], {cwd: consumer, encoding: 'utf8', env: {...process.env, NODE_PATH: ''}}));
assert(result.installedConsumer && result.shippedExample);
writeJSON(path.join(artifacts, 'ammunition-package-verification.json'), {...result, typeConsumer: true, node: process.version, runtimeArchive: archive.integrity});
console.log(result);
