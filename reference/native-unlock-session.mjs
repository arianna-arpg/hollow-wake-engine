import {UnlockContent} from '@hollow-wake/engine/progression/unlock-content';
import {UnlockLifecycle} from '@hollow-wake/engine/progression/unlocks';
import {ProgressionGateContent} from '@hollow-wake/engine/progression/gate-content';
import {MemoryRewardContent} from '@hollow-wake/engine/progression/memory-content';
import {RelicCustody} from '@hollow-wake/engine/inventory/relics';
import {StashPolicy} from '@hollow-wake/engine/inventory/stash';
import {testUnlockPredicate} from '@hollow-wake/engine/progression/unlock-predicates';

const encode=(_key,value)=>typeof value==='number'&&!Number.isFinite(value)?{number:String(value)}:value;
const clean=value=>JSON.parse(JSON.stringify(value,encode));
const decode=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value),(_key,row)=>row&&typeof row==='object'&&!Array.isArray(row)&&Object.keys(row).length===1&&typeof row.number==='string'?Number(row.number):row);
const sets=['unlockedClasses','pendingClassUnlocks','unlockedClassTiers','unlockedSkills','explicitSkillUnlocks','unlockedSupports','memorySecondary','features','unlockedSlots','packageUnlocks'];
function account(saved){const result=decode(saved);for(const key of sets)result[key]=new Set(result[key]);return result;}
function snapshot(a){return clean({...a,...Object.fromEntries(sets.map(key=>[key,key==='unlockedSlots'?[...a[key]].sort((a,b)=>a-b):[...a[key]]]))});}
const unsupported=()=>{throw new Error('This observation unexpectedly requires an item host');};
function runtime(session,overrides={}){
 const key=JSON.stringify(overrides);let found=session.contexts.get(key);if(found)return found;
 const pack=session.pack,data={...pack,memoryConfig:{...pack.memoryConfig},classWeb:{...pack.classWeb}};
 for(const key of ['legacyGemBundles','showDebugCodex'])if(overrides[key]!==undefined)data.memoryConfig[key]=overrides[key];
 if(overrides.proseRevealFrac!==undefined)data.classWeb.proseRevealFrac=overrides.proseRevealFrac;
 const content=new UnlockContent(data,{gates:session.gates,memories:session.memories});
 const stash={...pack.relicStash,accepts:unsupported};
 const relics=new RelicCustody({isRelic:unsupported,footprint:unsupported,nextUid:unsupported,bumpUidFloor:unsupported,cloneItems:unsupported,
  stash:()=>stash,bagBoard:unsupported,progression:()=>pack.reliquaryConfig});
 const storage=new StashPolicy(unsupported);
 const context=content.context({
  reliquaryCost:state=>relics.cost(state),reliquaryPower:state=>relics.power(state),stashPageCost:state=>storage.pageCost(stash,state),
  investReliquary:(a,amount)=>relics.investPower(a.reliquary,a,!!a.ledger[pack.reliquaryConfig.attunement],amount),
  investRelicStash:(a,amount)=>relics.investStorage(a.reliquary,a,a.features.has(pack.reliquaryFeature),amount),
 });
 found={content,context,sdk:new UnlockLifecycle(context)};session.contexts.set(key,found);return found;
}
function entry(sdk,a,row,view){return {
 id:row.id,kind:row.kind,cost:row.cost,owned:sdk.isUnlockOwned(a,row),visible:sdk.isUnlockVisible(a,row),
 completed:sdk.unlockCompleted(a,row),invested:sdk.investedToward(a,row),remaining:sdk.remainingCost(a,row),
 lines:sdk.sealedGateLines(a,row),progress:sdk.classUnlockProgress(a,row,view),rumor:row.kind==='class'?sdk.classRumorRead(a,row):undefined,
};}
export function create(input){
 const session={pack:input.unlocks,gates:new ProgressionGateContent(input.gates),memories:new MemoryRewardContent(input.memories),contexts:new Map(),predicates:new Map()};
 const {content}=runtime(session);
 for(const row of content.pack.packages){session.predicates.set(row.id+'/base',row.unlock.predicate);for(const tier of row.tiers)session.predicates.set(row.id+'/'+tier.id,tier.predicate);}
 return session;
}
export function dispatch(session,request){
 if(request.op==='predicate'){
  const input=decode(request.input),reads=[];
  const account={get level(){reads.push('account.level');return input.level;}};
  const ledger=new Proxy(input.ledger,{get(target,key,receiver){if(typeof key==='string')reads.push('ledger.'+key);return Reflect.get(target,key,receiver);}});
  const result=testUnlockPredicate(session.predicates.get(request.id),{account,ledger});
  return {result,reads};
 }
 const {sdk,context,content}=runtime(session,request.config);
 if(request.op==='rune')return clean({cipher:content.runes.encipher(request.text),plain:content.runes.decipher(request.cipher),
  reveals:request.fractions.map(fraction=>({fraction,value:content.runes.reveal(request.text,decode(fraction))}))});
 if(request.op==='alphabet')return clean({letters:request.letters.map(letter=>({letter,rune:content.runes.runeOf(letter)})),
  runes:request.runes.map(rune=>({rune,letter:content.runes.runeLetterOf(rune)}))});
 if(request.op==='metadata')return clean({definitions:context.catalog,packageRows:sdk.allUnlockables().filter(row=>row.kind==='package'),
  objectives:sdk.classObjectiveNeeds(),objectiveKeys:sdk.classObjectiveKeys(),levels:sdk.catalogLevelMilestones(),
  levelCache:sdk.catalogLevelMilestones()===sdk.catalogLevelMilestones(),
  milestones:request.classes.map(id=>({id,levels:sdk.catalogClassLevelMilestones(id),reused:sdk.catalogClassLevelMilestones(id)===sdk.catalogClassLevelMilestones(id)})),
  classCaches:request.classes.map(id=>sdk.catalogClassLevelMilestones(id)===sdk.catalogClassLevelMilestones(id)),
  kindOrder:sdk.vaultKindOrder(),seats:request.kinds.map(kind=>({kind,seat:sdk.vaultSeatOf(kind)})),
  classLookup:request.lookups.map(id=>{const found=sdk.classUnlockFor(id);return {id,unlock:found?.id??null,borrowed:found?context.catalog.includes(found):null};})});
 if(request.op==='profile'){
  const a=account(request.before),view=decode(request.view??null)??undefined;
  const result={name:request.name,before:snapshot(a),view,...request.config,
   staticRows:context.catalog.map(row=>entry(sdk,a,row,view)),
   dynamicRows:sdk.allUnlockables(a).filter(row=>!context.catalog.includes(row)).map(row=>entry(sdk,a,row,view)),
   available:sdk.availableUnlocks(a).map(row=>row.id),sealed:sdk.sealedUnlocks(a).map(({u,lines})=>({id:u.id,lines})),
   shrouded:sdk.shroudedClassUnlocks(a).map(row=>row.id),pending:sdk.pendingClassUnlocks(a).map(row=>row.id),
   packages:sdk.lockedPackages(a),shelves:sdk.vaultShelfCensus(a),strip:sdk.vaultStripVisible(a)};
  return clean({result,after:snapshot(a)});
 }
 if(request.op==='purchase'){
  const a=account(request.before),definition=decode(request.definition);let draws=0;
  const random=()=>{draws++;return decode(request.roll);};
  const sequence=()=>definition.kind==='memory'?(a.memoryReceipts[definition.payload.memoryUnlockId]?.sequence??0):0;
  const read=prior=>({state:snapshot(a),owned:sdk.isUnlockOwned(a,definition),visible:sdk.isUnlockVisible(a,definition),
   completed:sdk.unlockCompleted(a,definition,prior),investment:sdk.investedToward(a,definition),remaining:sdk.remainingCost(a,definition),draws});
  return clean(request.actions.map(action=>{
   const prior=sequence(),before=read(prior);let result,error;
   try{result=action.name==='apply'?sdk.applyUnlock(a,definition,random):sdk.investUnlock(a,definition,decode(action.amount),random);}
   catch(cause){error={name:cause.name,message:cause.message};}
   return {name:action.name,before,result,error,after:read(prior)};
  }));
 }
 throw new Error('Unknown unlock test request');
}
