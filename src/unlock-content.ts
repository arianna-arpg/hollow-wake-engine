
import {copy,freeze,integer,finite} from './validation.js';
import {ProgressionGateContent} from './progression-gate-content.js';
import {isClassUnlocked,unlockedClassCount} from './character-identity.js';
import {RuneScript,type RuneLetter} from './rune-script.js';
import {validateUnlockPredicate,testUnlockPredicate,type UnlockPredicate} from './unlock-predicates.js';
import {MemoryRewardContent} from './memory-reward-content.js';
import * as memory from './memory-rewards.js';
import type {UnlockAccount,UnlockContext,Unlockable,UnlockKind,VaultTabDef,UnlockPackage} from './unlock-lifecycle.js';

export interface UnlockPackageData {
  readonly id:string;readonly label:string;readonly blurb:string;readonly cost:number;
  readonly alwaysOn?:boolean;readonly pressureless?:boolean;readonly defaultEnabled:boolean;
  readonly unlock:{readonly id:string;readonly label:string;readonly predicate:UnlockPredicate};
  readonly tiers:readonly {readonly id:string;readonly label:string;readonly requirement:string;readonly cost:number;readonly predicate:UnlockPredicate}[];
}
export interface UnlockPack {
  readonly schemaVersion:1;readonly capability:'unlock-lifecycle/v1';readonly contentId:string;
  readonly dependencies:{readonly gates:string;readonly memories:string};
  readonly keys:{readonly classPrefix:string;readonly resurrectPrefix:string};
  readonly catalog:readonly Unlockable[];
  readonly classBundles:readonly {readonly classId:string;readonly skillIds:readonly string[];readonly supportIds:readonly string[]}[];
  readonly classes:readonly {readonly id:string;readonly name:string}[];
  readonly starterSkills:readonly string[];
  readonly slotTiers:readonly {readonly id:string;readonly slots:number;readonly cost:number}[];
  readonly tabs:readonly VaultTabDef[];
  readonly kindLabels:Readonly<Record<UnlockKind,string>>;
  readonly shelfConfig:{readonly stripMinShelves:number;readonly stripMinOwned:number;readonly stripMinStock:number};
  readonly investConfig:{readonly baseRate:number;readonly accel:number;readonly maxRate:number;readonly tickMs:number;readonly tapAmount:number;readonly holdDelayMs:number};
  readonly classWeb:{readonly revealFrac:number;readonly proseRevealFrac:number;readonly unknownRumor:string;readonly sweepSec:number};
  readonly memoryConfig:{readonly legacyGemBundles:boolean;readonly showDebugCodex:boolean};
  readonly reliquaryFeature:string;
  readonly reliquaryConfig:{readonly maxRank:number;readonly attunement:string;readonly costBase:number;readonly powerPerRank:number;readonly xpPenaltyPerCell:number};
  readonly relicStash:{readonly id:string;readonly board:{readonly w:number;readonly h:number};readonly initialPages:number;readonly maxPages:number;readonly pageCostBase:number};
  readonly commissionNeed:number;readonly awakeningRefusal:string;
  readonly alphabet:readonly RuneLetter[];readonly packages:readonly UnlockPackageData[];
}
export type ImmutableUnlock<T> = T extends readonly (infer E)[] ? readonly ImmutableUnlock<E>[] :
  T extends object ? {readonly [K in keyof T]:ImmutableUnlock<T[K]>} : T;
export type UnlockRelicServices<A extends UnlockAccount> = Pick<UnlockContext<A>,
 'reliquaryCost'|'reliquaryPower'|'stashPageCost'|'investReliquary'|'investRelicStash'>;
