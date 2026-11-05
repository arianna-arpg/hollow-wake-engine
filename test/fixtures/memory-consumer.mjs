import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {MemoryRewardContent} from '@hollow-wake/engine/progression/memory-content';
import * as memory from '@hollow-wake/engine/progression/memories';

const bytes=fs.readFileSync(new URL(import.meta.resolve('@hollow-wake/memory-rewards/memories.json')));
const manifest=JSON.parse(fs.readFileSync(new URL(import.meta.resolve('@hollow-wake/memory-rewards/manifest.json'))));
assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.sha256);
assert.equal(bytes.length,manifest.bytes);
const pack=JSON.parse(bytes),content=new MemoryRewardContent(pack);
const expected=JSON.parse(gunzipSync(fs.readFileSync('expected.json.gz')));
const encode=(_key,value)=>typeof value==='number'&&!Number.isFinite(value)?{number:String(value)}:value;
const clean=value=>JSON.parse(JSON.stringify(value,encode));
const decode=value=>JSON.parse(JSON.stringify(value),(_key,row)=>
 row&&typeof row==='object'&&!Array.isArray(row)&&Object.keys(row).length===1&&typeof row.number==='string'?Number(row.number):row);
function account(row){
 return {...row,features:new Set(row.features),unlockedSkills:new Set(row.unlockedSkills),
  unlockedSupports:new Set(row.unlockedSupports),explicitSkillUnlocks:new Set(row.explicitSkillUnlocks),
  memorySecondary:new Set(row.memorySecondary),memoryReceipts:decode(row.memoryReceipts),ledger:decode(row.ledger)};
}
function snapshot(value,base){
 return clean({...base,features:[...value.features],unlockedSkills:[...value.unlockedSkills],
  unlockedSupports:[...value.unlockedSupports],explicitSkillUnlocks:[...value.explicitSkillUnlocks],
  memorySecondary:[...value.memorySecondary],memoryReceipts:value.memoryReceipts,ledger:value.ledger});
}
function liveContext(config){
 return {config,unlockAllFeature:content.unlockAllFeature,catalogue:()=>content.catalogue(),
  progressionOpen:ledger=>content.progressionOpen(ledger),gemDropKey:id=>content.gemDropKey(id),
  canAwakenSkill:id=>content.canAwakenSkill(id)};
}
const contexts=new Map();
let validatedProfiles=0,rawProfiles=0;
for(const original of expected.observations){
 const config=decode(original.config),name=original.name.split('/')[0];
 let rules=contexts.get(name);
 if(!rules){
  if(name==='weight-overrides'){
   assert.throws(()=>new MemoryRewardContent({...pack,config}));
   rules=liveContext(config);
  }else rules=new MemoryRewardContent({...pack,config});
  contexts.set(name,rules);
 }
 if(name==='weight-overrides')rawProfiles++;else validatedProfiles++;
 const value=account(original.before);
 assert.deepEqual(clean(memory.memoryCatalog(rules)),original.catalog,original.name+' catalogue');
 assert.equal(memory.memoryProgressionOpen(value,rules),original.progression);
 assert.deepEqual(memory.memoryAccessView(value,rules),original.access);
 assert.deepEqual(pack.definitions.map(definition=>({id:definition.id,pool:clean(memory.memoryUnlockCandidates(value,definition,rules))})),original.candidates);
 for(const row of original.entries){
  assert.equal(memory.memoryKey(row.kind,row.id),row.key);
  assert.equal(memory.memoryDiscovered(value,row.kind,row.id,rules),row.discovered);
  assert.equal(memory.memorySecondaryOwned(value,row.kind,row.id,rules),row.secondaryOwned);
  assert.deepEqual(['tree','commission','prestige'].map(mechanic=>memory.memorySecondaryOpen(value,row.kind,row.id,mechanic,rules)),row.access);
  assert.deepEqual([0,3,4,NaN].map(need=>memory.memoryCommissionReady(value,row.kind,row.id,need,rules)),row.commission);
 }
 assert.deepEqual(snapshot(value,original.before),original.before);
}
for(const row of expected.draws){
 const value=account(row.before),definition=decode(row.definition),rules=contexts.get(row.name.split('/')[0])??content;
 let randomDraws=0;
 const receipt=memory.grantMemoryUnlock(value,definition,()=>{randomDraws++;return decode(row.roll);},rules);
 assert.deepEqual(clean(receipt),row.receipt,row.name+' receipt');
 assert.equal(randomDraws,row.randomDraws,row.name+' RNG');
 assert.deepEqual(snapshot(value,row.before),row.after,row.name+' account');
 assert.equal(Object.hasOwn(value.memoryReceipts,definition.id),row.ownReceipt,row.name+' own receipt');
 assert.equal(Object.getPrototypeOf(value.memoryReceipts),Object.prototype);
 assert.equal(receipt?value.memoryReceipts[definition.id]===receipt:null,row.storedIdentity);
}
for(const row of expected.drops){
 const [configuration,id,rarityText]=row.name.split('/'),rules=contexts.get(configuration);
 const value=account(row.before),rarity=rarityText==='undefined'?undefined:rarityText;
 assert.equal(memory.awakenMemoryFromDrop(value,id,rarity,rules),row.first,row.name);
 assert.deepEqual(snapshot(value,row.before),row.after);
 assert.equal(memory.awakenMemoryFromDrop(value,id,rarity,rules),row.repeat);
 assert.deepEqual(snapshot(value,row.before),row.afterRepeat);
 assert.deepEqual(memory.memoryAccessView(value,rules),row.access);
}
for(const row of expected.callbackDraws){
 const value=account(row.before),rules=liveContext(structuredClone(pack.config)),definition=pack.definitions[0];
 let randomDraws=0,receipt,error;const nested=[];
 try{
  receipt=memory.grantMemoryUnlock(value,definition,()=>{
   randomDraws++;
   if(row.mode==='throw')throw new Error('observer random failure');
   if(row.mode==='change-account')for(const candidate of content.catalogue())(candidate.kind==='skill'?value.unlockedSkills:value.unlockedSupports).add(candidate.id);
   if(row.mode==='change-policy')rules.config.excluded=content.catalogue().map(candidate=>memory.memoryKey(candidate.kind,candidate.id));
   if(row.mode==='nested-grant')nested.push(memory.grantMemoryUnlock(value,definition,()=>.375,rules));
   return .375;
  },rules);
 }catch(caught){error={name:caught.name,message:caught.message};}
 assert.deepEqual(clean({receipt,error,randomDraws,nested,after:snapshot(value,row.before)}),
  clean({receipt:row.receipt,error:row.error,randomDraws:row.randomDraws,nested:row.nested,after:row.after}),row.mode);
}
for(const row of expected.catalogBoundaries){
 const weight=decode(row.weight),catalogue=[...content.catalogue()];
 if(weight>0){
  const skill={kind:'skill',id:'observer_memory_skill',name:'Observer skill',weight};
  const firstSupport=catalogue.findIndex(candidate=>candidate.kind==='support');
  catalogue.splice(firstSupport,0,skill);
  catalogue.push({kind:'support',id:'observer_memory_support',name:'Observer support',weight});
 }
 const rules={...liveContext(pack.config),catalogue:()=>catalogue};
 assert.deepEqual(clean(memory.memoryCatalog(rules)),row.catalog);
 const original=expected.observations.find(profile=>profile.name==='default/stage-two');
 assert.deepEqual(pack.definitions.map(definition=>clean(memory.memoryUnlockCandidates(account(original.before),definition,rules))),row.candidates);
}
console.log(JSON.stringify({passed:true,validatedProfiles,rawProfiles,draws:expected.draws.length,drops:expected.drops.length,
 callbackCases:expected.callbackDraws.length,catalogBoundaries:expected.catalogBoundaries.length,contentId:pack.contentId}));
