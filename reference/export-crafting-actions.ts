import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {mulberry32,seedGlobalRandom} from '../src/sim/rng';
import {forgeItem} from '../src/engine/itemgen';
import {autoPlace} from '../src/engine/inventory';
import {CRAFT_CFG,craftableAffixesFor, type CraftLore} from '../src/engine/crafting';
import {ITEM_AFFIXES} from '../src/data/itemaffixes';
import {ESSENCE_IDS} from '../src/data/essences';
import {LEDGER_CRAFTS_UNLOCKED} from '../src/meta/account';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {makeSkillInstance,type SupportInstance} from '../src/engine/skills';
import type {ItemInstance,ItemRarity} from '../src/engine/items';
bootSimEngine();
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const originalRandom=Math.random,originalFetch=globalThis.fetch,windowDescriptor=Object.getOwnPropertyDescriptor(globalThis,'window');
const restoreRandom=seedGlobalRandom(0x46c002),w=makeSimWorld('warrior',0x46c002),seat=w.localSeat,m=seat.meta,host=w as any;
let near=true,bench=true,counter=true,oracle=true,progression=true,draws=0,ruleDraws=0,events:any[]=[],throwAt='',mutationAt='';
const contexts:string[]=[];
let random=mulberry32(1),bodies:ItemInstance[]=[],saved:any[]=[],rows:any[]=[];
const body=(item:ItemInstance)=>copy(item);
const snapshot=()=>copy({bag:m.items.map(body),equipped:m.equipped,containers:m.containers,wallet:m.essences,lore:w.account.craftLore,
  ledger:{crafts:w.account.ledger[LEDGER_CRAFTS_UNLOCKED]??0,touched:w.ledger.essence_touched??0},
  features:[...w.account.features],draws,ruleDraws,owners:bodies.map(i=>({uid:i.uid,bag:m.items.indexOf(i),equipped:Object.keys(m.equipped).filter(k=>m.equipped[k]===i)})),
  drops:w.drops.map(d=>d.item.kind==='gear'?{kind:'gear',item:d.item.item}:d.item.kind==='support'?
    {kind:'support',id:d.item.gem.def.id,level:d.item.gem.level,locked:d.item.gem.locked,rolled:d.item.gem.rolled,pos:d.pos,bob:d.bob}:{kind:d.item.kind}),
  life:seat.actor.maxLife(),mana:seat.actor.maxMana(),saved});
