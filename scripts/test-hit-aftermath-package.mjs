import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {build} from 'esbuild';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const directory=fs.mkdtempSync(path.join(root,'.artifacts/hit-aftermath-package-')),consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-hit-aftermath-'));
const npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const [packed]=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',directory,'--cache',path.join(root,'.artifacts/npm-cache')],{cwd:root,encoding:'utf8',windowsHide:true}));
writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',path.join(directory,packed.filename),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe',windowsHide:true});
const source=fs.readFileSync(path.join(root,'test/hit-aftermath.test.mjs'),'utf8').replace("'../dist/hit-aftermath.js'","'@hollow-wake/engine/combat/hit-aftermath'");assert(!source.includes('../dist/'));
fs.writeFileSync(path.join(consumer,'test.mjs'),"Math.random=()=>{throw Error('Ambient random');};globalThis.fetch=()=>{throw Error('Network');};\n"+source);
const result=execFileSync(process.execPath,['--test','--test-reporter=tap','test.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,HWE_HIT_AFTERMATH_MODULE:''},windowsHide:true});fs.writeFileSync(path.join(directory,'tests.txt'),result);assert.match(result,/# pass 35/);
fs.writeFileSync(path.join(consumer,'types.ts'),`import {createHitAftermath,type HitAftermathActor,type HitAftermathPorts,type HitAftermathInstance,type HitAftermathSkill,type HitAftermathPacket,type HitAftermathFrame,type HitAftermathSocket} from '@hollow-wake/engine/combat/hit-aftermath';
type Tag='cold'|'attack';type Position={coordinates:[number,number,number]};type Direction={rotation:[number,number,number,number]};type Modifier={value:number};type Status={id:string;intensity:number};type Tone={sound:string};type Effect={custom:number};
interface Skill extends HitAftermathSkill<Tag>{hostField:string}
interface Instance extends HitAftermathInstance<Skill>{custom:string}
interface Actor extends HitAftermathActor<Actor,Instance,Position,Modifier,Tag,Status>{team:'ally'|'enemy';hostField:string}
interface Packet extends HitAftermathPacket<Tag>{custom:string}
interface Frame extends HitAftermathFrame<Tag>{receipt:string}
interface Socket extends HitAftermathSocket{socketExtra:string}
declare const ports:HitAftermathPorts<Actor,Instance,Skill,Position,Direction,Modifier,Tag,Status,Socket,Frame,Packet,Tone,Effect>,caster:Actor,target:Actor,inst:Instance,def:Skill,extra:Modifier[],packet:Packet,tone:Tone;
const service=createHitAftermath<Actor,Instance,Skill,Position,Direction,Modifier,Tag,Status,Socket,Frame,Packet,Tone,Effect>(ports);
const result:void=service.apply(caster,inst,target,1,0,[{custom:2}],def,extra,packet,tone,0,true,100,false);
ports.push=(actor,direction,strength)=>{const position:Position=actor.pos;const orientation:Direction=direction;const amount:number=strength;};
ports.applyRiders=frame=>{const receipt:string=frame.receipt;};
ports.transplant=(actor,status)=>{const value:number=status.intensity;};
ports.createMonster=(id,level,team,owner)=>{const nativeTeam:'ally'|'enemy'=team;return owner;};
// @ts-expect-error Host positions are not tied to 2D vectors.
caster.pos={x:1,y:2};
// @ts-expect-error Host directions are not required to be scalar angles.
ports.push(caster,3,1,caster,inst);
// @ts-expect-error Modifiers retain their host payload.
service.apply(caster,inst,target,1,0,undefined,def,[{wrong:1}],packet,tone,0,true,100,false);
// @ts-expect-error Team narrowing survives the actor factory boundary.
ports.createMonster('mob',1,'unknown',caster);
// @ts-expect-error Existing status frames retain their additional fields.
ports.applyRiders({tags:new Set<Tag>()});
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',strict:true,noEmit:true,types:[]},include:['types.ts']});
const types=execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.json'],{cwd:consumer,encoding:'utf8',windowsHide:true});fs.writeFileSync(path.join(directory,'types.txt'),types);
fs.writeFileSync(path.join(consumer,'browser.mjs'),"export {createHitAftermath} from '@hollow-wake/engine/combat/hit-aftermath';\n");
const browser=await build({absWorkingDir:consumer,tsconfigRaw:{},nodePaths:[path.join(consumer,'node_modules')],entryPoints:[path.join(consumer,'browser.mjs')],bundle:true,platform:'browser',format:'esm',target:'es2022',write:false,metafile:true});
assert(Object.keys(browser.metafile.inputs).every(file=>!file.includes('.reference')));fs.writeFileSync(path.join(directory,'browser.mjs'),browser.outputFiles[0].contents);
const report={passed:true,directory,consumer,tests:35,typesPassed:true,browserBytes:browser.outputFiles[0].contents.length,archiveSha256:sha256(fs.readFileSync(path.join(directory,packed.filename))),independentInstallation:true};
writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/hit-aftermath-package-verification.json',report);console.log(report);
