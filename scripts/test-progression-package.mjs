import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {root,writeJSON} from './reference-utils.mjs';import {buildProgressionContent} from './compile-progression-content.mjs';import {buildPassiveContent} from './compile-passive-content.mjs';import {buildPassiveGrants} from './compile-passive-grants.mjs';import {buildCatalogue} from './catalogue-tools.mjs';
const a=path.join(root,'.artifacts'),progression=path.join(a,'progression-package'),policy=path.join(a,'passive-package'),grants=path.join(a,'passive-grant-package'),catalogue=path.join(a,'catalogue-package');
buildProgressionContent(progression);buildPassiveContent(policy);buildPassiveGrants(grants);buildCatalogue(catalogue);
const npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const archives=[root,progression,policy,grants,catalogue].map(cwd=>JSON.parse(execFileSync(process.execPath,[npm,'pack','--json','--pack-destination',a,'--cache',path.join(a,'npm-cache')],{cwd,encoding:'utf8'}))[0]);
assert(archives[1].unpackedSize<128*1024,'Progression content exceeded 128 KiB');assert.deepEqual(archives[1].files.map(f=>f.path).sort(),['LICENSE.md','README.md','manifest.json','package.json','progression.json']);
const consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-progression-'));writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npm,'install',...archives.map(p=>path.join(a,p.filename)),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe'});
fs.writeFileSync(path.join(consumer,'run.mjs'),`
import fs from 'node:fs';import assert from 'node:assert/strict';
Math.random=()=>{throw new Error('Ambient RNG');};globalThis.fetch=()=>{throw new Error('Network');};
for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw new Error(key);}});
const {CharacterProgression,ProgressionHost}=await import('@hollow-wake/engine/character/progression');
const {PassivePolicy}=await import('@hollow-wake/engine/passives');const {PassiveGrants}=await import('@hollow-wake/engine/passives/grants');const {StatRules,StatSheet}=await import('@hollow-wake/engine');
const read=id=>JSON.parse(fs.readFileSync(new URL(import.meta.resolve(id))));
const progression=new CharacterProgression(read('@hollow-wake/progression/progression.json')),policy=new PassivePolicy(read('@hollow-wake/passives/passives.json')),grants=new PassiveGrants(read('@hollow-wake/passive-grants/grants.json'));
const stats=Object.fromEntries(read('@hollow-wake/catalogue/tables/stats.json').map(r=>[r.id,r.value])),trades=read('@hollow-wake/catalogue/tables/rules.json').find(r=>r.id==='statTrades').value,rules=new StatRules(stats,trades);
let checked=0;
for(const {value:c} of read('@hollow-wake/catalogue/tables/classes.json')){
 const state={classId:c.id,allocated:new Set([c.startNode]),choices:{},grafts:{},vocations:[],passivePoints:0,vocationPoints:0,realmPoints:{},xp:0,xpNeeded:progression.experienceForLevel(1)},hero={level:1,life:0,mana:0},ledger={},tree=policy.attach(state);let sheet;
 const recalculate=()=>{const g=grants.begin(c.attributes,state.allocated,state.choices);sheet=new StatSheet(rules);sheet.setSource('attributes',g.attributeModifiers());sheet.setSource('class',c.innate??[]);sheet.setSource('passives',g.passiveModifiers);sheet.setSource('level',progression.levelModifiers(hero.level));};
 recalculate();const initialLife=sheet.get('life');
 const host=new ProgressionHost({state:()=>state,hero:()=>hero,classId:()=>c.id,eligible:()=>true,rules:()=>progression,blessing:()=>0,experienceMultiplier:()=>1,markDirty:()=>{},recalculate,fillResources:()=>{hero.life=sheet.get('life');hero.mana=sheet.get('mana');},announce:()=>{},local:()=>true,resyncMercenary:()=>{},accountOwned:()=>true,ledger:()=>ledger});
 host.grant(null,45);assert.equal(hero.level,2);assert.equal(state.passivePoints,1);assert(hero.life>initialLife);
 let allocated;
 for(const id of policy.pack.adjacency[c.startNode]){const group=policy.group(policy.node(id));if(tree.allocate(id,{ledger},group?.options[0].id).accepted){allocated=id;break;}}
 assert(allocated,'An earned point must fund a connected passive for '+c.id);assert.equal(state.passivePoints,0);recalculate();assert(Number.isFinite(sheet.get('life')));assert.equal(tree.refund(allocated).refusal,null);assert.equal(state.passivePoints,1);
 host.grant(null,state.xpNeeded+progression.experienceForLevel(3));assert.equal(hero.level,4);assert.equal(state.passivePoints,3);assert.equal(hero.life,sheet.get('life'));checked++;
}
assert.equal(checked,39);console.log(JSON.stringify({installedConsumer:true,experienceToPassiveSpendToStats:true,classes:checked,contentId:progression.pack.contentId}));
`);
const result=JSON.parse(execFileSync(process.execPath,['run.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,NODE_PATH:''}}));writeJSON(path.join(a,'progression-package-verification.json'),{...result,node:process.version,archiveBytes:archives[1].size,unpackedBytes:archives[1].unpackedSize});console.log(result);
