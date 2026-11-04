import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {root, sha256, writeJSON} from './reference-utils.mjs';
fs.mkdirSync(path.join(root, '.artifacts'), {recursive: true});
const directory = fs.mkdtempSync(path.join(root, '.artifacts/proc-casting-package-'));
const consumer = fs.mkdtempSync(path.join(os.tmpdir(), 'hollow-proc-casting-'));
const npm = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const [packed] = JSON.parse(execFileSync(process.execPath, [npm, 'pack', '--json', '--pack-destination', directory, '--cache', path.join(root, '.artifacts/npm-cache')], {cwd: root, encoding: 'utf8', windowsHide: true}));
writeJSON(path.join(consumer, 'package.json'), {private: true, type: 'module'});
execFileSync(process.execPath, [npm, 'install', path.join(directory, packed.filename), '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', path.join(consumer, 'cache')], {cwd: consumer, stdio: 'pipe', windowsHide: true});
const testFile = path.join(root, 'test/proc-casting.test.mjs');
const source = fs.readFileSync(testFile, 'utf8').replace("'../dist/proc-casting.js'", "'@hollow-wake/engine/combat/proc-casting'");
assert(!source.includes('../dist/'));
fs.writeFileSync(path.join(consumer, 'test.mjs'), "Math.random=()=>{throw Error('Ambient random');};globalThis.fetch=()=>{throw Error('Network');};\n" + source);
const tests = execFileSync(process.execPath, ['--test', '--test-reporter=tap', 'test.mjs'], {cwd: consumer, encoding: 'utf8', windowsHide: true, env: {...process.env, HWE_PROC_CASTING_MODULE: ''}});
fs.writeFileSync(path.join(directory, 'tests.txt'), tests); assert.match(tests, /# pass 27/);
fs.writeFileSync(path.join(consumer, 'types.ts'), `import {createProcCasting, heldProcSkill, type ProcCastingPorts, type ProcCastActor, type ProcCastInstance, type ProcCastSkill, type ProcHeldSkillPorts} from '@hollow-wake/engine/combat/proc-casting';
type Position={coordinates:[number,number,number]};type Direction={quaternion:[number,number,number,number]};
interface Instance extends ProcCastInstance {customSocketState:Map<string,number>}
interface Skill extends ProcCastSkill {hostPrefab:string}
interface Actor extends ProcCastActor<Position> {hostEntity:bigint}
interface Seat {account:string}
declare const ports:ProcCastingPorts<Actor,Instance,Skill,Position,Direction>, held:ProcHeldSkillPorts<Actor,Instance,Seat>, actor:Actor, inst:Instance;
const service=createProcCasting<Instance,Skill,Position,Direction,Actor>(ports);
const fired:boolean=service.cast(actor,inst,null,3,{skillId:'bolt',count:[2,3],own:true},actor.pos);
const own:Instance|null=heldProcSkill(actor,'bolt',held);
declare const numericPorts:ProcCastingPorts<Actor,number,Skill,Position,Direction>;
const numeric=createProcCasting<number,Skill,Position,Direction,Actor>(numericPorts);
numeric.cast(actor,42,null,3,{skillId:'bolt',count:[1,1]});
declare const gridActor:ProcCastActor<number>,gridPorts:ProcCastingPorts<ProcCastActor<number>,number,Skill,number,Direction>;
createProcCasting<number,Skill,number,Direction,ProcCastActor<number>>(gridPorts).cast(gridActor,0,null,3,{skillId:'bolt',count:[1,1]},0);
ports.spawnProjectile=(a,i,p,d,options)=>{const identity:bigint=a.hostEntity;const sockets:Map<string,number>=i.customSocketState;const position:Position=p;const direction:Direction=d;};
// @ts-expect-error Missing authored count is not an executable cast.
service.cast(actor,null,null,0,{skillId:'bolt'});
// @ts-expect-error Positions retain the host shape.
service.cast(actor,null,null,0,{skillId:'bolt',count:[1,1]},{x:0,y:0});
// @ts-expect-error Directions retain the host shape.
ports.spawnProjectile(actor,inst,actor.pos,0,{depth:0,mult:1});
`);
writeJSON(path.join(consumer, 'tsconfig.json'), {compilerOptions: {target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true, types: []}, include: ['types.ts']});
const types = execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], {cwd: consumer, encoding: 'utf8', windowsHide: true}); fs.writeFileSync(path.join(directory, 'types.txt'), types);
fs.writeFileSync(path.join(consumer, 'browser.mjs'), "export {createProcCasting, heldProcSkill} from '@hollow-wake/engine/combat/proc-casting';\n");
const browser = await build({absWorkingDir: consumer, tsconfigRaw: {}, entryPoints: ['browser.mjs'], bundle: true, platform: 'browser', format: 'esm', target: 'es2022', write: false, metafile: true});
assert.equal(Object.keys(browser.metafile.inputs).length, 2); assert(browser.outputFiles[0].contents.length < 5000);
fs.writeFileSync(path.join(directory, 'browser.mjs'), browser.outputFiles[0].contents);
const report = {passed: true, directory, consumer, tests: 27, testSha256: sha256(fs.readFileSync(testFile)), typesPassed: true, browserBytes: browser.outputFiles[0].contents.length, archiveSha256: sha256(fs.readFileSync(path.join(directory, packed.filename))), independentInstallation: true};
writeJSON(path.join(directory, 'verification.json'), report); writeJSON('.artifacts/proc-casting-package-verification.json', report); console.log(report);
