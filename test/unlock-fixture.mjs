
import {UnlockLifecycle} from '../dist/unlock-lifecycle.js';
import {MemoryRewardContent} from '../dist/memory-reward-content.js';
import * as memory from '../dist/memory-rewards.js';
export function account(){
 return {level:0,credits:100,ledger:{},invested:{},unlockedSlots:new Set([3]),unlockedClasses:new Set(['starter']),
  pendingClassUnlocks:new Set(),unlockedClassTiers:new Set(),unlockedSkills:new Set(),unlockedSupports:new Set(),
  explicitSkillUnlocks:new Set(),features:new Set(),packageUnlocks:new Set(),memoryReceipts:{},memorySecondary:new Set(),
  skillGraft:false,reliquary:{rank:0,invested:0,stash:{pages:1,invested:0}},roster:[]};
}
export function fixture(){
 const memoryContent=new MemoryRewardContent({schemaVersion:1,capability:'memory-rewards/v1',contentId:'unlock-test',
  keys:{unlockAllFeature:'all',milestonePrefix:'stage_',awakeningStage:2,gemDropPrefix:'drop:'},
  config:{debugCodexBypassesSecondary:true,weighting:'uniform',excluded:[],weightOverrides:{},
   secondary:{mechanics:{tree:true,commission:true,prestige:true},kinds:['skill'],legendaryFinds:true,vault:true}},
  definitions:[{id:'discovery',tier:'discovery',label:'Discover',description:'One memory',cost:10,weights:{skill:1,support:1}}],
  skills:[{id:'a',name:'A'},{id:'b',name:'B'}],supports:[{id:'s',name:'S',weight:10}]});
 const catalog=[],packages=[],calls=[];
 const context={
  catalog,unlock:id=>catalog.find(row=>row.id===id),slotTiers:[{slots:3},{slots:4}],
  classBundles:[],starterSkills:['starter_skill'],memoryConfig:{legacyGemBundles:true,showDebugCodex:true},
  memoryDefinitions:memoryContent.pack.definitions,classWeb:{revealFrac:.5,proseRevealFrac:.8,unknownRumor:'Unknown'},
  gates:{reachedLevelKey:n=>'level_'+n,classLevelLedgerKey:(id,n)=>'class_'+id+'_'+n,
   vocationUnlockKey:id=>'vocation:'+id,questDoneKey:id=>'quest:'+id,
   vocationPrefix:'vocation:',questDonePrefix:'quest:',questsCompletedKey:'quests',className:id=>id},
  reliquaryFeature:'reliquary',reliquaryConfig:{maxRank:5,attunement:'attuned',powerPerRank:.02},
  relicStash:{initialPages:1,maxPages:5,board:{w:4,h:3}},
  tabs:[{id:'browse',label:'Browse',blurb:'Browse',kinds:['class','feature','memory'],rumors:true,fallback:true},
   {id:'owned',label:'Owned',blurb:'Owned',owned:true}],
  shelfConfig:{stripMinShelves:2,stripMinOwned:3,stripMinStock:6},commissionNeed:2,
  packages:()=>packages,package:id=>packages.find(row=>row.id===id),
  classBundleId:id=>'class_'+id,resurrectUnlockId:id=>'resurrect_'+id,
  isClassUnlocked:(a,id)=>a.unlockedClasses.has(id)&&!a.pendingClassUnlocks.has(id),
  unlockedClassCount:a=>[...a.unlockedClasses].filter(id=>!a.pendingClassUnlocks.has(id)).length,
  encipher:text=>'hidden('+text+')',revealScript:(text,fraction)=>fraction>=1?text:'hidden('+text+')',
  awakeningRefusal:()=>'Reach stage 2',memoryCatalog:()=>memory.memoryCatalog(memoryContent),
  memoryCommissionReady:(a,kind,id,need)=>memory.memoryCommissionReady(a,kind,id,need,memoryContent),
  memoryProgressionOpen:a=>memory.memoryProgressionOpen(a,memoryContent),
  memoryUnlockDef:id=>memoryContent.definition(id),
  memoryUnlockCandidates:(a,def)=>memory.memoryUnlockCandidates(a,def,memoryContent),
  grantMemoryUnlock:(a,def,random)=>memory.grantMemoryUnlock(a,def,random,memoryContent),
  reliquaryCost:()=>10,reliquaryPower:r=>r.rank*.02,stashPageCost:()=>10,
  investReliquary:(a,amount)=>{calls.push(['power',amount]);return 0;},
  investRelicStash:(a,amount)=>{calls.push(['storage',amount]);return 0;},
 };
 return {sdk:new UnlockLifecycle(context),context,catalog,packages,calls,memoryContent};
}
export const card=(kind,payload={},extra={})=>({id:'test_'+kind,kind,payload,label:kind,description:kind,cost:10,...extra});
export function snapshot(value){
 return JSON.stringify(value,(_key,item)=>item instanceof Set?[...item]:
  typeof item==='number'&&!Number.isFinite(item)?{number:String(item)}:item);
}
