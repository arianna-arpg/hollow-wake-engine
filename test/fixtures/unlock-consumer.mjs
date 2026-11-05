
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {UnlockContent} from '@hollow-wake/engine/progression/unlock-content';
import {UnlockLifecycle} from '@hollow-wake/engine/progression/unlocks';
import {ProgressionGateContent} from '@hollow-wake/engine/progression/gate-content';
import {MemoryRewardContent} from '@hollow-wake/engine/progression/memory-content';
import {RelicCustody} from '@hollow-wake/engine/inventory/relics';
import {StashPolicy} from '@hollow-wake/engine/inventory/stash';
const read=(name,file)=>JSON.parse(fs.readFileSync(new URL(import.meta.resolve('@hollow-wake/'+name+'/'+file))));
const policy=JSON.parse(gunzipSync(fs.readFileSync(new URL('./policy.json.gz',import.meta.url))));
const transactions=JSON.parse(gunzipSync(fs.readFileSync(new URL('./transactions.json.gz',import.meta.url))));
const pack=read('unlocks','unlocks.json'),gates=new ProgressionGateContent(read('progression-gates','gates.json')),memories=new MemoryRewardContent(read('memory-rewards','memories.json'));
const encode=(_key,value)=>typeof value==='number'&&!Number.isFinite(value)?{number:String(value)}:value;
const clean=value=>JSON.parse(JSON.stringify(value,encode));
const decode=value=>JSON.parse(JSON.stringify(value),(_key,row)=>row&&typeof row==='object'&&!Array.isArray(row)&&Object.keys(row).length===1&&typeof row.number==='string'?Number(row.number):row);
const sets=['unlockedClasses','pendingClassUnlocks','unlockedClassTiers','unlockedSkills','explicitSkillUnlocks','unlockedSupports','memorySecondary','features','unlockedSlots','packageUnlocks'];
function account(saved){const result=decode(saved);for(const key of sets)result[key]=new Set(result[key]);return result;}
function snapshot(a){return clean({...a,...Object.fromEntries(sets.map(key=>[key,key==='unlockedSlots'?[...a[key]].sort((a,b)=>a-b):[...a[key]]]))});}
const unsupported=()=>{throw new Error('This observation unexpectedly requires an item host');};
function runtime(overrides={}){
 const data={...pack,memoryConfig:{...pack.memoryConfig},classWeb:{...pack.classWeb}};
 for(const key of ['legacyGemBundles','showDebugCodex'])if(overrides[key]!==undefined)data.memoryConfig[key]=overrides[key];
 if(overrides.proseRevealFrac!==undefined)data.classWeb.proseRevealFrac=overrides.proseRevealFrac;
 const content=new UnlockContent(data,{gates,memories});
 const stash={...pack.relicStash,accepts:unsupported};
 const relics=new RelicCustody({isRelic:unsupported,footprint:unsupported,nextUid:unsupported,bumpUidFloor:unsupported,cloneItems:unsupported,
  stash:()=>stash,bagBoard:unsupported,progression:()=>pack.reliquaryConfig});
 const storage=new StashPolicy(unsupported);
 const context=content.context({
  reliquaryCost:state=>relics.cost(state),reliquaryPower:state=>relics.power(state),
  stashPageCost:state=>storage.pageCost(stash,state),
  investReliquary:(a,amount)=>relics.investPower(a.reliquary,a,!!a.ledger[pack.reliquaryConfig.attunement],amount),
  investRelicStash:(a,amount)=>relics.investStorage(a.reliquary,a,a.features.has(pack.reliquaryFeature),amount),
 });
 return {content,context,sdk:new UnlockLifecycle(context)};
}
function entry(sdk,a,row,view){return {
 id:row.id,kind:row.kind,cost:row.cost,owned:sdk.isUnlockOwned(a,row),visible:sdk.isUnlockVisible(a,row),
 completed:sdk.unlockCompleted(a,row),invested:sdk.investedToward(a,row),remaining:sdk.remainingCost(a,row),
 lines:sdk.sealedGateLines(a,row),progress:sdk.classUnlockProgress(a,row,view),rumor:row.kind==='class'?sdk.classRumorRead(a,row):undefined,
};}
for(const original of policy.observations){
 const {sdk,context}=runtime(original),a=account(original.before),view=decode(original.view??null)??undefined,before=snapshot(a);
 const result={name:original.name,before,view,legacyGemBundles:original.legacyGemBundles,showDebugCodex:original.showDebugCodex,proseRevealFrac:original.proseRevealFrac,
  staticRows:context.catalog.map(row=>entry(sdk,a,row,view)),
  dynamicRows:sdk.allUnlockables(a).filter(row=>!context.catalog.includes(row)).map(row=>entry(sdk,a,row,view)),
  available:sdk.availableUnlocks(a).map(row=>row.id),sealed:sdk.sealedUnlocks(a).map(({u,lines})=>({id:u.id,lines})),
  shrouded:sdk.shroudedClassUnlocks(a).map(row=>row.id),pending:sdk.pendingClassUnlocks(a).map(row=>row.id),
  packages:sdk.lockedPackages(a),shelves:sdk.vaultShelfCensus(a),strip:sdk.vaultStripVisible(a)};
 assert.deepEqual(clean(result),original,original.name);assert.deepEqual(snapshot(a),before);
}
const {sdk:base,context}=runtime();
assert.deepEqual(clean(context.catalog),policy.definitions);
assert.deepEqual(clean(base.allUnlockables().filter(row=>row.kind==='package')),policy.packageRows);
assert.deepEqual(base.classObjectiveNeeds(),policy.objectives);assert.deepEqual(base.classObjectiveKeys(),policy.objectiveKeys);
assert.deepEqual(base.catalogLevelMilestones(),policy.levels);assert.equal(base.catalogLevelMilestones(),base.catalogLevelMilestones());
for(const row of policy.milestones){assert.deepEqual(base.catalogClassLevelMilestones(row.id),row.levels);assert.equal(base.catalogClassLevelMilestones(row.id),base.catalogClassLevelMilestones(row.id));}
assert.deepEqual(base.vaultKindOrder(),policy.kindOrder);
for(const row of policy.seats)assert.deepEqual(clean(base.vaultSeatOf(row.kind)),row.seat);
for(const row of policy.classLookup){const found=base.classUnlockFor(row.id);assert.equal(found?.id??null,row.unlock);assert.equal(found?context.catalog.includes(found):null,row.borrowed);}
let steps=0;
function runSteps(sdk,a,definition,expected,amount,roll){
 let draws=0;const random=()=>{draws++;return decode(roll);};
 const sequence=()=>definition.kind==='memory'?(a.memoryReceipts[definition.payload.memoryUnlockId]?.sequence??0):0;
 const read=prior=>({state:snapshot(a),owned:sdk.isUnlockOwned(a,definition),visible:sdk.isUnlockVisible(a,definition),
  completed:sdk.unlockCompleted(a,definition,prior),investment:sdk.investedToward(a,definition),remaining:sdk.remainingCost(a,definition),draws});
 for(const target of expected){
  const prior=sequence(),before=read(prior);let result,error;
  try{result=target.name==='apply'?sdk.applyUnlock(a,definition,random):sdk.investUnlock(a,definition,decode(amount),random);}
  catch(cause){error={name:cause.name,message:cause.message};}
  const actual=clean({name:target.name,before,result,error,after:read(prior)});
  assert.deepEqual(actual,target,definition.id+' '+target.name);steps++;
 }
}
for(const row of transactions.traces){
 const {sdk}=runtime({legacyGemBundles:row.legacy}),a=account(row.steps[0].before.state);
 runSteps(sdk,a,row.definition,row.steps,row.requestedAmount,row.randomValue);
}
for(const row of transactions.masterySteps){
 // Reconstruct each recorded authoritative state, then execute the next actual operation.
 const {sdk}=runtime();
 for(const target of [row.partial,row.finish,row.repeat]){
  const a=account(target.before.state),definition=row.definition,amount=target.name==='partial'?Math.max(0,definition.cost-1):undefined;
  const renamed={...target,name:target.name==='partial'?'invest':'apply'};
  runSteps(sdk,a,definition,[renamed],amount,.375);
 }
}
console.log(JSON.stringify({passed:true,policyProfiles:policy.observations.length,purchaseTraces:transactions.traces.length,masteryRungs:transactions.masterySteps.length,steps,
 contentId:pack.contentId,gameImports:0}));
