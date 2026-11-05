import {ItemContent} from './item-rules.js';
import {itemOperations} from './item-core.js';
import {copy,freeze,integer,finite} from './validation.js';
import {createCraftingRules,type CraftingRules,type CraftingTuning,type SalvageTuning,type SaleTuning,type MaterialAmount} from './crafting.js';
import type {ItemRarity} from './item-types.js';

export interface CraftingPack {
  schemaVersion:1;capability:'crafting/v1';contentId:string;itemContentId:string;
  craft:CraftingTuning&{
    smith:{duration:number;sweepPeriod:number;sweetWidth:number;passiveRate:number;clickBoost:number;missPenalty:number};
    runes:{count:number;perRuneTime:number;hitRadius:number;speedWeight:number};
  };
  salvage:SalvageTuning&{stationRadius:number;stationDwell:number};
  sell:SaleTuning;
  vendor:{slots:number;markup:number;tierComponent:Record<ItemRarity,number>;rarityWeights:Partial<Record<ItemRarity,number>>;ilvlJitter:number};
  rankCosts:{first:MaterialAmount;second:MaterialAmount;higher:MaterialAmount};
  oracleCosts:Record<ItemRarity,MaterialAmount>;
  gearEssences:Record<ItemRarity,string>;gemEssences:Record<string,string>;
  essences:{id:string;label:string;color:string;glyph:string;mortalWorth:number}[];
  coarseEssence:string;supportEssence:string;ledgerCraftsUnlocked:string;
}
const rarities=['common','magic','rare','unique'] as const;
function record(value:unknown):asserts value is Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Expected crafting record');}
function fields(value:unknown,names:readonly string[]):asserts value is Record<string,unknown>{record(value);if(Object.keys(value).some(key=>!names.includes(key)))throw new Error('Unknown crafting content field');for(const name of names)if(!Object.hasOwn(value,name))throw new Error('Missing crafting field '+name);}
function id(value:unknown):asserts value is string{if(typeof value!=='string'||!value.length)throw new Error('Expected crafting identifier');}
function nonnegative(value:number){finite(value,'Crafting tuning');if(value<0)throw new Error('Crafting tuning must be nonnegative');}
function unit(value:number){nonnegative(value);if(value>1)throw new Error('Crafting fraction exceeds one');}
function values(value:unknown,keys:readonly string[]){fields(value,keys);for(const key of keys)nonnegative(value[key] as number);}

/** Owns only crafting tuning and derived pools. The already immutable item
 * catalogue is shared by reference; it is never copied per character or action. */
