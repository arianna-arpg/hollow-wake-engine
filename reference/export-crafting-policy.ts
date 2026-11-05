import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine} from '../src/sim/arena';
import {ITEM_AFFIXES} from '../src/data/itemaffixes';
import {ITEM_BASES} from '../src/data/itembases';
import {UNIQUES} from '../src/data/uniques';
import {ITEM_CFG, type ItemInstance, type ItemRarity} from '../src/engine/items';
import {forgeItem} from '../src/engine/itemgen';
import {mulberry32} from '../src/sim/rng';
import {SALVAGE_CFG, SELL_CFG, VENDOR_ITEM_CFG, ESSENCES, ESSENCE_IDS, ESSENCE_OF_RARITY,
  ESSENCE_OF_GEM, oracleRerollCost} from '../src/data/essences';
import {CRAFT_CFG, itemQuality, salvageItemYield, sellItemYield, vendorItemPrice, salvageSkillYield,
  sellSkillYield, salvageSupportYield, sellSupportYield, sellMemoryYield, expertiseRank, expertiseProgress,
  studySalvage, craftableAffixesFor, craftedCount, rollCraftedAffix, rollRerolledAffix, type CraftLore} from '../src/engine/crafting';
import {makeSkillInstance, type SupportInstance} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
bootSimEngine();
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const rngValues=[.25,.75,.375,.625,.125,.875];
const observedRoll=(invoke:(random:()=>number)=>unknown)=>{let draws=0;const result=invoke(()=>rngValues[draws++%rngValues.length]);return {result,draws};};
const mint=(baseId='ring_lapis',rarity:ItemRarity='common',ilvl=1)=>{
  const item=forgeItem({baseId,rarity,ilvl,affixes:[],quality:.5,rng:mulberry32(0x46c001)})!;assert(item);return item;
};
const {cost,...craft}=CRAFT_CFG;
const content={craft,costSource:cost.toString(),costs:Array.from({length:9},(_,rank)=>({rank,cost:cost(rank)})),
  salvage:SALVAGE_CFG,sell:SELL_CFG,vendor:VENDOR_ITEM_CFG,essences:ESSENCES,essenceIds:ESSENCE_IDS,
  gearEssences:ESSENCE_OF_RARITY,gemEssences:ESSENCE_OF_GEM,
  oracleCosts:Object.fromEntries((['common','magic','rare','unique'] as const).map(r=>[r,oracleRerollCost(r)])),socketCaps:ITEM_CFG.sockets.cap};
