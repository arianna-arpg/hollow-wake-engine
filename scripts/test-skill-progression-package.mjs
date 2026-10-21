import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {root,writeJSON} from './reference-utils.mjs';import {buildSkillProgressionContent} from './compile-skill-progression.mjs';
const a=path.join(root,'.artifacts'),content=path.join(a,'skill-progression-package');buildSkillProgressionContent(content);
const npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),archives=[root,content].map(cwd=>JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',a,'--cache',path.join(a,'npm-cache')],{cwd,encoding:'utf8'}))[0]);
assert(archives[1].unpackedSize<2*1024*1024,'Skill progression content exceeded its 2 MiB budget');assert.deepEqual(archives[1].files.map(f=>f.path).sort(),['LICENSE.md','README.md','manifest.json','package.json','skill-progression.json']);
const consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-skill-progression-'));writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',...archives.map(p=>path.join(a,p.filename)),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe'});
fs.writeFileSync(path.join(consumer,'run.mjs'),`
import fs from 'node:fs';import assert from 'node:assert/strict';
Math.random=()=>{throw new Error('Ambient RNG');};globalThis.fetch=()=>{throw new Error('Network');};for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw new Error(key);}});
const {SkillProgression}=await import('@hollow-wake/engine/skills/progression'),{SkillActions,planSkillMerge}=await import('@hollow-wake/engine/skills/actions'),{compileSkillTree}=await import('@hollow-wake/engine/skills/tree'),{foldSkillTreeOverrides,foldSkillTreeModifiers,resolveSkillTreeEffects}=await import('@hollow-wake/engine/skills/grants');
const content=JSON.parse(fs.readFileSync(new URL(import.meta.resolve('@hollow-wake/skill-progression/skill-progression.json')))),p=new SkillProgression(content),services=p.pack.services;let trees=0,rebuilds=0;
assert.equal(p.pack.skills.length,954);assert.equal(p.pack.supports.length,457);
for(const def of p.pack.skills.filter(s=>s.tree)){
 const inst={def,level:4,rarity:'legendary',empowermentRank:2,treeNodes:[]},rules=p.tree(def.id),wallet=Object.fromEntries(services.essences.map(e=>[e.id,10000])),state={wallet};
 const host=new SkillActions({ability:()=>p.ability,tree:()=>rules,essences:()=>services.essences,font:()=>services.font,wallet:s=>s.wallet,known:(_s,id)=>id===def.id?inst:undefined,granted:()=>undefined,skillMax:()=>def.maxLevel,supportMax:g=>p.support(g.def.id).maxLevel,nearFont:()=>true,memoryRefusal:()=>null,swapRefusal:()=>null,position:()=>({x:0,y:0}),text:()=>{},fail:()=>{},markMetaDirty:()=>{},markCharacterDirty:()=>{},pickup:()=>{},awaken:()=>{},dismiss:()=>{},clearSummons:()=>{},clearFields:()=>{},trigger:()=>null,recalculate:()=>{rebuilds++;},mergePlan:()=>({need:0,available:0,barred:0,taken:[],returnSockets:[],refusal:'unused'}),sockets:()=>[],remove:()=>{},grantSkill:()=>{},grantSupport:()=>{},announceMerge:()=>{}});
 const cost=p.ability.skillLevelCost(5);assert(host.levelSkill(state,def.id));assert.equal(wallet[services.essences[cost.tier-1].id],10000-cost.count);assert.equal(rules.budget(inst).ability,1);
 while(inst.level<def.maxLevel)assert(host.levelSkill(state,def.id));assert(!host.levelSkill(state,def.id));
 const graph=compileSkillTree(def.tree,p.pack.layout);for(const id of graph.order)host.pick(state,def.id,id);assert(inst.treeNodes.length>0);
 const over=foldSkillTreeOverrides(rules,inst.treeNodes),mods=foldSkillTreeModifiers(rules,inst.treeNodes);assert(mods===undefined||Array.isArray(mods));assert(Array.isArray(resolveSkillTreeEffects(rules,def.effects??[],inst.treeNodes,false,over)));
 const rank=inst.empowermentRank;assert(host.reset(state,def.id));assert.equal(inst.treeNodes,undefined);assert.equal(inst.empowermentRank,rank);assert.equal(rules.budget(inst).passiveFree,2);trees++;
}
const copies=[{skillId:'s',rarity:'legendary',level:10,empowermentRank:2},{skillId:'s',rarity:'legendary',level:20,empowermentRank:1}],merge=planSkillMerge(copies,'s','legendary',{merge:services.font.merge,rarities:services.rarities.map(r=>r.id),empowerment:services.empowerment},{payload:i=>i,locked:()=>false,known:()=>true,restore:i=>i,create:()=>{throw new Error('Legendary must preserve keeper');}});assert.equal(merge.result.empowermentRank,4);assert.equal(merge.result.level,20);assert.equal(merge.returnSockets[0],copies[1]);
assert.equal(trees,132);console.log(JSON.stringify({installedConsumer:true,trees,rebuilds,skills:p.pack.skills.length,supports:p.pack.supports.length,levelPurchaseChoicePayloadReset:true,legendaryInvestment:true,contentId:p.pack.contentId}));
`);
fs.writeFileSync(path.join(consumer,'consumer.ts'),`
import {SkillProgression,type SkillProgressionPack} from '@hollow-wake/engine/skills/progression';
import {foldSkillTreeModifiers,resolveSkillTreeEffects,type SkillTreeGrantNode} from '@hollow-wake/engine/skills/grants';
import type {Modifier} from '@hollow-wake/engine';
declare const input: SkillProgressionPack<SkillTreeGrantNode<Modifier>>;
const p = new SkillProgression(input), rules=p.tree('some-skill');
const modifiers: Modifier[] | undefined = foldSkillTreeModifiers(rules,['node']);
const effects = resolveSkillTreeEffects(rules,p.skill('some-skill').effects??[],['node'],false);
void modifiers; void effects;
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2022'],types:[]},include:['consumer.ts']});
execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(consumer,'tsconfig.json')],{cwd:consumer,stdio:'pipe'});
const result=JSON.parse(execFileSync(process.execPath,['run.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,NODE_PATH:''}}));writeJSON(path.join(a,'skill-progression-package-verification.json'),{...result,typeConsumer:true,node:process.version,archiveBytes:archives[1].size,unpackedBytes:archives[1].unpackedSize});console.log(result);
