import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {gunzipSync} from 'node:zlib';import {root,writeJSON} from './reference-utils.mjs';import {readCatalogue} from './catalogue-tools.mjs';import {buildSupportContent} from './compile-support-content.mjs';
const a=path.join(root,'.artifacts'),content=path.join(a,'support-content-package');buildSupportContent(content);
const npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),archives=[root,content].map(cwd=>JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',a,'--cache',path.join(a,'npm-cache')],{cwd,encoding:'utf8'}))[0]);
assert(archives[1].unpackedSize<512*1024,'Support content exceeded its 512 KiB budget');assert.deepEqual(archives[1].files.map(f=>f.path).sort(),['LICENSE.md','README.md','manifest.json','package.json','supports.json']);
const consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-supports-'));writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',...archives.map(p=>path.join(a,p.filename)),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe'});
const observed=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-twenty-one/support-content.json.gz')))),rules=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-twenty-one/support-rules.json.gz')))),catalogue=readCatalogue(),cases=rules.cases.filter(c=>c.support==='splitting');
writeJSON(path.join(consumer,'observed.json'),{cuts:observed.cuts,chances:observed.chances,seatBound:rules.seatBound,fireball:catalogue.tables.skills.find(s=>s.id==='fireball').value,matrix:rules.matrix[rules.skills.indexOf('fireball')],resolver:catalogue.tables.skills.find(s=>s.id===cases[0].skill).value,cases});
fs.writeFileSync(path.join(consumer,'run.mjs'),`
import fs from 'node:fs';import assert from 'node:assert/strict';
Math.random=()=>{throw new Error('Ambient RNG');};globalThis.fetch=()=>{throw new Error('Network');};for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw new Error(key);}});
const {SupportContent}=await import('@hollow-wake/engine/skills/support-content'),{SupportRules,canonicalSupportCut,resolveSupportCut,supportCutMechanisms,supportCutModifiers,rollSupportCut,supportTagsFit}=await import('@hollow-wake/engine/skills/supports'),{SupportActions}=await import('@hollow-wake/engine/skills/support-actions');
const pack=JSON.parse(fs.readFileSync(new URL(import.meta.resolve('@hollow-wake/support-content/supports.json')))),content=new SupportContent(pack),expected=JSON.parse(fs.readFileSync('observed.json'));
const make=(def,sockets=4)=>({def,level:1,sockets:new Array(sockets).fill(null)});
const rules=new SupportRules({policy:()=>content.policy,boarding:()=>'gated',baseTags:i=>i.def.tags,delivery:i=>i.def.delivery,castMode:i=>i.def.castMode??'cast',treeModifiers:()=>undefined,selfStack:()=>undefined,summon:()=>undefined,componentInstances:()=>[],componentStatuses:()=>[],hasChildFlights:()=>false,status:id=>content.status(id),tuneChance:(id,n)=>content.tuneChance(id,n),createCrew:make});
assert.equal(content.pack.supports.length,457);let tagChecks=0,chanceChecks=0,draws=0;
const bare=make(expected.fireball);
for(const [index,s] of content.pack.supports.entries()){
 assert.equal(supportTagsFit(s,bare.def.tags),!!(Number(expected.matrix[index])&1));assert.equal(rules.fits(s,bare),!!(Number(expected.matrix[index])&2));tagChecks++;
 assert.deepEqual(rules.seatBoundFields(s),expected.seatBound[index].fields);assert.equal(rules.ridesMinions(s),expected.seatBound[index].rides);
}
for(const row of expected.chances)for(const c of row.rows){assert.equal(content.tuneChance(row.id,c.authored),c.tuned);chanceChecks++;}
for(const row of expected.cuts){const base=content.support(row.id).rollBase;assert.deepEqual(canonicalSupportCut(base),row.canonical);assert.deepEqual(resolveSupportCut(base),row.rows);assert.deepEqual(supportCutMechanisms(base),row.mechanisms);assert.deepEqual(supportCutModifiers(base),row.mods);for(const r of row.rolls){let n=0;assert.deepEqual(rollSupportCut(base,()=>{draws++;n++;return r.unit;}),r.result);assert.equal(n,r.draws);}}
for(const row of expected.cases){const i=make(expected.resolver);i.level=20;i.bonusLevels=2.8;const gem={def:content.support(row.support),level:row.level};i.sockets[2]=gem;assert.deepEqual(rules.modifiers(i),row.full.mods);assert.equal(rules.effectiveLevel(i),row.full.level);gem.forwardScale=.7;assert.deepEqual(rules.modifiers(i),row.forwarded.mods);i.sockets[2]=null;i.grafts=[gem];assert.deepEqual(rules.modifiers(i),row.grafted.mods);}
const inst=make(expected.fireball),gem={def:content.support('splitting'),level:3,locked:true},seat={items:[{uid:1,gem}],full:false};let rebuilds=0;
const actions=new SupportActions({bagItem:(s,id)=>s.items.find(i=>i.uid===id),support:i=>i.gem,known:(_s,id)=>id===inst.def.id?inst:undefined,granted:()=>undefined,fits:(g,i)=>rules.fits(g.def,i,g.rolled),refusal:()=>null,fail:()=>{},remove:(s,id)=>{s.items.splice(s.items.findIndex(i=>i.uid===id),1);},give:(s,g)=>{if(s.full)return false;s.items.push({uid:2,gem:g});return true;},recalculate:()=>{rebuilds++;},resync:()=>{},dirty:()=>{},stored:i=>i.payload,storedSupport:()=>undefined});
const before=rules.modifiers(inst);assert(actions.socket(seat,1,'fireball'));assert.equal(inst.sockets[0],gem);assert(rules.modifiers(inst).some(m=>m.stat==='projectileCount'&&m.value===1));
const saved=JSON.parse(JSON.stringify({skillId:inst.def.id,sockets:inst.sockets.map(s=>s?{supportId:s.def.id,level:s.level,locked:s.locked}:null)})),restored=make(expected.fireball);restored.sockets=saved.sockets.map(s=>s?{def:content.support(s.supportId),level:s.level,locked:s.locked}:null);assert.deepEqual(rules.modifiers(restored),rules.modifiers(inst));
seat.full=true;assert(!actions.unsocket(seat,'fireball',0));assert.equal(inst.sockets[0],gem);seat.full=false;assert(actions.unsocket(seat,'fireball',0));assert.equal(seat.items[0].gem,gem);assert.deepEqual(rules.modifiers(inst),before);
console.log(JSON.stringify({installedConsumer:true,supports:457,bareFireballAdmissions:tagChecks,chanceChecks,cutDraws:draws,resolverCases:expected.cases.length,rebuilds,socketPreviewSaveUnsocket:true,contentId:content.pack.contentId}));
`);
fs.writeFileSync(path.join(consumer,'consumer.ts'),`
import {SupportContent,type SupportContentPack} from '@hollow-wake/engine/skills/support-content';
import {SupportRules,type SupportRulePorts,type SupportModifier,type SupportSkillDefinition,type SupportSocket,type SupportSkill} from '@hollow-wake/engine/skills/supports';
import {SupportActions,type SupportActionPorts} from '@hollow-wake/engine/skills/support-actions';
declare const pack:SupportContentPack; const content=new SupportContent(pack);
declare const ports:SupportRulePorts<SupportModifier,SupportSkillDefinition,SupportSocket,SupportSkill>;const rules=new SupportRules(ports);
declare const inst:SupportSkill; const mods:SupportModifier[]=rules.modifiers(inst);const fits:boolean=rules.fits(content.support('splitting'),inst);
declare const actions:SupportActionPorts<{id:string},SupportSkill,SupportSocket,{uid:number}>;const host=new SupportActions(actions);host.socket({id:'player'},1,'fireball');void mods;void fits;
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022'],types:[]},include:['consumer.ts']});
execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(consumer,'tsconfig.json')],{cwd:consumer,stdio:'pipe'});
const result=JSON.parse(execFileSync(process.execPath,['run.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,NODE_PATH:''}}));writeJSON(path.join(a,'support-package-verification.json'),{...result,typeConsumer:true,node:process.version,archiveBytes:archives[1].size,unpackedBytes:archives[1].unpackedSize});console.log(result);
