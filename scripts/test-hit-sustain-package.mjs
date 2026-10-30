import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {build} from 'esbuild';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const directory=fs.mkdtempSync(path.join(root,'.artifacts/hit-sustain-package-')),consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-hit-sustain-'));
const npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const [packed]=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',directory,'--cache',path.join(root,'.artifacts/npm-cache')],{cwd:root,encoding:'utf8',windowsHide:true}));
writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',path.join(directory,packed.filename),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe',windowsHide:true});
const source=fs.readFileSync(path.join(root,'test/hit-sustain.test.mjs'),'utf8').replace("'../dist/hit-sustain.js'","'@hollow-wake/engine/combat/hit-sustain'");assert(!source.includes('../dist/'));
fs.writeFileSync(path.join(consumer,'test.mjs'),"Math.random=()=>{throw Error('Ambient random');};globalThis.fetch=()=>{throw Error('Network');};\n"+source);
const result=execFileSync(process.execPath,['--test','--test-reporter=tap','test.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,HWE_HIT_SUSTAIN_MODULE:''},windowsHide:true});fs.writeFileSync(path.join(directory,'tests.txt'),result);assert.match(result,/# pass 24/);
fs.writeFileSync(path.join(consumer,'types.ts'),`import {createHitSustain,type HitSustainActor,type HitSustainPorts,type HitSustainSkill} from '@hollow-wake/engine/combat/hit-sustain';
type Position={opaque:string};type Mod={value:number};type Cue={asset:string};
interface Actor extends HitSustainActor<Position,Mod,'cold'>{hostField:string}
interface Skill extends HitSustainSkill<Cue>{id:string}
declare const ports:HitSustainPorts<Actor,Skill,Position,'cold',Cue>,caster:Actor,target:Actor,def:Skill,extra:readonly Mod[];
const service=createHitSustain<Actor,Skill,Position,Mod,'cold',Cue>(ports);
const result:void=service.apply(caster,target,def,extra,100,0);
ports.sharedHealingCue=(actor,amount)=>{const position:Position=actor.pos;const value:number=amount;};
// @ts-expect-error Position belongs to the host; engine coordinates are not substituted.
caster.pos={x:1,y:2};
// @ts-expect-error A modifier must retain the host's payload type.
service.apply(caster,target,def,[{wrong:1}],100,0);
// @ts-expect-error Presentation keeps its host-defined cue payload.
def.feedingCue={color:'red'};
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',strict:true,noEmit:true,types:[]},include:['types.ts']});
const types=execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.json'],{cwd:consumer,encoding:'utf8',windowsHide:true});fs.writeFileSync(path.join(directory,'types.txt'),types);
fs.writeFileSync(path.join(consumer,'browser.mjs'),"export {createHitSustain} from '@hollow-wake/engine/combat/hit-sustain';\n");
const browser=await build({absWorkingDir:consumer,tsconfigRaw:{},nodePaths:[path.join(consumer,'node_modules')],entryPoints:[path.join(consumer,'browser.mjs')],bundle:true,platform:'browser',format:'esm',target:'es2022',write:false,metafile:true});
assert(Object.keys(browser.metafile.inputs).every(file=>!file.includes('.reference')));fs.writeFileSync(path.join(directory,'browser.mjs'),browser.outputFiles[0].contents);
const report={passed:true,directory,consumer,tests:24,typesPassed:true,browserBytes:browser.outputFiles[0].contents.length,archiveSha256:sha256(fs.readFileSync(path.join(directory,packed.filename))),independentInstallation:true};writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/hit-sustain-package-verification.json',report);console.log(report);