export class CraftingContent {
  readonly pack:CraftingPack;
  readonly items:ItemContent;
  readonly rules:CraftingRules;
  constructor(input:CraftingPack,items:ItemContent){
    if(!(items instanceof ItemContent))throw new Error('Crafting requires validated ItemContent');
    const pack=copy(input);
    fields(pack,['schemaVersion','capability','contentId','itemContentId','craft','salvage','sell','vendor','rankCosts','oracleCosts','gearEssences','gemEssences','essences','coarseEssence','supportEssence','ledgerCraftsUnlocked']);
    if(pack.schemaVersion!==1||pack.capability!=='crafting/v1')throw new Error('Unsupported crafting content');
    id(pack.contentId);if(pack.itemContentId!==items.id)throw new Error('Crafting item content mismatch');
    id(pack.ledgerCraftsUnlocked);
    if(!Array.isArray(pack.essences)||!pack.essences.length)throw new Error('Missing crafting essences');
    const essenceIds=new Set<string>();
    for(const essence of pack.essences){fields(essence,['id','label','color','glyph','mortalWorth']);id(essence.id);
      if(essenceIds.has(essence.id))throw new Error('Duplicate crafting essence');essenceIds.add(essence.id);
      for(const key of ['label','color','glyph'] as const)id(essence[key]);integer(essence.mortalWorth,1,'Essence worth');
    }
    const essence=(value:unknown)=>{id(value);if(!essenceIds.has(value))throw new Error('Unknown crafting essence '+value);};
    const amount=(value:MaterialAmount)=>{fields(value,['essence','count']);essence(value.essence);integer(value.count,0,'Material count');};
    essence(pack.coarseEssence);essence(pack.supportEssence);
    fields(pack.gearEssences,rarities);for(const value of Object.values(pack.gearEssences))essence(value);
    record(pack.gemEssences);if(!Object.hasOwn(pack.gemEssences,'common'))throw new Error('Missing default gem essence');
    for(const [key,value]of Object.entries(pack.gemEssences)){id(key);essence(value);}
    fields(pack.craft,['stepsPerRank','maxCraftedAffixes','extraSlotFeature','socketCost','baseWeighting','skillLift','smith','runes']);
    const c=pack.craft;if(!Array.isArray(c.stepsPerRank)||!c.stepsPerRank.length)throw new Error('Missing expertise steps');
    for(const value of c.stepsPerRank)integer(value,1,'Expertise step');integer(c.maxCraftedAffixes,0,'Crafted capacity');id(c.extraSlotFeature);
    amount(c.socketCost);if(c.baseWeighting!=='inverse'&&c.baseWeighting!=='uniform')throw new Error('Unknown crafting weighting');unit(c.skillLift);
    values(c.smith,['duration','sweepPeriod','sweetWidth','passiveRate','clickBoost','missPenalty']);
    if(c.smith.duration===0||c.smith.sweepPeriod===0)throw new Error('Craft timing must be positive');unit(c.smith.sweetWidth);
    values(c.runes,['count','perRuneTime','hitRadius','speedWeight']);integer(c.runes.count,1,'Rune count');
    if(c.runes.perRuneTime===0||c.runes.hitRadius===0)throw new Error('Rune timing and radius must be positive');unit(c.runes.speedWeight);
    values(pack.salvage,['stationRadius','stationDwell','base','perTier','perAffix','affixTierQuality','affixRollQuality','exquisiteBonus','baseRollQuality','superiorBonus','uniqueBonus','gemBase','gemPerLevel']);
    fields(pack.sell,['mul','rarityMul','gemRarityMul','supportMul','memoryUnit']);nonnegative(pack.sell.mul);nonnegative(pack.sell.supportMul);
    values(pack.sell.rarityMul,rarities);values(pack.sell.gemRarityMul,Object.keys(pack.gemEssences));
    record(pack.sell.memoryUnit);if(!Object.hasOwn(pack.sell.memoryUnit,'rough'))throw new Error('Missing default memory price');
    for(const [key,value]of Object.entries(pack.sell.memoryUnit)){id(key);nonnegative(value);}
    fields(pack.vendor,['slots','markup','tierComponent','rarityWeights','ilvlJitter']);integer(pack.vendor.slots,0,'Vendor slots');
    nonnegative(pack.vendor.markup);nonnegative(pack.vendor.ilvlJitter);values(pack.vendor.tierComponent,rarities);record(pack.vendor.rarityWeights);
    for(const [key,value]of Object.entries(pack.vendor.rarityWeights)){if(!rarities.includes(key as ItemRarity))throw new Error('Unknown vendor rarity');nonnegative(value);}
    fields(pack.rankCosts,['first','second','higher']);Object.values(pack.rankCosts).forEach(amount);
    fields(pack.oracleCosts,rarities);Object.values(pack.oracleCosts).forEach(amount);
    for(const dictionary of [pack.gearEssences,pack.gemEssences,pack.sell.rarityMul,pack.sell.gemRarityMul,pack.sell.memoryUnit,pack.vendor.tierComponent,pack.vendor.rarityWeights,pack.oracleCosts])Object.setPrototypeOf(dictionary,null);
    this.pack=freeze(pack);this.items=items;
    const pools=itemOperations(items.pack,()=>{throw new Error('Crafting content does not allocate item identities');});
    this.rules=createCraftingRules(Object.freeze({
      craft:pack.craft,salvage:pack.salvage,sell:pack.sell,vendor:pack.vendor,gearEssences:pack.gearEssences,gemEssences:pack.gemEssences,
      coarseEssence:pack.coarseEssence,supportEssence:pack.supportEssence,essenceIds:Object.freeze([...essenceIds]),ledgerCraftsUnlocked:pack.ledgerCraftsUnlocked,
      affix:(key:string)=>items.pack.affixes[key],base:(key:string)=>items.pack.bases[key],hasUnique:(key:string)=>Object.hasOwn(items.pack.uniques,key),
      pools:(base:{id:string})=>{const definition=items.pack.bases[base.id];if(!definition)throw new Error('Unknown crafting base '+base.id);
        const pool=pools.affixPoolsFor(definition);Object.freeze(pool.prefix);Object.freeze(pool.suffix);return Object.freeze(pool);},
      cost:(rank:number)=>({...pack.rankCosts[rank<=1?'first':rank===2?'second':'higher']}),
      oracleCost:(rarity:ItemRarity)=>({...pack.oracleCosts[rarity]}),socketCap:(category:string)=>Object.hasOwn(items.pack.config.sockets.cap,category)?items.pack.config.sockets.cap[category]??0:0,
    }));
    Object.freeze(this);
  }
}
