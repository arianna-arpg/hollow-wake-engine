import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {mulberry32,seedGlobalRandom} from '../src/sim/rng';
import {makeAccount,serializeAccount,FEATURE,LEDGER_CRAFTS_UNLOCKED} from '../src/meta/account';
import {allUnlockables,applyUnlock,investUnlock,isUnlockOwned,isUnlockVisible} from '../src/meta/unlocks';
import {CRAFT_CFG,craftableAffixesFor} from '../src/engine/crafting';
import {forgeItem} from '../src/engine/itemgen';
import {autoPlace,bagBoard} from '../src/engine/inventory';
import {ITEM_AFFIXES} from '../src/data/itemaffixes';
import {ESSENCE_IDS} from '../src/data/essences';
import type {ItemInstance} from '../src/engine/items';

bootSimEngine();
const originalRandom=Math.random,originalFetch=globalThis.fetch,windowDescriptor=Object.getOwnPropertyDescriptor(globalThis,'window');
const restoreSeed=seedGlobalRandom(0x5aacca),world=makeSimWorld('warrior',0x5aacca),seat=world.localSeat,host=world as any;
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
let progression=true,reachable=true,accountDraws=0,workshopDraws=0,active:'account'|'workshop'='workshop';
let accountRandom=mulberry32(17),workshopRandom=mulberry32(23),events:any[]=[],saved:any[]=[];
const rows:any[]=[],scenarios:any[]=[];
const offer=(id:string)=>{const value=allUnlockables(world.account).find(row=>row.id===id);assert(value,id);return value;};
const reads=()=>{
  const ids=['feat_craft_second','feat_oracle_stone','memory_discovery'];
  return ids.map(id=>{const row=offer(id);return {id,owned:isUnlockOwned(world.account,row),visible:isUnlockVisible(world.account,row)};});
};
const snapshot=()=>copy({
  account:serializeAccount(world.account),
  inventory:{board:bagBoard(),items:seat.meta.items,equipped:seat.meta.equipped,overflow:[],essences:seat.meta.essences},
  progression,slots:world.craftSlots(),offers:reads(),accountDraws,workshopDraws
});
Object.defineProperty(globalThis,'window',{configurable:true,value:{localStorage:{setItem:(key:string,text:string)=>{
  const value=JSON.parse(text);saved.push(copy(value));
  events.push({kind:'account-save',ledger:copy(value.ledger),craftLore:copy(value.craftLore),features:copy(value.features)});
}}}});
globalThis.fetch=(async (url:unknown,options?:RequestInit)=>{
  assert.equal(url,'/__save/0');assert.equal(options?.method,'POST');return new Response('',{status:200});
}) as typeof fetch;
Math.random=()=>{
  const value=active==='account'?(accountDraws++,accountRandom()):(workshopDraws++,workshopRandom());
  events.push({kind:'random',stream:active,value});return value;
};
host.stationReach=(kind:string)=>reachable&&(kind==='salvage'||kind==='oracle');
host.nearSalvage=()=>reachable;
host.nearScrapVendor=()=>reachable;
host.metaProgressionActive=()=>progression;
host.text=(_position:unknown,text:string)=>events.push({kind:'text',text});
host.failNote=(_actor:unknown,key:string,reason:string)=>events.push({kind:'refused',key,reason});
host.markMetaDirty=()=>events.push({kind:'dirty'});
host.recalcSeat=()=>events.push({kind:'recalculate'});
function mint(uid:number,rarity:'common'|'magic'='common'){
  const item=forgeItem({baseId:'ring_lapis',ilvl:25,rarity,sockets:1,affixes:[],quality:.5,rng:mulberry32(uid)})!;
  assert(item);item.uid=uid;assert(autoPlace(seat.meta.items,item));return item;
}
function reset(name:string,variant:string){
  Object.assign(world.account,makeAccount());
  world.account.features.add(FEATURE.SALVAGE_STATION);
  world.account.credits=1000;
  world.account.ledger={preserved:7};
  seat.meta.items=[];seat.meta.equipped={};seat.meta.containers={};
  seat.meta.essences=Object.fromEntries(ESSENCE_IDS.map(id=>[id,100])) as typeof seat.meta.essences;
  world.ledger={};world.drops=[];progression=true;reachable=true;
  accountDraws=workshopDraws=0;accountRandom=mulberry32(17);workshopRandom=mulberry32(23);
  const target=mint(1001);target.craftedSockets=1;
  const allLore=Object.fromEntries(Object.values(ITEM_AFFIXES).map(row=>[row.family,{rank:1,progress:0}]));
  const options=craftableAffixesFor(target,allLore).filter(row=>row.def.tiers.length>=3&&row.def.lines.length===1);
  const first=options[0]?.def,second=options.find(row=>row.def.family!==first?.family)?.def;assert(first&&second);
  const bodies:ItemInstance[]=[];
  for(const[uid,definition]of [[1002,first],[1003,second]] as const){
    const item=mint(uid,'magic');item.affixes=[{id:definition.id,tier:definition.tiers.length-1,rolls:[.5]}];
    world.account.craftLore[definition.family]={rank:0,progress:CRAFT_CFG.stepsPerRank[0]-1};bodies.push(item);
  }
  if(variant==='sealed')progression=false;
  if(variant==='unreachable')reachable=false;
  if(variant==='locked')bodies[0].locked=true;
  if(variant==='repeat-family'){
    world.account.craftLore[first.family]={rank:1,progress:0};
    world.account.ledger[LEDGER_CRAFTS_UNLOCKED]=1;
  }
  events=[];saved=[];
  const initial=snapshot();
  scenarios.push({name,variant,initial,first:first.id,second:second.id,family:first.family,
    accountSeed:17,workshopSeed:23});
  return {target,bodies,first,second};
}
function step(scenario:string,name:string,command:any,run:()=>unknown){
  const before=snapshot();events=[];const result=run();
  const row={scenario,name,command:copy(command),before,...(result===undefined?{}:{result}),after:snapshot(),events:copy(events)};
  rows.push(row);return row;
}
const accountAction=(fn:()=>unknown)=>{active='account';try{return fn();}finally{active='workshop';}};
const readOffers=()=>reads();
try{
  {
    const name='shared-authority',{target,bodies,first}=reset(name,'ordinary');
    const initial=snapshot();
    assert.equal(initial.slots,1);
    assert(!initial.offers.find((row:any)=>row.id==='feat_oracle_stone')!.visible);
    for(const item of bodies){
      const row=step(name,'study-'+item.uid,{owner:'workshop',op:'salvage',uid:item.uid,lane:'break'},
        ()=>world.salvageItem(seat,item.uid,'break'));
      assert.equal(row.after.account.ledger![LEDGER_CRAFTS_UNLOCKED],item.uid-1001);
      assert.equal(row.after.account.ledger!.preserved,7);
      assert(row.events.some((event:any)=>event.kind==='account-save'));
    }
    const taught=snapshot();
    // The historic comment names an Oracle craft-count gate; the actual current
    // catalogue instead requires a rescue. Observation must not invent a gate.
    assert(!taught.offers.find((row:any)=>row.id==='feat_oracle_stone')!.visible);
    step(name,'read-progression-after-study',{owner:'account',op:'read'},readOffers);
    const blocked=step(name,'craft-before-feature',{owner:'workshop',op:'craft',uid:target.uid,affixId:first.id,score:.5},
      ()=>world.craftAffix(seat,target.uid,first.id,.5));
    assert.equal(target.affixes.length,0);assert.equal(blocked.after.workshopDraws,0);
    const absent=step(name,'buy-before-deed',{owner:'account',op:'buy',id:'feat_craft_second'},
      ()=>accountAction(()=>applyUnlock(world.account,offer('feat_craft_second'))));
    assert.equal(absent.result,false);assert.equal(world.account.credits,1000);
    step(name,'observe-deed',{owner:'account',op:'observe',level:15,ledger:{...world.account.ledger,reached_level_15:1}},
      ()=>{world.account.level=15;world.account.ledger.reached_level_15=1;});
    const invested=step(name,'invest-feature',{owner:'account',op:'invest',id:'feat_craft_second',amount:100},
      ()=>accountAction(()=>investUnlock(world.account,offer('feat_craft_second'),100)));
    assert.equal(invested.result,100);assert.equal(world.craftSlots(),1);
    const bought=step(name,'buy-feature',{owner:'account',op:'buy',id:'feat_craft_second'},
      ()=>accountAction(()=>applyUnlock(world.account,offer('feat_craft_second'))));
    assert.equal(bought.result,true);assert.equal(world.account.credits,600);assert.equal(world.craftSlots(),2);
    const crafted=step(name,'craft-after-feature',{owner:'workshop',op:'craft',uid:target.uid,affixId:first.id,score:.5},
      ()=>world.craftAffix(seat,target.uid,first.id,.5));
    assert.equal(target.affixes.length,1);assert.equal(crafted.after.workshopDraws,2);
    assert.equal(crafted.after.account.ledger![LEDGER_CRAFTS_UNLOCKED],2);
    const duplicate=step(name,'buy-owned-feature',{owner:'account',op:'buy',id:'feat_craft_second'},
      ()=>accountAction(()=>applyUnlock(world.account,offer('feat_craft_second'))));
    assert.equal(duplicate.result,false);assert.equal(world.account.credits,600);
    const memory=step(name,'discover-memory',{owner:'account',op:'buy',id:'memory_discovery'},
      ()=>accountAction(()=>applyUnlock(world.account,offer('memory_discovery'))));
    assert.equal(memory.result,true);assert.equal(memory.after.accountDraws,1);assert.equal(memory.after.workshopDraws,2);
    assert.equal(memory.after.account.credits,570);assert.deepEqual(memory.after.account.craftLore,taught.account.craftLore);
    assert.deepEqual(memory.after.inventory,crafted.after.inventory);
    step(name,'read-workshop-after-memory',{owner:'workshop',op:'read'},()=>world.craftSlots());
  }
  for(const variant of ['sealed','sell','locked','unreachable','repeat-family']){
    const name='study-'+variant,{bodies}=reset(name,variant);
    const lane=variant==='sell'?'sell':'break';
    const row=step(name,'salvage',{owner:'workshop',op:'salvage',uid:bodies[0].uid,lane},
      ()=>world.salvageItem(seat,bodies[0].uid,lane));
    assert.deepEqual(row.after.account.craftLore,row.before.account.craftLore);
    assert.deepEqual(row.after.account.ledger,row.before.account.ledger);
    assert.equal(saved.length,variant==='repeat-family'?1:0);
    if(variant==='locked'||variant==='unreachable')assert.deepEqual(row.after.inventory,row.before.inventory);
    else assert.equal(row.after.inventory.items.length,row.before.inventory.items.length-1);
    step(name,'read-account',{owner:'account',op:'read'},readOffers);
  }
  for(const variant of ['missing-feature','missing-deed','insufficient','already-owned']){
    const name='purchase-'+variant,{target,first}=reset(name,'ordinary');
    world.account.ledger.reached_level_15=1;
    if(variant==='missing-feature')world.account.features.delete(FEATURE.SALVAGE_STATION);
    if(variant==='missing-deed')delete world.account.ledger.reached_level_15;
    if(variant==='insufficient')world.account.credits=399;
    if(variant==='already-owned')world.account.features.add(CRAFT_CFG.extraSlotFeature);
    // Preserve each course's actual starting authority after its deliberate setup.
    scenarios[scenarios.length-1].initial=snapshot();
    const row=step(name,'buy',{owner:'account',op:'buy',id:'feat_craft_second'},
      ()=>accountAction(()=>applyUnlock(world.account,offer('feat_craft_second'))));
    assert.equal(row.result,false);assert.deepEqual(row.after,row.before);
    step(name,'read-workshop',{owner:'workshop',op:'read'},()=>({slots:world.craftSlots(),options:craftableAffixesFor(target,world.account.craftLore).map(option=>option.def.id)}));
    assert(first);
  }
  assert.equal(scenarios.length,10);assert.equal(rows.length,30);
  fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,scenarios,rows})+'\n',{flag:'wx'});
  console.log({scenarios:scenarios.length,steps:rows.length,sharedLedger:true,immediateFeatureVisibility:true,oracleRequiresRescue:true});
}finally{
  restoreSeed();Math.random=originalRandom;globalThis.fetch=originalFetch;
  if(windowDescriptor)Object.defineProperty(globalThis,'window',windowDescriptor);else delete (globalThis as any).window;
}
