import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {mulberry32,seedGlobalRandom} from '../src/sim/rng';
import {forgeItem,itemLevelReq} from '../src/engine/itemgen';import {autoPlace,bagBoard} from '../src/engine/inventory';
import {EQUIP_SLOTS,SLOT_BY_ID,type ItemInstance} from '../src/engine/items';import {CLASSES} from '../src/data/classes';import {NullInput} from '../src/net/intent';
import {registerContainer,containerBoard,type ContainerDef} from '../src/engine/containers';import {CONTAINER_DEFS,RELIQUARY} from '../src/data/containers';
import {bankRelic} from '../src/engine/accountReliquary';
bootSimEngine();const wire=(value:unknown):any=>JSON.parse(JSON.stringify(value)),authoredSlots=wire(EQUIP_SLOTS),scenarios:any[]=[];
const def=registerContainer({id:'sdk_observation_case',label:'observation case',glyph:'O',icon:'reliquary',blurb:'Original extensible-container observation only.',accepts:{categories:['ring','helmet','relic']},active:true,ladder:[{feature:'sdk_observation_case',label:'Frame',description:'Frame',cost:0,cells:['####','#..#','#..#','####']},{feature:'sdk_observation_case_full',label:'Centre',description:'Centre',cost:0,cells:['....','.##.','.##.','....']}]});
(CONTAINER_DEFS as ContainerDef[]).push(def);
for(let variant=0;variant<8;variant++){
 const restoreRandom=seedGlobalRandom(160100+variant);
 try{
  const classId=variant%2?'magician':'warrior',w=makeSimWorld(classId,160100+variant),seat=variant&2?w.addSeat('guest',CLASSES.find(c=>c.id===classId)!,new NullInput(),{startingCompanions:false,startingFlasks:false}):w.localSeat,hero=seat.actor,m=seat.meta,rng=mulberry32(160100+variant),rows:any[]=[],bodies:ItemInstance[]=[];
  w.account.features.add(def.ladder[0].feature);if(variant&4)w.account.features.add(def.ladder[1].feature);
  const mint=(baseId='ring_lapis',ilvl=1)=>{const item=forgeItem({baseId,ilvl,rarity:'magic',quality:.7,affixes:[],rng})!;assert(item);bodies.push(item);return item;};
  const reset=()=>{m.items=[];m.equipped={};m.containers={};w.drops=[];hero.level=1;w.recalcSeat(seat);};
  const owner=(item:ItemInstance)=>({bag:m.items.indexOf(item),slots:Object.keys(m.equipped).filter(k=>m.equipped[k]===item),containers:Object.fromEntries(Object.entries(m.containers).filter(([,items])=>items.includes(item)).map(([id,items])=>[id,items.indexOf(item)])),ground:w.drops.findIndex(d=>d.item.kind==='gear'&&d.item.item===item)});
  const snapshot=()=>wire({bag:m.items,equipped:m.equipped,containers:m.containers,drops:w.drops,owners:bodies.map(item=>({uid:item.uid,...owner(item)})),stats:Object.fromEntries(['life','mana','armor','evasion','critChance','damage'].map(id=>[id,hero.sheet.get(id)])),attributes:hero.attributeValues,life:hero.life,maxLife:hero.maxLife(),level:hero.level,account:w.account.reliquary,slots:EQUIP_SLOTS,features:[...w.account.features],access:{casting:!!hero.casting,client:!!w.clientActionHook,lastCombatAt:w.lastCombatAt,time:w.time}});
  let events:any[]=[];const original:any=w;
  for(const name of ['recalcSeat','persistAccountRelics','markMetaDirty','failNote','text','dropGearAt']){const method=original[name];original[name]=function(...args:any[]){events.push({name,phase:'before',state:snapshot(),...(name==='failNote'?{key:args[1],reason:args[2]}:name==='text'?{text:args[1],color:args[2]}:name==='dropGearAt'?{uid:args[1].uid,by:args[2]}:{})});const result=method.apply(this,args);events.push({name,phase:'after',state:snapshot()});return result;};}
  const step=(name:string,method:string,...args:any[])=>{const before=snapshot();events=[];const result=original[method](seat,...args);rows.push(wire({name,command:{method,args},before,result,state:snapshot(),events}));};
  reset();const ringA=mint(),ringB=mint(),ringC=mint(),helmet=mint('helmet_armor'),high=mint('chest_armor',80);for(const item of [ringA,ringB,ringC,helmet,high])assert(autoPlace(m.items,item));
  step('first-empty-compatible-slot','equipItem',ringA.uid);step('second-empty-compatible-slot','equipItem',ringB.uid);step('worn-to-worn-swap','equipItem',ringA.uid,'ring2');step('same-slot-no-op','equipItem',ringA.uid,'ring2');
  step('invalid-request-falls-back','equipItem',ringC.uid,'missing');step('disabled-request-falls-back','equipItem',ringB.uid,'mainhand');step('level-refusal','equipItem',high.uid);hero.level=itemLevelReq(high);step('exact-level-accepted','equipItem',high.uid,'chest');
  step('unequip-occupied-cell','unequipItem','ring2',helmet.x,helmet.y);step('unequip-first-fit','unequipItem','ring2');step('unequip-missing','unequipItem','missing');step('unknown-identity','equipItem',-1);step('incompatible-request-falls-back','equipItem',helmet.uid,'ring1');
  ringB.locked=true;step('locked-piece-still-equips','equipItem',ringB.uid,'ring2');const enabled=SLOT_BY_ID.ring2.enabled;
  try{SLOT_BY_ID.ring2.enabled=false;step('live-disabled-slot-falls-back','equipItem',ringC.uid,'ring2');}finally{SLOT_BY_ID.ring2.enabled=enabled;}
  // A live compatible-slot edit allows differently sized pieces to exercise
  // the original full-bag displacement fallback without changing item rules.
  reset();const big=mint('helmet_armor'),small=mint();m.equipped.ring1=big;assert(autoPlace(m.items,small));const accepts=SLOT_BY_ID.ring1.accepts;
  try{SLOT_BY_ID.ring1.accepts=['ring','helmet'];const board=bagBoard();for(let i=0;i<board.w*board.h;i++)autoPlace(m.items,mint('ring_mi_gnoll'));step('full-bag-displaced-equipment-goes-to-ground','equipItem',small.uid,'ring1');assert(w.drops.some(d=>d.item.kind==='gear'&&d.item.item===big));assert(autoPlace(m.items,mint('ring_mi_gnoll')));step('full-bag-unequip-refused','unequipItem','ring1');assert.equal(m.equipped.ring1,small);}
  finally{SLOT_BY_ID.ring1.accepts=accepts;}
  reset();const pieces=[mint(),mint(),mint(),mint('helmet_armor'),mint('relic_charm')];for(const item of pieces)assert(autoPlace(m.items,item));
  step('bag-single-blocker-swap','moveBagItem',pieces[0].uid,1,0);step('bag-same-cell-dirty-mark','moveBagItem',pieces[0].uid,1,0);step('bag-off-board-refusal','moveBagItem',pieces[0].uid,99,99);
  step('container-first-exact-seat','containerPlace',def.id,pieces[0].uid,0,0);step('container-same-cell-callbacks','containerMove',def.id,pieces[0].uid,0,0);step('container-second-seat','containerPlace',def.id,pieces[1].uid,1,0);step('container-internal-swap','containerMove',def.id,pieces[0].uid,1,0);step('container-sealed-or-expanded-centre','containerMove',def.id,pieces[0].uid,1,1);
  step('container-bag-exchange','containerPlace',def.id,pieces[2].uid,0,0);step('container-first-fit','containerPlace',def.id,pieces[4].uid);step('container-unowned-refusal','containerPlace','missing',pieces[3].uid);
  step('container-take-occupied-bag-cell','containerTake',def.id,pieces[2].uid,pieces[3].x,pieces[3].y);step('container-take-first-fit','containerTake',def.id,pieces[2].uid);step('container-out-of-bounds','containerMove',def.id,pieces[1].uid,50,50);
  const feature=def.ladder[0].feature;w.account.features.delete(feature);step('container-feature-removed','containerPlace',def.id,pieces[2].uid);w.account.features.add(feature);
  // Seeded valid commands include both successful mutations and real refusals.
  for(let i=0;i<64;i++){
   const candidates=[...m.items,...Object.values(m.equipped),...(m.containers[def.id]??[])].filter((x):x is ItemInstance=>!!x),item=candidates[Math.floor(rng()*candidates.length)];assert(item);const x=Math.floor(rng()*(bagBoard().w+1)),y=Math.floor(rng()*(bagBoard().h+1));
   const method=i%6;
   if(method===0)step('generated-equip-'+i,'equipItem',item.uid,i%3?'ring1':undefined);
   else if(method===1)step('generated-unequip-'+i,'unequipItem',i%2?'ring1':'helmet',x,y);
   else if(method===2)step('generated-bag-move-'+i,'moveBagItem',item.uid,x,y);
   else if(method===3)step('generated-container-place-'+i,'containerPlace',def.id,item.uid,x%4,y%4);
   else if(method===4)step('generated-container-move-'+i,'containerMove',def.id,item.uid,x%4,y%4);
   else step('generated-container-take-'+i,'containerTake',def.id,item.uid,x,y);
  }
  reset();const board=containerBoard(def)!;m.containers[def.id]=[];
  for(let y=0;y<board.h;y++)for(let x=0;x<board.w;x++)if(board.open[y*board.w+x]){const item=mint();item.x=x;item.y=y;m.containers[def.id].push(item);}
  const failedSeat=mint(),following=mint();assert(autoPlace(m.items,failedSeat));assert(autoPlace(m.items,following));
  step('full-container-first-fit-refusal-order','containerPlace',def.id,failedSeat.uid);assert.equal(m.items.at(-1),failedSeat);
  const blocked=m.containers[def.id][0];step('blocked-container-take-refusal-order','containerTake',def.id,blocked.uid,following.x,following.y);assert.equal(m.containers[def.id].at(-1),blocked);
  reset();for(const rung of RELIQUARY.ladder)w.account.features.add(rung.feature);w.lastCombatAt=-999;
  const relics=[mint('relic_charm'),mint('relic_charm')];for(const [index,item] of relics.entries()){assert(bankRelic(w.account,item,'equipment-observer'));item.x=index;item.y=0;}
  w.account.reliquary.seated=relics.map(item=>item.relicKey!);m.containers.reliquary=relics;
  // Foreign-seat views are deliberately populated to prove authorization wins
  // even when a caller supplies a body it must not be allowed to rearrange.
  step('reliquary-move-own-or-foreign-seat','containerMove','reliquary',relics[0].uid,1,0);
  hero.casting={} as any;step('reliquary-casting-refusal','containerMove','reliquary',relics[0].uid,0,1);hero.casting=null;
  w.lastCombatAt=w.time;step('reliquary-combat-refusal','containerMove','reliquary',relics[0].uid,0,1);w.lastCombatAt=-999;
  w.clientActionHook=()=>{};step('reliquary-client-refusal','containerMove','reliquary',relics[0].uid,0,1);w.clientActionHook=undefined;
  w.account.features.delete(RELIQUARY.ladder[0].feature);step('reliquary-feature-refusal','containerMove','reliquary',relics[0].uid,0,1);
  scenarios.push({variant,classId,guest:!!(variant&2),expanded:!!(variant&4),rows});
 }finally{restoreRandom();}
}
assert.deepEqual(wire(EQUIP_SLOTS),authoredSlots);const output=process.argv[2];fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'equipment-actions.json'),JSON.stringify({authoredSlots,syntheticContainer:def,scenarios})+'\n');console.log(`Observed ${scenarios.length} original Worlds and ${scenarios.reduce((n,s)=>n+s.rows.length,0)} equipment/container transitions with callbacks.`);
