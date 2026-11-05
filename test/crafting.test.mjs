import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ItemContent} from '../dist/item-rules.js';
import {CraftingContent} from '../dist/crafting-content.js';
import {itemPack} from '../scripts/compile-item-content.mjs';
import {craftingPack,readCraftingFixture} from '../scripts/compile-crafting-content.mjs';
const items=new ItemContent(itemPack()),pack=craftingPack(items),content=new CraftingContent(pack,items),rules=content.rules;
const raw=readCraftingFixture('policy'),copy=value=>JSON.parse(JSON.stringify(value));
const plain=()=>({uid:1,baseId:'ring_lapis',rarity:'common',ilvl:1,tier:1,baseRoll:.5,affixes:[]});
test('crafting prices match all original gear, gem and memory observations',()=>{
 for(const row of raw.gear){assert.equal(rules.itemQuality(row.item),row.quality);assert.deepEqual(rules.salvageItemYield(row.item),row.salvage);
  assert.deepEqual(rules.sellItemYield(row.item),row.sell);assert.deepEqual(rules.vendorItemPrice(row.item),row.vendor);assert.equal(rules.craftedCount(row.item),row.crafted);}
 for(const row of raw.gem){assert.deepEqual(rules.salvageSkillYield(row),row.salvage);assert.deepEqual(rules.sellSkillYield(row),row.sell);
  assert.deepEqual(rules.salvageSupportYield(row),row.supportSalvage);assert.deepEqual(rules.sellSupportYield(row),row.supportSell);}
 for(const row of raw.memory)assert.deepEqual(rules.sellMemoryYield(row.kind,row.count),row.yield);
});
test('every original crafting and reroll result preserves numeric values and draw counts',()=>{
 const values=[.25,.75,.375,.625,.125,.875];
 for(const row of raw.rolls){let draws=0;const rng=()=>values[draws++%values.length],def=items.pack.affixes[row.id];
  const result=row.kind==='craft'?rules.rollCraftedAffix(def,row.rank,rng,row.score):rules.rollRerolledAffix(def,{...plain(),rarity:row.rarity,ilvl:row.ilvl},rng,row.score);
  assert.deepEqual(result,row.result,row.id);assert.equal(draws,row.draws,row.id);}
});
test('every original lore transition and ordered base eligibility list matches',()=>{
 for(const row of raw.studies){const def=items.pack.affixes[row.id],lore=copy(row.before),item={...plain(),affixes:[{id:row.id,tier:0,rolls:def.lines.map(()=>.5),crafted:row.crafted}]};
  assert.deepEqual(rules.studySalvage(lore,item),row.result,row.id);assert.deepEqual(lore,row.after,row.id);
  assert.equal(rules.expertiseRank(lore,def.family),row.rank);assert.deepEqual(rules.expertiseProgress(lore,def.family),row.progress);}
 const lore=Object.fromEntries(Object.values(items.pack.affixes).map(def=>[def.family,{rank:1,progress:0}]));
 for(const row of raw.options){const item={...plain(),baseId:row.baseId};assert.deepEqual(rules.craftableAffixesFor(item,{}),[]);
  const before=rules.craftableAffixesFor(item,lore);assert.deepEqual(before.map(r=>[r.def.id,r.rank]),row.before,row.baseId);
  if(before.length)item.affixes=[{id:before[0].def.id,tier:0,rolls:before[0].def.lines.map(()=>.5)}];
  assert.deepEqual(rules.craftableAffixesFor(item,lore).map(r=>[r.def.id,r.rank]),row.after,row.baseId);}
});
test('crafting content owns tuning but shares immutable item definitions',()=>{
 const input=copy(pack),owned=new CraftingContent(input,items);assert.equal(owned.items,items);assert.notEqual(owned.pack,input);
 input.craft.stepsPerRank[0]=999;assert.equal(owned.pack.craft.stepsPerRank[0],3);assert(Object.isFrozen(owned.pack.craft.stepsPerRank));
 assert.throws(()=>owned.pack.craft.stepsPerRank.push(1));assert.equal(owned.rules.ports.affix('constructor'),undefined);
 const amount=owned.rules.ports.cost(1);amount.count=0;assert.equal(owned.rules.ports.cost(1).count,6);
 const pool=owned.rules.ports.pools(items.pack.bases.ring_lapis);assert(Object.isFrozen(pool.prefix));assert.equal(owned.rules.ports.pools(items.pack.bases.ring_lapis),pool);
});
test('invalid content fails before becoming executable',()=>{
 for(const mutate of [p=>p.schemaVersion=2,p=>p.capability='unknown',p=>p.itemContentId='other',p=>p.extra=true,p=>p.craft.extra=true,
  p=>p.craft.stepsPerRank=[0],p=>p.craft.baseWeighting='other',p=>p.craft.skillLift=1.1,p=>p.salvage.base=Infinity,
  p=>p.rankCosts.first.essence='missing',p=>p.rankCosts.first.count=.5,p=>p.oracleCosts.common=null,p=>p.essences.push(p.essences[0]),
  p=>p.gearEssences.rare='missing',p=>delete p.gemEssences.common,p=>delete p.sell.memoryUnit.rough,p=>p.sell.gemRarityMul.common=-1,p=>p.vendor.rarityWeights.unknown=1,
  p=>p.craft.smith.sweepPeriod=0,p=>p.craft.runes.count=0]){const input=copy(pack);mutate(input);assert.throws(()=>new CraftingContent(input,items));}
});
test('rolls require explicit finite unit random values and finite scores',()=>{
 const def=Object.values(items.pack.affixes).find(d=>d.tiers.some(t=>!t.magicOnly));
 for(const value of [-1,1,NaN,Infinity])assert.throws(()=>rules.rollCraftedAffix(def,1,()=>value));
 assert.throws(()=>rules.rollCraftedAffix(def,1,()=>.5,NaN));
 const lore={};assert.equal(rules.expertiseRank(lore,'constructor'),0);assert.deepEqual(rules.expertiseProgress(lore,'__proto__'),[0,3]);
 const unknown={...plain(),affixes:[{id:'missing',tier:0,rolls:[.5]}]};assert.deepEqual(rules.studySalvage({},unknown),[]);
 unknown.uniqueId='missing';assert.deepEqual(rules.craftableAffixesFor(unknown,{}),[]);
});
