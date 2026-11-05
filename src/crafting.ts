import {finite} from './validation.js';
import type {AffixRollState,ItemRarity} from './item-types.js';
export interface MaterialAmount {essence:string;count:number}
export interface CraftLoreEntry {rank:number;progress:number}
export type CraftLore=Record<string,CraftLoreEntry>;
export interface CraftingAffix {
  id:string;family:string;kind:'prefix'|'suffix';names:readonly string[];
  tiers:readonly {ilvl:number;magicOnly?:boolean;ranges:readonly (readonly [number,number])[]}[];
  lines:readonly {sharedRoll?:boolean}[];
}
export interface CraftingBase {id:string;category:string}
export interface CraftingItem {
  uid:number;baseId:string;rarity:ItemRarity;tier:number;ilvl:number;baseRoll:number;
  superior?:number;uniqueId?:string;affixes:AffixRollState[];craftedSockets?:number;sockets?:(string|null)[];
  locked?:boolean;questId?:string;relicKey?:string;
  gem?:{kind:'skill';rarity:string;granted?:boolean}|{kind:'support'};
  mem?:readonly unknown[];
}
export interface CraftingSkill {level:number;rarity?:string;granted?:boolean}
export interface CraftingSupport {level:number}
export interface CraftingTuning {
  stepsPerRank:readonly number[];maxCraftedAffixes:number;extraSlotFeature:string;
  socketCost:MaterialAmount;baseWeighting:'inverse'|'uniform';skillLift:number;
}
export interface SalvageTuning {
  base:number;perTier:number;perAffix:number;affixTierQuality:number;affixRollQuality:number;
  exquisiteBonus:number;baseRollQuality:number;superiorBonus:number;uniqueBonus:number;gemBase:number;gemPerLevel:number;
}
export interface SaleTuning {
  mul:number;rarityMul:Readonly<Record<ItemRarity,number>>;gemRarityMul:Readonly<Record<string,number>>;
  supportMul:number;memoryUnit:Readonly<Record<string,number>>;
}
/** Trusted content ports support an existing live authoring host. New consumers
 * should use CraftingContent to validate and own immutable definitions once. */
export interface CraftingRulePorts {
  craft:CraftingTuning;salvage:SalvageTuning;sell:SaleTuning;
  vendor:{markup:number;tierComponent:Readonly<Record<ItemRarity,number>>};
  gearEssences:Readonly<Record<ItemRarity,string>>;gemEssences:Readonly<Record<string,string>>;
  coarseEssence:string;supportEssence:string;essenceIds:readonly string[];ledgerCraftsUnlocked:string;
  affix(id:string):CraftingAffix|undefined;base(id:string):CraftingBase|undefined;hasUnique(id:string):boolean;
  pools(base:CraftingBase):{prefix:readonly CraftingAffix[];suffix:readonly CraftingAffix[]};
  cost(rank:number):MaterialAmount;oracleCost(rarity:ItemRarity):MaterialAmount;socketCap(category:string):number;
}
export interface CraftStudy {family:string;rankedUp:boolean}
/** Pure queries and explicit-RNG rolls; only studySalvage mutates its supplied
 * lore. No item bodies, accounts or random streams are retained. */
