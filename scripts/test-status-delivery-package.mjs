import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {build} from 'esbuild';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const directory=fs.mkdtempSync(path.join(root,'.artifacts/status-delivery-package-')),consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-status-delivery-'));
const npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const[packed]=JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',directory,'--cache',path.join(root,'.artifacts/npm-cache')],{cwd:root,encoding:'utf8',windowsHide:true}));
writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',path.join(directory,packed.filename),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe',windowsHide:true});
const testFile=path.join(root,'test/status-delivery.test.mjs'),source=fs.readFileSync(testFile,'utf8').replace("'../dist/status-delivery.js'","'@hollow-wake/engine/statuses/delivery'");assert(!source.includes('../dist/'));
fs.writeFileSync(path.join(consumer,'test.mjs'),"Math.random=()=>{throw Error('Ambient random');};globalThis.fetch=()=>{throw Error('Network');};\n"+source);
const result=execFileSync(process.execPath,['--test','--test-reporter=tap','test.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,HWE_STATUS_DELIVERY_MODULE:''},windowsHide:true});fs.writeFileSync(path.join(directory,'tests.txt'),result);assert.match(result,/# pass 25/);
fs.writeFileSync(path.join(consumer,'types.ts'),`import {createStatusDelivery,type StatusDeliveryActor,type StatusDeliveryPorts,type DeliveryInstance,type DeliverySkill,type DeliveryStatus} from '@hollow-wake/engine/statuses/delivery';
type Tag='spell'|'attack';type Position={coordinates:[number,number,number]};type Direction={rotation:[number,number,number,number]};type Modifier={value:number};
interface Status extends DeliveryStatus{authoredMagnitude:number}
interface Instance extends DeliveryInstance{hostField:string}
interface Skill extends DeliverySkill{hostField:string}
interface Actor extends StatusDeliveryActor<Instance,Position,Modifier,Tag,Status>{team:'ally'|'enemy';construct?:{breakable?:{ownerMult:number}};customActorField:string}
declare const ports:StatusDeliveryPorts<Actor,Instance,Skill,Position,Direction,Status>,caster:Actor,target:Actor,inst:Instance,def:Skill,tags:Set<Tag>,extra:Modifier[];
const service=createStatusDelivery<Actor,Instance,Skill,Position,Direction,Modifier,Tag,Status>(ports);
const drawn:void=service.siphon(caster,{type:'siphonStatus',radius:100,from:'allies',healPer:8},1,def,tags,extra,'blue');
const recalled:void=service.recall(caster,inst,{type:'recallImpales',radius:100,damageScale:1.2,spearShare:.5},1,def);
const owned:boolean=service.isReturnedFrom(inst,inst);
ports.spawnProjectile=(actor,instance,position,direction,options)=>{const pos:Position=position;const aim:Direction=direction;const magnitude:number=options.flat.physical;const extension:string=instance.hostField;};
ports.transplant=(actor,status,name,options)=>{const magnitude:number=status.authoredMagnitude;};
// @ts-expect-error Host position need not be a 2D vector.
caster.pos={x:1,y:2};
// @ts-expect-error Direction need not be a scalar angle.
ports.spawnProjectile(caster,inst,caster.pos,3,{flat:{physical:10}});
// @ts-expect-error Context modifiers retain their host fields.
service.siphon(caster,{type:'siphonStatus',radius:1,from:'all'},1,def,tags,[{bad:true}],'red');
// @ts-expect-error The exact instance predicate preserves the host's instance type.
service.isReturnedFrom({level:1},inst);
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',strict:true,noEmit:true,types:[]},include:['types.ts']});
const types=execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.json'],{cwd:consumer,encoding:'utf8',windowsHide:true});fs.writeFileSync(path.join(directory,'types.txt'),types);
fs.writeFileSync(path.join(consumer,'browser.mjs'),"export {createStatusDelivery} from '@hollow-wake/engine/statuses/delivery';\n");
const browser=await build({absWorkingDir:consumer,tsconfigRaw:{},nodePaths:[path.join(consumer,'node_modules')],entryPoints:[path.join(consumer,'browser.mjs')],bundle:true,platform:'browser',format:'esm',target:'es2022',write:false,metafile:true});
assert(Object.keys(browser.metafile.inputs).every(file=>!file.includes('.reference')));fs.writeFileSync(path.join(directory,'browser.mjs'),browser.outputFiles[0].contents);
const report={passed:true,directory,consumer,tests:25,testSha256:sha256(fs.readFileSync(testFile)),typesPassed:true,browserBytes:browser.outputFiles[0].contents.length,archiveSha256:sha256(fs.readFileSync(path.join(directory,packed.filename))),independentInstallation:true};
writeJSON(path.join(directory,'verification.json'),report);writeJSON('.artifacts/status-delivery-package-verification.json',report);console.log(report);