Object.defineProperty(globalThis,'window',{configurable:true,value:{localStorage:{setItem:(key:string,value:string)=>{
  const data=JSON.parse(value);saved.push({key,lore:data.craftLore,ledger:data.ledger});events.push({name:'saveAccount',state:snapshot()});
}}}});
globalThis.fetch=(async (url:unknown,options?:RequestInit)=>{
  assert.equal(url,'/__save/0');assert.equal(options?.method,'POST');events.push({name:'diskPut',state:snapshot()});return new Response('',{status:200});
}) as typeof fetch;
Math.random=()=>{draws++;if(!contexts.length)ruleDraws++;const value=random();events.push({name:'random',context:contexts.at(-1)??'rule',value});return value;};
host.stationReach=(kind:string)=>{events.push({name:'stationReach',kind});return kind==='salvage'?bench:kind==='oracle'?oracle:false;};
host.nearSalvage=()=>{events.push({name:'nearSalvage'});return near;};
host.nearScrapVendor=()=>{events.push({name:'nearScrapVendor'});return counter;};
host.metaProgressionActive=()=>{events.push({name:'metaProgressionActive',value:progression});return progression;};
for(const name of ['spendEssence','grantEssence','grantSupportGemItem','recalcSeat','markMetaDirty','failNote','text']){
  const original=host[name];host[name]=function(...args:any[]){
    const detail=name==='text'?{text:args[1],color:args[2]}:name==='failNote'?{key:args[1],reason:args[2]}:
      name==='spendEssence'||name==='grantEssence'?{cost:copy(args[1])}:name==='grantSupportGemItem'?{support:args[1].def.id,level:args[1].level,spill:args[2]}:{};
    events.push({name,phase:'before',...detail,state:snapshot()});
    if(throwAt===name)throw new Error('observed callback interruption: '+name);
    if(mutationAt===name){progression=false;mutationAt='';}
    contexts.push(name);let result;try{result=original.apply(this,args);}finally{contexts.pop();}
    events.push({name,phase:'after',state:snapshot()});return result;
  };
}
function mint(rarity:ItemRarity='common',baseId='ring_lapis',where:'bag'|'worn'|'none'='bag'){
  const item=forgeItem({baseId,rarity,ilvl:25,affixes:[],quality:.5,rng:mulberry32(22)})!;assert(item);
  bodies.push(item);if(where==='bag')assert(autoPlace(m.items,item));if(where==='worn')m.equipped[baseId==='helmet_armor'?'helmet':'ring1']=item;return item;
}
function reset(){
  m.items=[];m.equipped={};m.containers={};w.drops=[];w.account.craftLore={};w.account.ledger={};w.ledger={};
  w.account.features.delete(CRAFT_CFG.extraSlotFeature);for(const id of ESSENCE_IDS)m.essences[id]=100;
  near=bench=counter=oracle=progression=true;throwAt=mutationAt='';bodies=[];saved=[];draws=ruleDraws=0;random=mulberry32(0x460000+rows.length);
  w.recalcSeat(seat);events=[];draws=ruleDraws=0;
}
function step(name:string,method:string,...args:any[]){
  const before=snapshot();events=[];let error:string|undefined;
  try{host[method](seat,...args);}catch(cause){error=(cause as Error).message;}
  const row={name,command:{method,args},before,after:snapshot(),events:copy(events),...(error?{error}:{})};rows.push(row);return row;
}
function studied(item:ItemInstance,rank=1){
  const lore:CraftLore={};for(const def of Object.values(ITEM_AFFIXES))lore[def.family]={rank,progress:0};
  const option=craftableAffixesFor(item,lore).find(o=>o.def.tiers.length>=3&&o.def.lines.length===1);assert(option);
  w.account.craftLore={[option.def.family]:{rank,progress:0}};return option.def;
}
function natural(item:ItemInstance,rank=0){const def=studied(item,Math.max(1,rank));w.account.craftLore[def.family]={rank,progress:2};item.affixes=[{id:def.id,tier:def.tiers.length-1,rolls:def.lines.map(()=>.5)}];return def;}
try{
  for(const score of [-2,0,.6,2])for(const worn of [false,true]){
    reset();const item=mint('common','ring_lapis',worn?'worn':'bag'),def=studied(item);
    const row=step('craft-'+score+'-'+worn,'craftAffix',item.uid,def.id,score);
    assert.equal(row.after.wallet.glimmering,94);assert.equal(item.affixes.length,1);assert.equal(item.affixes[0].crafted,true);assert.equal(ruleDraws,2);
  }
  for(const refusal of ['station','missing','unlearned','funds','capacity','duplicate','missing-unique']){
    reset();const item=mint(),def=studied(item);let uid=item.uid;
    if(refusal==='station')bench=false;if(refusal==='missing')uid=-1;if(refusal==='unlearned')w.account.craftLore={};
    if(refusal==='funds')m.essences.glimmering=0;if(refusal==='capacity')item.craftedSockets=1;
    if(refusal==='duplicate')item.affixes=[{id:def.id,tier:def.tiers.length-1,rolls:[.5]}];if(refusal==='missing-unique')item.uniqueId='missing';
    const before=copy(item),row=step('craft-refuse-'+refusal,'craftAffix',uid,def.id,.5);assert.deepEqual(item,before);assert.equal(ruleDraws,0);assert.equal(row.after.wallet.glimmering,row.before.wallet.glimmering);
  }
  reset();{const item=mint(),def=studied(item);item.craftedSockets=1;w.account.features.add(CRAFT_CFG.extraSlotFeature);step('second-slot-feature','craftAffix',item.uid,def.id,1);assert.equal(item.affixes.length,1);}
  reset();{const item=mint(),def=studied(item);item.locked=true;step('keeper-lock-does-not-block-crafting','craftAffix',item.uid,def.id);assert.equal(item.affixes.length,1);}
  for(const variant of ['bag','worn','station','funds','capacity','socket-cap','unknown-base']){
    reset();const item=mint('common','helmet_armor',variant==='worn'?'worn':'bag');item.sockets=[];
    if(variant==='station')bench=false;if(variant==='funds')m.essences.brilliant=0;if(variant==='capacity')item.craftedSockets=1;
    if(variant==='socket-cap')item.sockets=Array(10).fill(null);if(variant==='unknown-base')item.baseId='missing';
    const row=step('socket-'+variant,'craftSocket',item.uid);
    if(variant==='bag'||variant==='worn'){assert.equal(item.craftedSockets,1);assert.equal(row.after.wallet.brilliant,94);}
    else assert.equal(row.after.wallet.brilliant,row.before.wallet.brilliant);
  }
  for(const variant of ['bag','worn','funds','station','locked','crafted','ineligible','missing-affix','missing-index']){
    reset();const item=mint('rare','ring_lapis',variant==='worn'?'worn':'bag'),def=natural(item);
    if(variant==='funds')m.essences.brilliant=0;if(variant==='station')oracle=false;if(variant==='locked')item.affixes[0].locked=true;
    if(variant==='crafted')item.affixes[0].crafted=true;if(variant==='ineligible')item.ilvl=-1;if(variant==='missing-affix')item.affixes[0].id='missing';
    const row=step('reroll-'+variant,'rerollAffix',item.uid,variant==='missing-index'?99:0,.8);
    if(variant==='bag'||variant==='worn'){assert.equal(item.affixes[0].locked,true);assert.equal(row.after.wallet.brilliant,96);}
    if(variant==='funds'){assert(ruleDraws>=2);assert.deepEqual(row.after.bag,row.before.bag);assert.equal(row.after.wallet.brilliant,0);}
    if(variant==='ineligible'||variant==='station'||variant==='locked'||variant==='crafted'||variant==='missing-affix'||variant==='missing-index')assert.equal(ruleDraws,0);
    assert(def);
  }
  for(const variant of ['break','sell','sealed','auto-bench','auto-counter','unreachable','locked','relic','quest','worn','crafted','weak','maxed','live-seal']){
    reset();const item=mint('magic','ring_lapis',variant==='worn'?'worn':'bag'),def=natural(item);
    if(variant==='sealed')progression=false;if(variant==='auto-counter')near=false;if(variant==='unreachable')bench=false;
    if(variant==='locked')item.locked=true;if(variant==='relic')item.relicKey='owned';if(variant==='quest')item.questId='quest';
    if(variant==='crafted')item.affixes[0].crafted=true;if(variant==='weak')w.account.craftLore[def.family]={rank:1,progress:0};
    if(variant==='maxed')w.account.craftLore[def.family]={rank:5,progress:0};if(variant==='live-seal')mutationAt='grantEssence';
    const row=step('salvage-'+variant,'salvageItem',item.uid,variant.startsWith('auto')?undefined:variant==='sell'?'sell':'break');
    if(['unreachable','locked','relic','quest','worn'].includes(variant))assert.deepEqual(row.after.bag,row.before.bag);
    if(['break','auto-bench'].includes(variant)){assert.equal(w.account.craftLore[def.family].rank,1);assert.equal(w.account.ledger[LEDGER_CRAFTS_UNLOCKED],1);assert.equal(saved.length,1);}
    if(['sell','auto-counter','sealed','live-seal'].includes(variant)){assert.equal(saved.length,0);assert.equal(w.account.craftLore[def.family].rank,0);}
  }
  for(const kind of ['rough','preformed'] as const)for(const lane of ['break','sell'] as const){
    reset();const item=mint();item.baseId=kind+'_memory';item.mem=[{d:'rat',s:1},{d:'rat',s:2},{d:'rat',s:3}];
    const row=step('memory-'+kind+'-'+lane,'salvageItem',item.uid,lane);
    assert.equal(m.items.includes(item),lane==='break');assert.equal(row.after.wallet.coarse-row.before.wallet.coarse,lane==='sell'?(kind==='rough'?3:6):0);
  }
  const skillDef=Object.values(SKILLS)[0],supportDef=Object.values(SUPPORTS)[0];
  for(const variant of ['plain','granted','locked','unknown','overflow']){
    reset();const skill=makeSkillInstance(skillDef,3,2);skill.rarity='magic';skill.sockets[0]={def:supportDef,level:2} as SupportInstance;
    if(variant==='granted')skill.granted=true;
    const item=w.grantSkillGemItem(seat,skill)!;assert(item);bodies.push(item);
    if(variant==='locked')item.locked=true;if(variant==='unknown'&&item.gem?.kind==='skill')item.gem.skillId='missing';
    if(variant==='overflow'){
      // Fill all cells. Removing the one-cell gem wrapper leaves room for
      // exactly one returned socket; a second must spill.
      for(let i=0;i<300;i++){const filler=forgeItem({baseId:'ring_lapis',ilvl:1,rarity:'common',affixes:[],quality:0,rng:mulberry32(i+1)})!;if(!autoPlace(m.items,filler))break;}
      if(item.gem?.kind==='skill')item.gem.sockets=[{supportId:supportDef.id,level:2},{supportId:supportDef.id,level:3}];
    }
    const row=step('skill-gem-'+variant,'salvageItem',item.uid,'break');
    assert.equal(m.items.includes(item),variant==='locked');
    if(variant==='plain'||variant==='granted'||variant==='overflow')assert(row.events.some((e:any)=>e.name==='grantSupportGemItem'));
    if(variant==='overflow')assert(w.drops.some(d=>d.item.kind==='support'&&d.item.gem.def.id===supportDef.id&&d.item.gem.level===3));
    if(variant==='granted'||variant==='unknown')assert.equal(row.after.wallet.glimmering,row.before.wallet.glimmering);
  }
  for(const variant of ['gear','rarity','skill','skill-all','support','empty']){
    reset();const a=mint('common'),b=mint('magic'),locked=mint('rare'),quest=mint(),relic=mint(),pouch=mint();
    locked.locked=true;quest.questId='quest';relic.relicKey='relic';pouch.mem=[{d:'rat',s:2}];pouch.baseId='rough_memory';
    natural(a);natural(b);
    const ordinary=makeSkillInstance(skillDef,3,1);ordinary.rarity='legendary';ordinary.sockets[0]={def:supportDef,level:2} as SupportInstance;
    const granted=makeSkillInstance(skillDef,1,0);granted.granted=true;
    const si=w.grantSkillGemItem(seat,ordinary)!,gi=w.grantSkillGemItem(seat,granted)!;
    const second=makeSkillInstance(skillDef,4,0);second.rarity='magic';
    const keeper=makeSkillInstance(skillDef,4,0);keeper.rarity='legendary';keeper.locked=true;
    const secondItem=w.grantSkillGemItem(seat,second)!,keeperItem=w.grantSkillGemItem(seat,keeper)!;
    const su=w.grantSupportGemItem(seat,{def:supportDef,level:2} as SupportInstance)!;
    const sl=w.grantSupportGemItem(seat,{def:supportDef,level:2,locked:true} as SupportInstance)!;
    assert(si&&gi&&su&&sl&&secondItem&&keeperItem);if(variant==='empty')m.items=[];
    const row=step('bulk-'+variant,'salvageBulk',variant.startsWith('skill')?'skill':variant==='support'?'support':'item',variant==='rarity'?'common':variant==='skill'?'legendary':undefined,'break');
    if(variant==='gear'||variant==='rarity'){assert(!m.items.includes(a));assert.equal(m.items.includes(b),variant==='rarity');assert.equal(saved.length,1);}
    if(variant.startsWith('skill')){assert(!m.items.includes(si));assert(m.items.includes(gi));assert(m.items.includes(keeperItem));
      assert.equal(m.items.includes(secondItem),variant==='skill');assert(m.items.some(i=>i.gem?.kind==='support'));}
    if(variant==='support'){assert(!m.items.includes(su));assert(m.items.includes(sl));}
    if(variant!=='empty')for(const item of [locked,quest,relic,pouch])assert(m.items.includes(item));
    assert(row.events.some((e:any)=>e.name==='markMetaDirty'));
  }
  reset();{const item=mint('common','ring_lapis','worn');step('lock-worn','salvageLockSet',item.uid,true);assert.equal(item.locked,true);step('unlock-deletes-property','salvageLockSet',item.uid,false);assert(!Object.hasOwn(item,'locked'));step('lock-missing','salvageLockSet',-1,true);}
  for(const at of ['spendEssence','recalcSeat','text','markMetaDirty']){
    reset();const item=mint('common','ring_lapis','worn'),def=studied(item);throwAt=at;
    const row=step('interrupted-craft-'+at,'craftAffix',item.uid,def.id,.5);assert(row.error?.includes(at));
    if(at==='spendEssence'){assert.equal(item.affixes.length,0);assert.equal(ruleDraws,0);}else{assert.equal(item.affixes.length,1);assert.equal(m.essences.glimmering,94);}
  }
  reset();{const item=mint();natural(item);throwAt='grantEssence';const row=step('interrupted-salvage-after-removal','salvageItem',item.uid,'break');assert(row.error);assert(!m.items.includes(item));assert.equal(saved.length,0);}
  fs.writeFileSync(process.argv[2],JSON.stringify({rows})+'\n');console.log({courses:rows.length});
}catch(error){fs.writeFileSync(process.argv[2]+'.partial',JSON.stringify({rows})+'\n');throw error;}finally{
  Math.random=originalRandom;restoreRandom();globalThis.fetch=originalFetch;
  if(windowDescriptor)Object.defineProperty(globalThis,'window',windowDescriptor);else delete (globalThis as any).window;
}