export function createCraftingRules(ports:CraftingRulePorts) {
  for(const name of ['affix','base','hasUnique','pools','cost','oracleCost','socketCap'] as const)
    if(typeof ports[name]!=='function')throw new Error('Missing crafting content port '+name);
  const normalTiers=(def:CraftingAffix)=>def.tiers.filter(t=>!t.magicOnly).length;
  const bestUnlockedTier=(def:CraftingAffix,rank:number)=>Math.max(def.tiers.findIndex(t=>!t.magicOnly),def.tiers.length-1-(Math.min(rank,normalTiers(def))-1));
  const tierQuality=(def:CraftingAffix,index:number)=>def.tiers.length<=1?1:1-index/(def.tiers.length-1);
  function itemQuality(item:CraftingItem):number {
    const c=ports.salvage;let q=c.base+c.perTier*(item.tier-1);
    for(const a of item.affixes){const def=ports.affix(a.id);if(!def)continue;
      q+=c.perAffix+c.affixTierQuality*tierQuality(def,a.tier)+c.affixRollQuality*(a.rolls.reduce((sum,r)=>sum+r,0)/Math.max(1,a.rolls.length));
      if(def.tiers[a.tier]?.magicOnly)q+=c.exquisiteBonus;
    }
    if(item.rarity==='common')q+=c.baseRollQuality*item.baseRoll+(item.superior!==undefined?c.superiorBonus:0);
    if(item.uniqueId)q+=c.uniqueBonus;return q;
  }
  const gemQuality=(level:number)=>ports.salvage.gemBase+ports.salvage.gemPerLevel*(level-1);
  const salvageItemYield=(item:CraftingItem):MaterialAmount=>({essence:ports.gearEssences[item.rarity],count:Math.max(1,Math.round(itemQuality(item)))});
  const salvageSkillYield=(skill:CraftingSkill):MaterialAmount|null=>skill.granted?null:{essence:ports.gemEssences[skill.rarity??'common'],count:Math.max(1,Math.round(gemQuality(skill.level)))};
  const salvageSupportYield=(support:CraftingSupport):MaterialAmount=>({essence:ports.supportEssence,count:Math.max(1,Math.round(gemQuality(support.level)))});
  const sellItemYield=(item:CraftingItem):MaterialAmount=>({essence:ports.coarseEssence,count:Math.max(1,Math.round(itemQuality(item)*ports.sell.rarityMul[item.rarity]*ports.sell.mul))});
  const sellSkillYield=(skill:CraftingSkill):MaterialAmount|null=>skill.granted?null:{essence:ports.coarseEssence,count:Math.max(1,Math.round(gemQuality(skill.level)*ports.sell.gemRarityMul[skill.rarity??'common']*ports.sell.mul))};
  const sellSupportYield=(support:CraftingSupport):MaterialAmount=>({essence:ports.coarseEssence,count:Math.max(1,Math.round(gemQuality(support.level)*ports.sell.supportMul*ports.sell.mul))});
  const sellMemoryYield=(kind:string,count:number):MaterialAmount=>({essence:ports.coarseEssence,count:Math.max(1,Math.round(Math.max(0,count)*ports.sell.memoryUnit[kind]*ports.sell.mul))});
  function vendorItemPrice(item:CraftingItem):MaterialAmount[]{
    const result:MaterialAmount[]=[{essence:ports.coarseEssence,count:Math.max(1,Math.round(sellItemYield(item).count*ports.vendor.markup))}];
    const mul=ports.vendor.tierComponent[item.rarity],tint=ports.gearEssences[item.rarity];
    if(mul>0&&tint!==ports.coarseEssence)result.push({essence:tint,count:Math.max(1,Math.ceil(itemQuality(item)*mul))});return result;
  }
  const ownLore=(lore:CraftLore,family:string)=>Object.hasOwn(lore,family)?lore[family]:undefined;
  const expertiseRank=(lore:CraftLore,family:string)=>ownLore(lore,family)?.rank??0;
  const expertiseProgress=(lore:CraftLore,family:string):[number,number]=>{const e=ownLore(lore,family);return [e?.progress??0,ports.craft.stepsPerRank[e?.rank??0]??0];};
  function studySalvage(lore:CraftLore,item:CraftingItem):CraftStudy[]{
    const result:CraftStudy[]=[];
    for(const a of item.affixes){
      if(a.crafted)continue;const def=ports.affix(a.id);if(!def)continue;
      let entry=ownLore(lore,def.family);
      if(!entry){entry={rank:0,progress:0};Object.defineProperty(lore,def.family,{value:entry,writable:true,configurable:true,enumerable:true});}
      if(entry.rank>=Math.min(ports.craft.stepsPerRank.length,normalTiers(def)))continue;
      if(a.tier>bestUnlockedTier(def,entry.rank+1))continue;
      entry.progress++;let rankedUp=false;
      if(entry.progress>=ports.craft.stepsPerRank[entry.rank]){entry.rank++;entry.progress=0;rankedUp=true;}
      result.push({family:def.family,rankedUp});
    }
    return result;
  }
  function craftableAffixesFor(item:CraftingItem,lore:CraftLore):{def:CraftingAffix;rank:number}[]{
    const base=ports.base(item.baseId);if(!base)return [];
    const pools=ports.pools(base),used=new Set(item.affixes.map(a=>ports.affix(a.id)?.family).filter(Boolean));
    if(item.uniqueId&&!ports.hasUnique(item.uniqueId))return [];
    const result:{def:CraftingAffix;rank:number}[]=[];
    for(const pool of [pools.prefix,pools.suffix])for(const def of pool){
      if(used.has(def.family))continue;const rank=expertiseRank(lore,def.family);if(rank>=1)result.push({def,rank});
    }
    return result;
  }
  const craftedCount=(item:CraftingItem)=>item.affixes.filter(a=>a.crafted).length+(item.craftedSockets??0);
  function rollIntoSpan(def:CraftingAffix,best:number,worst:number,random:()=>number,score:number):{tier:number;rolls:number[]}|null {
    if(best<0||worst<0||best>worst)return null;
    finite(score,'Craft score');
    const rng=()=>{const value=finite(random(),'Craft random draw');if(value<0||value>=1)throw new Error('Craft random draw must be in [0,1)');return value;};
    const down=def.tiers[best].ranges[0][1]<def.tiers[worst].ranges[0][1];
    const weak=def.tiers[worst].ranges[0][down?1:0],strong=def.tiers[best].ranges[0][down?0:1];
    const t=ports.craft.baseWeighting==='inverse'?Math.min(rng(),rng()):rng(),s=Math.max(0,Math.min(1,score));
    const value=weak+(strong-weak)*(t+(1-t)*s*ports.craft.skillLift);let tier=worst;
    for(let i=worst;i>=best;i--){const [lo,hi]=def.tiers[i].ranges[0];
      if(value>=lo&&value<=hi){tier=i;break;}if(down?value<lo:value>hi)tier=Math.max(best,i-1);
    }
    const [lo,hi]=def.tiers[tier].ranges[0],fraction=hi>lo?Math.max(0,Math.min(1,(value-lo)/(hi-lo))):.5;
    return {tier,rolls:def.lines.map((line,i)=>i===0||line.sharedRoll?fraction:rng())};
  }
  function rollCraftedAffix(def:CraftingAffix,rank:number,random:()=>number,score=0):AffixRollState|null {
    const landed=rollIntoSpan(def,bestUnlockedTier(def,rank),def.tiers.length-1,random,score);return landed?{id:def.id,...landed,crafted:true}:null;
  }
  function rollRerolledAffix(def:CraftingAffix,item:CraftingItem,random:()=>number,score=0):AffixRollState|null {
    let best=-1,worst=-1;
    for(let i=0;i<def.tiers.length;i++){const tier=def.tiers[i];if(tier.ilvl>item.ilvl)continue;if(tier.magicOnly&&item.rarity!=='magic')continue;if(best<0)best=i;worst=i;}
    if(best<0)return null;const landed=rollIntoSpan(def,best,worst,random,score);return landed?{id:def.id,...landed,locked:true}:null;
  }
  return Object.freeze({ports,itemQuality,salvageItemYield,salvageSkillYield,salvageSupportYield,sellItemYield,sellSkillYield,sellSupportYield,
    sellMemoryYield,vendorItemPrice,expertiseRank,expertiseProgress,studySalvage,craftableAffixesFor,craftedCount,rollCraftedAffix,rollRerolledAffix});
}
export type CraftingRules=ReturnType<typeof createCraftingRules>;