const gear:unknown[]=[];
for(const rarity of ['common','magic','rare','unique'] as const)for(const ilvl of [1,17,80])for(const baseId of ['ring_lapis','helmet_armor','relic_charm']){
  const item=mint(baseId,rarity,ilvl);
  if(rarity==='unique')item.uniqueId=Object.keys(UNIQUES)[0];
  const candidates=Object.values(ITEM_AFFIXES).filter(d=>d.tiers.length>1).slice(0,3);
  item.affixes=candidates.map((def,index)=>({id:def.id,tier:index?def.tiers.length-1:0,rolls:def.lines.map((_,i)=>(i+1)/(def.lines.length+1)),...(index===2?{crafted:true}:{})}));
  for(const superior of [undefined,0,.8]){
    if(superior===undefined)delete item.superior;else item.superior=superior;
    gear.push(copy({item,quality:itemQuality(item),salvage:salvageItemYield(item),sell:sellItemYield(item),vendor:vendorItemPrice(item),crafted:craftedCount(item)}));
  }
}
const plain=mint();plain.baseRoll=0;assert.equal(itemQuality(plain),1);assert.deepEqual(salvageItemYield(plain),{essence:'coarse',count:1});
plain.baseRoll=1;assert.equal(itemQuality(plain),2.5);assert.equal(salvageItemYield(plain).count,3);
plain.craftedSockets=1;assert.equal(craftedCount(plain),1);
const gem:unknown[]=[];
const skillDef=Object.values(SKILLS)[0],supportDef=Object.values(SUPPORTS)[0];
for(const rarity of ['common','magic','rare','legendary'] as const)for(const level of [1,5,20])for(const granted of [false,true]){
  const skill=makeSkillInstance(skillDef,level,0);skill.rarity=rarity;skill.granted=granted;
  const support={def:supportDef,level} as SupportInstance;
  const row={rarity,level,granted,salvage:salvageSkillYield(skill),sell:sellSkillYield(skill),supportSalvage:salvageSupportYield(support),supportSell:sellSupportYield(support)};
  if(granted){assert.equal(row.salvage,null);assert.equal(row.sell,null);}gem.push(row);
}
const memory=['rough','preformed'].flatMap(kind=>[-1,0,1,7,2.5].map(count=>({kind,count,yield:sellMemoryYield(kind as 'rough'|'preformed',count)})));
const rolls:unknown[]=[],studies:unknown[]=[];
let descending=0,exquisite=0,shared=0,noNormalTiers=0;
for(const def of Object.values(ITEM_AFFIXES)){
  const normal=def.tiers.filter(t=>!t.magicOnly).length,maxRank=Math.min(normal,CRAFT_CFG.stepsPerRank.length);
  if(normal===0)noNormalTiers++;
  if(def.tiers[0].ranges[0][1]<def.tiers.at(-1)!.ranges[0][1])descending++;
  if(def.tiers.some(t=>t.magicOnly))exquisite++;
  if(def.lines.some(l=>l.sharedRoll))shared++;
  for(const rank of [...new Set([1,maxRank])])for(const score of [0,1]){
    const roll=observedRoll(random=>rollCraftedAffix(def,rank,random,score));
    if(normal===0){assert.equal(roll.result,null);assert.equal(roll.draws,0);}
    else{assert(roll.result);const result=roll.result as NonNullable<ReturnType<typeof rollCraftedAffix>>;
      assert.equal(result.crafted,true);assert(!def.tiers[result.tier].magicOnly);assert(result.rolls.every(r=>r>=0&&r<=1));}
    rolls.push({kind:'craft',id:def.id,rank,score,...roll});
  }
  for(const rarity of ['magic','rare'] as const)for(const ilvl of [1,80]){
    const item=mint('ring_lapis',rarity,ilvl),roll=observedRoll(random=>rollRerolledAffix(def,item,random,.6));
    const result=roll.result as ReturnType<typeof rollRerolledAffix>;
    if(result){assert.equal(result.locked,true);assert(def.tiers[result.tier].ilvl<=ilvl);assert(rarity==='magic'||!def.tiers[result.tier].magicOnly);}
    rolls.push({kind:'reroll',id:def.id,rarity,ilvl,score:.6,...roll});
  }
  for(const rank of [...new Set([0,1,maxRank])])for(const crafted of [false,true]){
    const item=mint(),lore:CraftLore=Object.create(null);lore[def.family]={rank,progress:Math.max(0,(CRAFT_CFG.stepsPerRank[rank]??1)-1)};
    item.affixes=[{id:def.id,tier:0,rolls:def.lines.map(()=>.5),crafted}];
    const before=copy(lore),result=studySalvage(lore,item);
    if(crafted||rank>=maxRank)assert.deepEqual(copy(lore),before);
    studies.push({id:def.id,crafted,before,result,after:copy(lore),rank:expertiseRank(lore,def.family),progress:expertiseProgress(lore,def.family)});
  }
}
assert(descending>0&&exquisite>0&&shared>0);
const options:unknown[]=[],lore:CraftLore=Object.create(null);
for(const def of Object.values(ITEM_AFFIXES))lore[def.family]={rank:1,progress:0};
for(const baseId of Object.keys(ITEM_BASES)){
  const item={...plain,baseId,affixes:[]} as ItemInstance;
  const empty=craftableAffixesFor(item,{});assert.equal(empty.length,0);
  const available=craftableAffixesFor(item,lore),before=available.map(row=>[row.def.id,row.rank]);
  if(available.length)item.affixes=[{id:available[0].def.id,tier:0,rolls:available[0].def.lines.map(()=>.5)}];
  const after=craftableAffixesFor(item,lore).map(row=>[row.def.id,row.rank]);
  if(available.length)assert(after.every(([id])=>ITEM_AFFIXES[id as string].family!==available[0].def.family));
  options.push({baseId,before,after});
}
const malformed:unknown[]=[];
const unknown=mint();unknown.affixes=[{id:'missing-crafting-affix',tier:0,rolls:[.5]}];
malformed.push({name:'unknown-affix-skipped',quality:itemQuality(unknown),study:studySalvage({},unknown)});
unknown.uniqueId='missing-crafting-unique';assert.deepEqual(craftableAffixesFor(unknown,lore),[]);
malformed.push({name:'unknown-unique-no-options',options:craftableAffixesFor(unknown,lore)});
unknown.baseId='missing-crafting-base';malformed.push({name:'unknown-base-no-options',options:craftableAffixesFor(unknown,lore)});
const report={content,gear,gem,memory,rolls,studies,options,malformed,census:{affixes:Object.keys(ITEM_AFFIXES).length,bases:Object.keys(ITEM_BASES).length,descending,exquisite,shared,noNormalTiers}};
fs.writeFileSync(process.argv[2],JSON.stringify(report)+'\n');
console.log({gear:gear.length,gem:gem.length,rolls:rolls.length,studies:studies.length,options:options.length,...report.census});