const kinds:readonly UnlockKind[]=['power','storage','slot','class','classtier','skill','support','memory','feature','package','graft','resurrect'];
function text(value:unknown,label:string,empty=false):asserts value is string{
 if(typeof value!=='string'||(!empty&&!value))throw new Error('Invalid '+label);
}
function object(value:unknown,label:string):asserts value is Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid '+label);
}
function fields(value:object,allowed:readonly string[],label:string):void{
 if(Object.keys(value).some(key=>!allowed.includes(key)))throw new Error('Unknown '+label+' field');
}
function bool(value:unknown,label:string):void{if(typeof value!=='boolean')throw new Error('Invalid '+label);}
function ids(values:readonly string[],known:Set<string>|undefined,label:string):void{
 if(!Array.isArray(values))throw new Error('Invalid '+label);
 for(const id of values){text(id,label);if(known&&!known.has(id))throw new Error('Unknown '+label+' '+id);}
}
function references(value:string|readonly string[]|undefined,known:Set<string>|undefined,label:string):void{
 if(value!==undefined)ids(typeof value==='string'?[value]:value,known,label);
}
function unique<T extends object>(rows:readonly T[],key:(row:T)=>string,label:string):Set<string>{
 if(!Array.isArray(rows))throw new Error('Invalid '+label);
 const selected:readonly T[]=rows;
 const seen=new Set<string>();for(const row of selected){object(row,label);const id=key(row);text(id,label);if(seen.has(id))throw new Error('Duplicate '+label+' '+id);seen.add(id);}return seen;
}
/** Owns validated data and lookup indexes once. Live account state remains caller-owned.
 * Runtime context definitions are borrowed read-only. The compatibility context keeps
 * the existing structural types, and mutation of these frozen definitions throws. */
