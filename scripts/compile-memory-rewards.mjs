import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file)));
import {readCatalogue} from './catalogue-tools.mjs';
import {MemoryRewardContent} from '../dist/memory-reward-content.js';
import * as memory from '../dist/memory-rewards.js';

export function memoryRewardPack(){
const accepted=read('baseline/unlock-lifecycle/acceptance.json'),fixture=accepted.fixtures.memory;
const compressed=fs.readFileSync(path.join(root,fixture.file));
assert.equal(sha256(compressed),fixture.compressedSha256);
const bytes=gunzipSync(compressed);assert.equal(sha256(bytes),fixture.sha256);
const source=JSON.parse(bytes);
const supplements=read('baseline/unlock-lifecycle/supplement-acceptance.json');
const keyRecord=supplements.fixtures.memoryKeys;
const keyBytes=gunzipSync(fs.readFileSync(path.join(root,keyRecord.file)));
assert.equal(sha256(keyBytes),keyRecord.sha256);
const keySource=JSON.parse(keyBytes);
const initializedRecord=supplements.fixtures.memoryInitialized;
const initializedCompressed=fs.readFileSync(path.join(root,initializedRecord.file));
assert.equal(sha256(initializedCompressed),initializedRecord.compressedSha256);
const initializedBytes=gunzipSync(initializedCompressed);
assert.equal(sha256(initializedBytes),initializedRecord.sha256);
const initialized=JSON.parse(initializedBytes);
assert.deepEqual(keyRecord.encoders,{
 gemDropKey:'(gemId:string):string=>`${LEDGER_GEMDROP_PREFIX}${gemId}`',
 odysseyMilestoneKey:'(stage:number):string=>`odyssey_stage_${stage}`',
 memoryKey:'(kind:MemoryKind,id:string):string=>`${kind}:${id}`',
});
const zero=keySource.milestones.find(row=>row.stage===0).key;
assert(zero.endsWith('0'));
const keys={unlockAllFeature:keySource.unlockAllFeature,milestonePrefix:zero.slice(0,-1),
 awakeningStage:keySource.awakeningStage,gemDropPrefix:keySource.gemDropPrefix};
const catalogue=readCatalogue();
const byId=(a,b)=>a.id<b.id?-1:a.id>b.id?1:0;
const clean=value=>JSON.parse(JSON.stringify(value));
assert.deepEqual([...initialized.skills].sort(byId),clean(catalogue.tables.skills.map(({id,value})=>({
 id,name:value.name,noDrop:value.noDrop,dropWeight:value.dropWeight,
}))).sort(byId));
assert.deepEqual([...initialized.supports].sort(byId),clean(catalogue.tables.supports.map(({id,value})=>({
 id,name:value.name,weight:value.weight,
}))).sort(byId));
const earlySkills=new Map(source.skillRows.map(row=>[row.id,row]));
assert.deepEqual(initialized.skills.filter(row=>earlySkills.has(row.id)),source.skillRows);
const lateSkills=initialized.skills.filter(row=>!earlySkills.has(row.id));
assert.equal(lateSkills.length,6);
assert(lateSkills.every(row=>row.noDrop===true));
assert.deepEqual(initialized.supports,source.supportRows);
assert.deepEqual(initialized.catalog,source.observations.find(row=>row.name==='default/fresh').catalog);
const data={schemaVersion:1,capability:'memory-rewards/v1',keys,config:source.config,
 definitions:source.definitions,skills:initialized.skills,supports:initialized.supports};
const pack={...data,contentId:'hollow-wake-memory-rewards:sha256:'+sha256(JSON.stringify(data))};
const content=new MemoryRewardContent(pack);
for(const row of keySource.gemDrops)assert.equal(content.gemDropKey(row.id),row.key);
for(const row of keySource.memoryKeys)assert.equal(memory.memoryKey(row.kind,row.id),row.key);
for(const row of keySource.progression)assert.equal(content.progressionOpen(row.ledger),row.open);
const decode=value=>JSON.parse(JSON.stringify(value),(_key,row)=>
 row&&typeof row==='object'&&!Array.isArray(row)&&Object.keys(row).length===1&&typeof row.number==='string'?Number(row.number):row);
function account(row){
 return {...row,features:new Set(row.features),unlockedSkills:new Set(row.unlockedSkills),
  unlockedSupports:new Set(row.unlockedSupports),explicitSkillUnlocks:new Set(row.explicitSkillUnlocks),
  memorySecondary:new Set(row.memorySecondary),memoryReceipts:decode(row.memoryReceipts),ledger:decode(row.ledger)};
}
for(const row of initialized.awakening){
 assert.equal(content.canAwakenSkill(row.id),row.result,row.id);
}
let profiles=0,invalidProfiles=0;
for(const original of source.observations){
 const profilePack={...pack,config:decode(original.config)};
 if(original.name.startsWith('weight-overrides/')){
  assert.throws(()=>new MemoryRewardContent(profilePack));invalidProfiles++;continue;
 }
 const rules=new MemoryRewardContent(profilePack),value=account(original.before);
 assert.deepEqual(memory.memoryCatalog(rules),original.catalog,original.name+' catalogue');
 assert.equal(memory.memoryProgressionOpen(value,rules),original.progression);
 assert.deepEqual(memory.memoryAccessView(value,rules),original.access);
 assert.deepEqual(source.definitions.map(definition=>({id:definition.id,pool:memory.memoryUnlockCandidates(value,definition,rules)})),original.candidates);
 for(const row of original.entries){
  assert.equal(memory.memoryKey(row.kind,row.id),row.key);
  assert.equal(memory.memoryDiscovered(value,row.kind,row.id,rules),row.discovered);
  assert.equal(memory.memorySecondaryOwned(value,row.kind,row.id,rules),row.secondaryOwned);
  assert.deepEqual(['tree','commission','prestige'].map(mechanic=>memory.memorySecondaryOpen(value,row.kind,row.id,mechanic,rules)),row.access);
  assert.deepEqual([0,3,4,NaN].map(need=>memory.memoryCommissionReady(value,row.kind,row.id,need,rules)),row.commission);
 }
 profiles++;
}
return content.pack;
}

export function buildMemoryRewards(destination) {
 const pack=memoryRewardPack();
 fs.mkdirSync(destination,{recursive:true});
 const bytes=JSON.stringify(pack,null,2)+'\n';
 fs.writeFileSync(path.join(destination,'memories.json'),bytes);
 writeJSON(path.join(destination,'package.json'),{
  name:'@hollow-wake/memory-rewards',version:'0.1.0',private:true,type:'module',license:'PolyForm-Noncommercial-1.0.0',
  exports:{'./memories.json':'./memories.json','./manifest.json':'./manifest.json'},files:['memories.json','manifest.json','LICENSE.md','NOTICE.md','README.md']});
 writeJSON(path.join(destination,'manifest.json'),{schemaVersion:1,capability:'memory-rewards/v1',contentId:pack.contentId,sha256:sha256(bytes),bytes:Buffer.byteLength(bytes)});
 for(const file of ['LICENSE.md','NOTICE.md'])fs.copyFileSync(path.join(root,file),path.join(destination,file));
 fs.writeFileSync(path.join(destination,'README.md'),"# Hollow Wake memory rewards\n\nImmutable definitions and initialized skill/support reward columns. Load once with @hollow-wake/engine/progression/memory-content and supply caller-owned account state plus explicit randomness. Validation is part of loading; account storage and authority belong to the host.\n");
 return pack;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const pack=buildMemoryRewards(path.join(root,'.artifacts/memory-rewards-content'));console.log({contentId:pack.contentId});
}
