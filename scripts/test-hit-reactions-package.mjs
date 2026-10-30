import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {build} from 'esbuild';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const directory=fs.mkdtempSync(path.join(root,'.artifacts/hit-reactions-package-')),consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-hit-reactions-'));
const npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const [packed]=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',directory,'--cache',path.join(root,'.artifacts/npm-cache')],{cwd:root,encoding:'utf8',windowsHide:true}));
writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',path.join(directory,packed.filename),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe',windowsHide:true});
const source=fs.readFileSync(path.join(root,'test/hit-reactions.test.mjs'),'utf8').replace("'../dist/hit-reactions.js'","'@hollow-wake/engine/combat/hit-reactions'");assert(!source.includes('../dist/'));
fs.writeFileSync(path.join(consumer,'test.mjs'),"Math.random=()=>{throw Error('Ambient random');};globalThis.fetch=()=>{throw Error('Network');};\n"+source);
const result=execFileSync(process.execPath,['--test','--test-reporter=tap','test.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,HWE_HIT_REACTIONS_MODULE:''},windowsHide:true});fs.writeFileSync(path.join(directory,'tests.txt'),result);assert.match(result,/# pass 32/);
fs.writeFileSync(path.join(consumer,'types.ts'),`import {createHitReactions,type HitReactionActor,type HitReactionPorts,type HitReactionInstance,type HitReactionPacket,type HitReactionResult} from '@hollow-wake/engine/combat/hit-reactions';
type Position={coordinates:number[]};type Mod={value:number};type Item={asset:string};type Brain={weight:number};type Watch={sense:string};type Spill={amount:number};type Skill={name:string};
interface Actor extends HitReactionActor<Position,Mod,'cold',Item,Brain,Watch>{hostField:string}
interface Instance extends HitReactionInstance {custom:string}
interface Packet extends HitReactionPacket<'cold'>{custom:string}
interface Result extends HitReactionResult {custom:string}
declare const ports:HitReactionPorts<Actor,Instance,Skill,Position,Mod,'cold',Item,Brain,Watch,Spill,Result>,caster:Actor,target:Actor,inst:Instance,def:Skill,extra:Mod[],packet:Packet,result:Result;
const service=createHitReactions<Actor,Instance,Skill,Position,Mod,'cold',Item,Brain,Watch,Spill,Packet,Result>(ports);
const outcome:void=service.apply(caster,inst,target,def,extra,packet,100,0,true,result);
ports.damageCue=(actor,damage,hit)=>{const position:Position=actor.pos;const value:number=damage;const custom:string=hit.custom;};
// @ts-expect-error Positions retain host coordinates.
caster.pos={x:1,y:2};
// @ts-expect-error Modifiers retain their host payload.
service.apply(caster,inst,target,def,[{wrong:1}],packet,100,0,true,result);
// @ts-expect-error Loot retains its host payload.
ports.spillLoot(target,{wrong:1});
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',strict:true,noEmit:true,types:[]},include:['types.ts']});
const types=execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.json'],{cwd:consumer,encoding:'utf8',windowsHide:true});fs.writeFileSync(path.join(directory,'types.txt'),types);
fs.writeFileSync(path.join(consumer,'browser.mjs'),"export {createHitReactions} from '@hollow-wake/engine/combat/hit-reactions';\n");
const browser=await build({absWorkingDir:consumer,tsconfigRaw:{},nodePaths:[path.join(consumer,'node_modules')],entryPoints:[path.join(consumer,'browser.mjs')],bundle:true,platform:'browser',format:'esm',target:'es2022',write:false,metafile:true});
assert(Object.keys(browser.metafile.inputs).every(file=>!file.includes('.reference')));fs.writeFileSync(path.join(directory,'browser.mjs'),browser.outputFiles[0].contents);
const report={passed:true,directory,consumer,tests:32,typesPassed:true,browserBytes:browser.outputFiles[0].contents.length,archiveSha256:sha256(fs.readFileSync(path.join(directory,packed.filename))),independentInstallation:true};writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/hit-reactions-package-verification.json',report);console.log(report);
