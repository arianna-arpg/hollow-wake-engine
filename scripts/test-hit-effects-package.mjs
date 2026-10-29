import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {build} from 'esbuild';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const directory=fs.mkdtempSync(path.join(root,'.artifacts/hit-effects-package-')),consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-hit-effects-'));
const npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const [packed]=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',directory,'--cache',path.join(root,'.artifacts/npm-cache')],{cwd:root,encoding:'utf8'}));
writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',path.join(directory,packed.filename),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe'});
const source=fs.readFileSync(path.join(root,'test/hit-effects.test.mjs'),'utf8').replace("'../dist/hit-effects.js'","'@hollow-wake/engine/combat/hit-effects'");assert(!source.includes('../dist/'));
fs.writeFileSync(path.join(consumer,'test.mjs'),"Math.random=()=>{throw Error('Ambient random');};globalThis.fetch=()=>{throw Error('Network');};\n"+source);
const result=execFileSync(process.execPath,['--test','test.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,HWE_HIT_EFFECTS_MODULE:''}});fs.writeFileSync(path.join(directory,'tests.txt'),result);assert.match(result,/pass 22/);
fs.writeFileSync(path.join(consumer,'types.ts'),`import {createHitEffects,type HitEffectSet,type HitEffectActor,type HitEffectFrame,type HitEffectPorts,type HitEffectInput} from '@hollow-wake/engine/combat/hit-effects';
type Position={opaque:string};type Direction={x:number;y:number;z:number};type Mod={value:number};type Status={id:string;power:number};
interface Actor extends HitEffectActor<Actor,Position,Mod,string,Status>{}
type Skill={id:string;name:string;color:string;tags:string[]};type Instance={effects:HitEffectInput<HitEffectSet,'recallMinions'>[]};
type Frame=HitEffectFrame<Actor,Instance,Skill,Mod,string>;
declare const ports:HitEffectPorts<Actor,Instance,Position,Direction,Mod,string,Status,HitEffectSet,'recallMinions',Frame>,frame:Frame;
const service=createHitEffects<Actor,Instance,Skill,Position,Direction,Mod,string,Status,HitEffectSet,'recallMinions',Frame>(ports);
service.dispatch(frame,1,[{type:'ward',amount:3},{type:'recallMinions'}]);
// @ts-expect-error A known kind still requires its dispatch fields.
service.dispatch(frame,1,[{type:'absorb'}]);
// @ts-expect-error A broad string cannot bypass known-kind validation.
const invalid:HitEffectInput<HitEffectSet,string>={type:'absorb'};
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',strict:true,noEmit:true,types:[]},include:['types.ts']});
const types=execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.json'],{cwd:consumer,encoding:'utf8'});fs.writeFileSync(path.join(directory,'types.txt'),types);
fs.writeFileSync(path.join(consumer,'browser.mjs'),"export {createHitEffects} from '@hollow-wake/engine/combat/hit-effects';\n");
const browser=await build({absWorkingDir:consumer,tsconfigRaw:{},nodePaths:[path.join(consumer,'node_modules')],entryPoints:[path.join(consumer,'browser.mjs')],bundle:true,platform:'browser',format:'esm',target:'es2022',write:false,metafile:true});
assert(Object.keys(browser.metafile.inputs).every(file=>!file.includes('.reference')));fs.writeFileSync(path.join(directory,'browser.mjs'),browser.outputFiles[0].contents);
const report={passed:true,directory,consumer,tests:22,typesPassed:true,browserBytes:browser.outputFiles[0].contents.length,archiveSha256:sha256(fs.readFileSync(path.join(directory,packed.filename))),independentInstallation:true};writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/hit-effects-package-verification.json'),report);console.log(report);
