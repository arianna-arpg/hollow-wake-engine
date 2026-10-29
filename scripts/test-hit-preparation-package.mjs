import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {build} from 'esbuild';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const directory=fs.mkdtempSync(path.join(root,'.artifacts/hit-preparation-package-')),consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-hit-preparation-'));
const npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const [packed]=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',directory,'--cache',path.join(root,'.artifacts/npm-cache')],{cwd:root,encoding:'utf8'}));
writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',path.join(directory,packed.filename),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe'});
const source=fs.readFileSync(path.join(root,'test/hit-preparation.test.mjs'),'utf8').replace("'../dist/hit-preparation.js'","'@hollow-wake/engine/combat/hit-preparation'");assert(!source.includes('../dist/'));
fs.writeFileSync(path.join(consumer,'test.mjs'),"Math.random=()=>{throw Error('Ambient random');};globalThis.fetch=()=>{throw Error('Network');};\n"+source);
const result=execFileSync(process.execPath,['--test','test.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,HWE_HIT_PREPARATION_MODULE:''}});fs.writeFileSync(path.join(directory,'tests.txt'),result);assert.match(result,/pass 28/);
fs.writeFileSync(path.join(consumer,'types.ts'),`import {createHitPreparation,type HitPreparationActor,type HitPreparationPorts,type HitPreparationSkill,type PendingPreparedHit} from '@hollow-wake/engine/combat/hit-preparation';
type Position={opaque:string};type Mod={value:number};type Effect={type:'status';id:string};type Packet={amounts:Partial<Record<string,number>>;critical:boolean};
interface Actor extends HitPreparationActor<Actor,Position,Mod,'cold'>{}
interface Skill extends HitPreparationSkill<'cold'>{id:string}
type Instance={def:Skill;procChainDepth?:number};
declare const ports:HitPreparationPorts<Actor,Instance,Skill,Position,Mod,'cold',Packet,'ice',Effect,number>,actor:Actor,inst:Instance;
const service=createHitPreparation<Actor,Instance,Skill,Position,Mod,'cold',Packet,'ice',Effect,number>(ports);
const result:number|undefined=service.prepare(actor,inst,actor,1,0,undefined,false,false,[{type:'status',id:'ice'}],{opaque:'impact'},0);
// @ts-expect-error Positions are host-defined, not engine coordinates.
service.prepare(actor,inst,actor,1,0,undefined,false,false,undefined,{x:1,y:2});
// @ts-expect-error Effect payload requirements remain part of the host contract.
service.prepare(actor,inst,actor,1,0,undefined,false,false,[{type:'status'}]);
// @ts-expect-error Packet identity retains required host fields.
const invalid:Packet={amounts:{cold:2}};
declare const pending:PendingPreparedHit<Actor,Instance,Position,Effect>;
const kind:'hit'=pending.kind;
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',strict:true,noEmit:true,types:[]},include:['types.ts']});
const types=execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.json'],{cwd:consumer,encoding:'utf8'});fs.writeFileSync(path.join(directory,'types.txt'),types);
fs.writeFileSync(path.join(consumer,'browser.mjs'),"export {createHitPreparation} from '@hollow-wake/engine/combat/hit-preparation';\n");
const browser=await build({absWorkingDir:consumer,tsconfigRaw:{},nodePaths:[path.join(consumer,'node_modules')],entryPoints:[path.join(consumer,'browser.mjs')],bundle:true,platform:'browser',format:'esm',target:'es2022',write:false,metafile:true});
assert(Object.keys(browser.metafile.inputs).every(file=>!file.includes('.reference')));fs.writeFileSync(path.join(directory,'browser.mjs'),browser.outputFiles[0].contents);
const report={passed:true,directory,consumer,tests:28,typesPassed:true,browserBytes:browser.outputFiles[0].contents.length,archiveSha256:sha256(fs.readFileSync(path.join(directory,packed.filename))),independentInstallation:true};writeJSON(path.join(directory,'verification.json'),report);writeJSON(path.join(root,'.artifacts/hit-preparation-package-verification.json'),report);console.log(report);