export class UnlockContent {
 readonly pack:ImmutableUnlock<UnlockPack>;
 readonly runes:RuneScript;
 readonly #data:UnlockPack;
 readonly #catalog=new Map<string,Unlockable>();
 readonly #packages=new Map<string,UnlockPackageData>();
 readonly #gates:ProgressionGateContent;
 readonly #memories:MemoryRewardContent;
 constructor(input:UnlockPack,dependencies:{gates:ProgressionGateContent;memories:MemoryRewardContent}){
  if(input?.schemaVersion!==1||input.capability!=='unlock-lifecycle/v1')throw new Error('Unsupported unlock content');
  const data=copy(input);object(data,'unlock pack');text(data.contentId,'content ID');
  fields(data,['schemaVersion','capability','contentId','dependencies','keys','catalog','classBundles','classes','starterSkills','slotTiers','tabs','kindLabels','shelfConfig','investConfig','classWeb','memoryConfig','reliquaryFeature','reliquaryConfig','relicStash','commissionNeed','awakeningRefusal','alphabet','packages'],'unlock pack');
  if(data.dependencies?.gates!==dependencies.gates.pack.contentId||data.dependencies?.memories!==dependencies.memories.pack.contentId)throw new Error('Unlock content dependencies do not match');
  fields(data.dependencies,['gates','memories'],'dependencies');object(data.keys,'keys');fields(data.keys,['classPrefix','resurrectPrefix'],'keys');
  text(data.keys.classPrefix,'class prefix');text(data.keys.resurrectPrefix,'resurrection prefix');
  const classes=unique(data.classes,row=>row.id,'class');
  for(const row of data.classes){fields(row,['id','name'],'class');text(row.name,'class name');}
  if(JSON.stringify(data.classes)!==JSON.stringify(dependencies.gates.pack.classes))throw new Error('Unlock and gate class registries differ');
  const skills=new Set(dependencies.memories.pack.skills.map(row=>row.id)),supports=new Set(dependencies.memories.pack.supports.map(row=>row.id));
  ids(data.starterSkills,skills,'starter skill');
  unique(data.classBundles,row=>row.classId,'class bundle');
  for(const row of data.classBundles){
   fields(row,['classId','skillIds','supportIds'],'class bundle');if(!classes.has(row.classId))throw new Error('Unknown bundle class');
   ids(row.skillIds,skills,'bundle skill');ids(row.supportIds,supports,'bundle support');
  }
  const catalog=unique(data.catalog,row=>row.id,'unlock');
  const packageIds=unique(data.packages,row=>row.id,'package'),tierIds=new Set<string>();
  for(const row of data.packages){
   fields(row,['id','label','blurb','cost','alwaysOn','pressureless','defaultEnabled','unlock','tiers'],'package');
   text(row.label,'package label');text(row.blurb,'package description',true);integer(row.cost,0,'Package cost');bool(row.defaultEnabled,'package default');
   if(row.alwaysOn!==undefined)bool(row.alwaysOn,'always-on flag');if(row.pressureless!==undefined)bool(row.pressureless,'pressureless flag');
   object(row.unlock,'package unlock');fields(row.unlock,['id','label','predicate'],'package unlock');text(row.unlock.id,'package requirement ID');text(row.unlock.label,'package requirement label',true);
   validateUnlockPredicate(row.unlock.predicate);
   unique(row.tiers,tier=>tier.id,'package tier');
   for(const tier of row.tiers){
    fields(tier,['id','label','requirement','cost','predicate'],'package tier');
    if(tierIds.has(tier.id)||packageIds.has(tier.id))throw new Error('Ambiguous package ownership ID '+tier.id);
    tierIds.add(tier.id);text(tier.label,'tier label');text(tier.requirement,'tier requirement',true);integer(tier.cost,0,'Tier cost');validateUnlockPredicate(tier.predicate);
   }
   this.#packages.set(row.id,row);
  }
  const common=['id','label','description','cost','reqLevel','requiresUnlock','reqLedger','reqLedgerCounts','reqClasses','reqAnyOf','tease','earned','requiresMemoryCommission','kind','payload'];
  for(const row of data.catalog){
   if(!kinds.includes(row.kind))throw new Error('Unknown unlock kind');
   fields(row,row.kind==='feature'?[...common,'requiresFeature']:common,'unlock');
   text(row.label,'unlock label');text(row.description,'unlock description',true);integer(row.cost,0,'Unlock cost');
   if(row.reqLevel!==undefined)integer(row.reqLevel,0,'Required level');if(row.reqClasses!==undefined)integer(row.reqClasses,0,'Required class count');
   for(const name of ['tease','earned','requiresMemoryCommission'] as const)if(row[name]!==undefined)bool(row[name],name);
   references(row.requiresUnlock,catalog,'prerequisite');references(row.reqLedger,undefined,'ledger key');
   if(row.reqLedgerCounts!==undefined){object(row.reqLedgerCounts,'ledger counts');for(const [key,n]of Object.entries(row.reqLedgerCounts)){text(key,'ledger key');integer(n,0,'Ledger count');}}
   object(row.payload,'unlock payload');
   switch(row.kind){
    case 'power':case 'storage':fields(row.payload,['rank'],'rank');integer(row.payload.rank,1,'Rank');break;
    case 'slot':fields(row.payload,['slotCount'],'slot');integer(row.payload.slotCount,1,'Slot count');break;
    case 'class':
     fields(row.payload,['classId','skillIds','supportIds','hint','rumor'],'class');
     if(!classes.has(row.payload.classId))throw new Error('Unknown unlock class');
     ids(row.payload.skillIds,skills,'class skill');ids(row.payload.supportIds,supports,'class support');
     for(const key of ['hint','rumor'] as const)if(row.payload[key]!==undefined)text(row.payload[key],key,true);break;
    case 'classtier':
     fields(row.payload,['classId','tierId','skillIds'],'class tier');if(!classes.has(row.payload.classId))throw new Error('Unknown mastery class');
     text(row.payload.tierId,'mastery tier');ids(row.payload.skillIds,skills,'mastery skill');break;
    case 'skill':fields(row.payload,['skillIds'],'skill');ids(row.payload.skillIds,skills,'skill');break;
    case 'support':fields(row.payload,['supportIds'],'support');ids(row.payload.supportIds,supports,'support');break;
    case 'memory':fields(row.payload,['memoryUnlockId'],'memory');if(!dependencies.memories.definition(row.payload.memoryUnlockId))throw new Error('Unknown memory reward');break;
    case 'feature':fields(row.payload,['flag'],'feature');text(row.payload.flag,'feature flag');if(row.requiresFeature!==undefined)text(row.requiresFeature,'feature prerequisite');break;
    case 'package':{
     fields(row.payload,['packageId','tierId'],'package');const pkg=this.#packages.get(row.payload.packageId);if(!pkg)throw new Error('Unknown package');
     if(row.payload.tierId!==undefined&&!pkg.tiers.some(t=>t.id===row.payload.tierId))throw new Error('Unknown package tier');break;
    }
    case 'graft':fields(row.payload,[],'graft');break;
    case 'resurrect':fields(row.payload,['charId'],'resurrection');text(row.payload.charId,'character ID');break;
   }
   for(const gate of row.reqAnyOf??[]){
    if(gate.unlock!==undefined&&!catalog.has(gate.unlock))throw new Error('Unknown gate unlock');
    if(gate.classLevel&&!classes.has(gate.classLevel.classId))throw new Error('Unknown gate class');
   }
   this.#catalog.set(row.id,row);
  }
  // Reuse the maintained gate schema rather than maintaining a second validator.
  new ProgressionGateContent({...dependencies.gates.pack,requirements:data.catalog.map(row=>({id:row.id,mode:'any',rows:row.reqAnyOf??[]}))});
  const visiting=new Set<string>(),visited=new Set<string>();
  const walk=(id:string):void=>{
   if(visited.has(id))return;if(visiting.has(id))throw new Error('Cyclic unlock prerequisite '+id);
   visiting.add(id);const needs=this.#catalog.get(id)!.requiresUnlock;
   for(const child of needs===undefined?[]:typeof needs==='string'?[needs]:needs)walk(child);
   visiting.delete(id);visited.add(id);
  };
  for(const id of catalog)walk(id);
  unique(data.slotTiers,row=>row.id,'slot tier');for(const row of data.slotTiers){
   fields(row,['id','slots','cost'],'slot tier');integer(row.slots,1,'Slots');integer(row.cost,0,'Slot price');
   const definition=this.#catalog.get(row.id);if(definition?.kind!=='slot'||definition.payload.slotCount!==row.slots||definition.cost!==row.cost)throw new Error('Slot tier differs from catalog');
  }
  unique(data.tabs,row=>row.id,'tab');const seated=new Set<UnlockKind>();
  if(data.tabs.filter(t=>t.owned).length!==1||data.tabs.filter(t=>t.fallback).length!==1)throw new Error('Unlock shelves require one owned and one fallback tab');
  for(const tab of data.tabs){
   fields(tab,['id','label','blurb','kinds','rumors','owned','fallback','emptyNote'],'tab');text(tab.label,'tab label');text(tab.blurb,'tab description',true);
   if(tab.emptyNote!==undefined)text(tab.emptyNote,'empty shelf text',true);
   for(const key of ['rumors','owned','fallback'] as const)if(tab[key]!==undefined)bool(tab[key],key);
   if(tab.owned&&(tab.kinds?.length||tab.fallback||tab.rumors))throw new Error('Owned shelf cannot be a browse shelf');
   for(const kind of tab.kinds??[]){if(!kinds.includes(kind)||seated.has(kind))throw new Error('Invalid or duplicate shelf kind');seated.add(kind);}
  }
  object(data.kindLabels,'kind labels');fields(data.kindLabels,kinds,'kind label');for(const kind of kinds)text(data.kindLabels[kind],'kind label');
  object(data.shelfConfig,'shelf config');fields(data.shelfConfig,['stripMinShelves','stripMinOwned','stripMinStock'],'shelf config');
  for(const key of ['stripMinShelves','stripMinOwned','stripMinStock'] as const)integer(data.shelfConfig[key],0,'Shelf threshold');
  object(data.investConfig,'investment config');fields(data.investConfig,['baseRate','accel','maxRate','tickMs','tapAmount','holdDelayMs'],'investment config');
  for(const key of ['baseRate','accel','maxRate','tickMs','tapAmount','holdDelayMs'] as const)if(finite(data.investConfig[key],key)<0)throw new Error('Negative investment tuning');
  object(data.classWeb,'class web');fields(data.classWeb,['revealFrac','proseRevealFrac','unknownRumor','sweepSec'],'class web');
  for(const key of ['revealFrac','proseRevealFrac','sweepSec'] as const)if(finite(data.classWeb[key],key)<0)throw new Error('Negative class web tuning');
  text(data.classWeb.unknownRumor,'unknown rumor',true);object(data.memoryConfig,'memory config');fields(data.memoryConfig,['legacyGemBundles','showDebugCodex'],'memory config');
  bool(data.memoryConfig.legacyGemBundles,'legacy gem bundles');bool(data.memoryConfig.showDebugCodex,'debug codex');
  text(data.reliquaryFeature,'reliquary feature');object(data.reliquaryConfig,'reliquary config');fields(data.reliquaryConfig,['maxRank','attunement','costBase','powerPerRank','xpPenaltyPerCell'],'reliquary config');
  const relic=data.reliquaryConfig;integer(relic.maxRank,0,'Maximum relic rank');text(relic.attunement,'attunement');
  if(finite(relic.costBase,'Relic base cost')<=0||relic.costBase*(relic.maxRank+1)**2>Number.MAX_SAFE_INTEGER)throw new Error('Unsafe relic costs');
  for(const key of ['powerPerRank','xpPenaltyPerCell'] as const)if(finite(relic[key],key)<0)throw new Error('Negative relic factor');
  object(data.relicStash,'relic stash');fields(data.relicStash,['id','board','initialPages','maxPages','pageCostBase'],'relic stash');
  const stash=data.relicStash;text(stash.id,'stash ID');object(stash.board,'stash board');fields(stash.board,['w','h'],'stash board');
  integer(stash.board.w,1,'Stash width');integer(stash.board.h,1,'Stash height');integer(stash.initialPages,1,'Initial stash pages');integer(stash.maxPages,stash.initialPages,'Maximum stash pages');
  if(stash.maxPages>256||finite(stash.pageCostBase,'Page cost')<0||stash.pageCostBase*(stash.maxPages-stash.initialPages+1)**2>Number.MAX_SAFE_INTEGER)throw new Error('Unsafe stash costs');
  integer(data.commissionNeed,0,'Commission threshold');text(data.awakeningRefusal,'awakening message',true);
  this.runes=new RuneScript(data.alphabet);this.#data=freeze(data);this.pack=this.#data;
  this.#gates=dependencies.gates;this.#memories=dependencies.memories;Object.freeze(this);
 }
 definition(id:string):ImmutableUnlock<Unlockable>|undefined{return this.#catalog.get(id);}
 context<A extends UnlockAccount & memory.MemoryAccount>(services:UnlockRelicServices<A>):UnlockContext<A>{
  for(const name of ['reliquaryCost','reliquaryPower','stashPageCost','investReliquary','investRelicStash'] as const)
   if(typeof services[name]!=='function')throw new Error('Missing relic service '+name);
  const data=this.#data,memories=this.#memories;
  const packages:readonly UnlockPackage<A>[]=Object.freeze(data.packages.map(row=>Object.freeze({
   id:row.id,label:row.label,blurb:row.blurb,cost:row.cost,alwaysOn:row.alwaysOn,pressureless:row.pressureless,defaultEnabled:row.defaultEnabled,
   unlock:Object.freeze({label:row.unlock.label,test:(input:{account:A;ledger:Readonly<Record<string,number>>})=>testUnlockPredicate(row.unlock.predicate,input)}),
   tiers:Object.freeze(row.tiers.map(tier=>Object.freeze({id:tier.id,label:tier.label,requirement:tier.requirement,cost:tier.cost,
    test:(input:{account:A;ledger:Readonly<Record<string,number>>})=>testUnlockPredicate(tier.predicate,input)}))),
  })));
  const packageIndex=new Map(packages.map(row=>[row.id,row]));
  return Object.freeze({
   catalog:data.catalog,unlock:(id:string)=>this.#catalog.get(id),slotTiers:data.slotTiers,classBundles:data.classBundles,starterSkills:data.starterSkills,
   memoryConfig:data.memoryConfig,memoryDefinitions:memories.pack.definitions,classWeb:data.classWeb,gates:this.#gates.context,
   reliquaryFeature:data.reliquaryFeature,reliquaryConfig:data.reliquaryConfig,relicStash:data.relicStash,tabs:data.tabs,shelfConfig:data.shelfConfig,commissionNeed:data.commissionNeed,
   packages:()=>packages,package:(id:string)=>packageIndex.get(id),classBundleId:(id:string)=>data.keys.classPrefix+id,resurrectUnlockId:(id:string)=>data.keys.resurrectPrefix+id,
   isClassUnlocked,unlockedClassCount:(account:A)=>unlockedClassCount(data.classes,account),
   encipher:(value:string)=>this.runes.encipher(value),revealScript:(value:string,fraction:number)=>this.runes.reveal(value,fraction),awakeningRefusal:()=>data.awakeningRefusal,
   memoryCatalog:()=>memories.catalogue(),
   memoryCommissionReady:(account:A,kind:memory.MemoryKind,id:string,need:number)=>memory.memoryCommissionReady(account,kind,id,need,memories),
   memoryProgressionOpen:(account:A)=>memory.memoryProgressionOpen(account,memories),
   memoryUnlockDef:(id:string)=>memories.definition(id),
   memoryUnlockCandidates:(account:A,definition:memory.MemoryRewardDefinition)=>memory.memoryUnlockCandidates(account,definition,memories),
   grantMemoryUnlock:(account:A,definition:memory.MemoryRewardDefinition,random:()=>number)=>memory.grantMemoryUnlock(account,definition,random,memories),
   reliquaryCost:services.reliquaryCost.bind(services),reliquaryPower:services.reliquaryPower.bind(services),stashPageCost:services.stashPageCost.bind(services),
   investReliquary:services.investReliquary.bind(services),investRelicStash:services.investRelicStash.bind(services),
  });
 }
}
