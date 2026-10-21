import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {mulberry32} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';import {forgeItem} from '../src/engine/itemgen';
import {autoPlace,bagBoard} from '../src/engine/inventory';import {RELIQUARY} from '../src/data/containers';
import {bankRelic,reconcileRelicStash} from '../src/engine/accountReliquary';
import {RELIQUARY_CFG} from '../src/data/reliquary';import {RELIQUARY_LESSON} from '../src/quests/reliquary';
import {serializeCharacter,applySavedCharacter} from '../src/meta/character';
import type {ItemInstance} from '../src/engine/items';
bootSimEngine();const wire=(value:unknown):any=>JSON.parse(JSON.stringify(value)),scenarios:any[]=[];
for(let variant=0;variant<8;variant++){
 const w=makeSimWorld('warrior',150100+variant),rng=mulberry32(150100+variant),seat=w.localSeat,hero=w.player,rows:any[]=[],authority:any[]=[];
 const original:any=w;w.meta.modeId='immortal';w.meta.charId='actions:'+variant;w.meta.relicScope='actions:'+variant;
 const own=()=>{for(const rung of RELIQUARY.ladder)w.account.features.add(rung.feature);w.account.features.add('oracle_stone');w.account.ledger.oracle_rescued=1;};
 const home=()=>{w.loadZone('lastlight');hero.pos={...w.stationAnchor('oracle')!.pos};w.lastCombatAt=-999;hero.invulnerable=true;};own();home();
 const mint=(baseId='relic_charm')=>forgeItem({baseId,ilvl:1,rarity:'magic',quality:1,affixes:baseId.startsWith('relic_')?[{id:'relic_life'}]:[],rng})!;
 const bodies=[mint(),mint(),mint('relic_effigy'),forgeItem({uniqueId:'reliquary_crown',ilvl:20,quality:1,rng})!,mint(),mint(),mint('helmet_armor')];
 bodies[4].locked=true;bodies[5].questId='custody-action-quest';for(const item of bodies)assert(autoPlace(w.meta.items,item));
 const stored=[mint(),mint('relic_talisman'),mint()];for(const item of stored)assert(bankRelic(w.account,item,w.meta.relicScope!));reconcileRelicStash(w.account);
 const hostile=new Actor('Access observation foe','enemy',{...hero.pos});hostile.skills=[...hero.skills];hostile.tier=hero.tier;
 assert(hostile.skills.some(Boolean),'Foe observation must be armed');
 const near=variant%2===0;if(!near)hero.pos={x:0,y:0};hostile.pos={...hero.pos};
 // Query original World authorization over all relevant independent flags.
 for(let bits=0;bits<256;bits++){
  const local=!(bits&1),client=!!(bits&2),feature=!(bits&4),dead=!!(bits&8),downed=!!(bits&16),casting=!!(bits&32),recent=!!(bits&64),foe=!!(bits&128);
  const querySeat=local?seat:{...seat,id:'guest'};w.clientActionHook=client?()=>{}:undefined;
  if(feature)w.account.features.add('reliquary');else w.account.features.delete('reliquary');hero.dead=dead;hero.downed=downed;hero.casting=casting?{} as any:null;w.lastCombatAt=recent?w.time:-999;
  if(foe)w.actors.push(hostile);
  authority.push({near,local,client,feature,dead,downed,casting,recent,foe,manage:w.canManageAccountRelics(querySeat),refusal:w.reliquaryRefusal(querySeat)});
  if(foe)w.actors.splice(w.actors.indexOf(hostile),1);
 }
 w.clientActionHook=undefined;hero.dead=false;hero.downed=false;hero.casting=null;w.lastCombatAt=-999;own();hero.pos={...w.stationAnchor('oracle')!.pos};
 const count=variant%4===0?RELIQUARY.ladder.length:variant%4-1;for(const rung of RELIQUARY.ladder.slice(count))w.account.features.delete(rung.feature);
 if(variant>=4)w.account.ledger[RELIQUARY_LESSON]=1;
 const identity=(items:readonly ItemInstance[])=>items.map(item=>({uid:item.uid,key:item.relicKey,canonical:w.account.reliquary.items.indexOf(item)}));
 const snapshot=()=>wire({reliquary:w.account.reliquary,bag:w.meta.items,equipped:w.meta.equipped,containers:w.meta.containers,locker:w.meta.stash,features:[...w.account.features],ledger:w.account.ledger,identity:{bag:identity(w.meta.items),board:identity(w.meta.containers.reliquary??[])},life:hero.life,maxLife:hero.maxLife(),enabled:w.meta.relicEnabled,accountDirty:w.accountDirty,context:{nearOracle:w.nearOracle(),lastCombatAt:w.lastCombatAt,time:w.time,dead:hero.dead,downed:hero.downed,casting:!!hero.casting,client:!!w.clientActionHook,lesson:w.reliquaryLesson()}});
 let events:any[]=[];
 for(const name of ['recalcSeat','persistAccountRelics','markMetaDirty','failNote']){
  const method=original[name];original[name]=function(...args:any[]){events.push({name,phase:'before',bag:identity(w.meta.items),board:identity(w.meta.containers.reliquary??[]),seated:[...w.account.reliquary.seated],carried:[...w.account.reliquary.carried],...(name==='failNote'?{key:args[1],reason:args[2]}:{})});const result=method.apply(this,args);events.push({name,phase:'after'});return result;};
 }
 const step=(name:string,work:()=>unknown)=>{const before=snapshot();events=[];const result=work();rows.push(wire({name,before,result,state:snapshot(),events}));};
 step('attune-before-actions',()=>w.oracleAttune(seat));
 step('seat-first-life-charm',()=>w.containerPlace(seat,'reliquary',bodies[0].uid,1,1));
 step('exchange-second-charm',()=>w.containerPlace(seat,'reliquary',bodies[1].uid,1,1));
 step('seat-large-effigy',()=>w.containerPlace(seat,'reliquary',bodies[2].uid,3,3));
 step('refuse-quest-piece',()=>w.containerPlace(seat,'reliquary',bodies[5].uid,0,0));
 step('refuse-ordinary-gear',()=>w.containerPlace(seat,'reliquary',bodies[6].uid,0,0));
 step('store-bag-piece',()=>w.oracleRelic(seat,bodies[0].uid,'store'));
 step('move-stored-address',()=>w.relicStashMove(seat,stored[0].uid,{page:0,x:4,y:3}));
 step('equip-stored-piece',()=>w.oracleRelic(seat,stored[0].uid,'equip'));
 step('exchange-from-storage',()=>w.containerPlace(seat,'reliquary',stored[1].uid,1,1));
 step('refuse-release-active',()=>w.oracleRelic(seat,stored[1].uid,'release'));
 stored[2].locked=true;step('refuse-release-locked',()=>w.oracleRelic(seat,stored[2].uid,'release'));stored[2].locked=false;
 step('release-reserve-piece',()=>w.oracleRelic(seat,stored[2].uid,'release'));
 step('repeat-release',()=>w.oracleRelic(seat,stored[2].uid,'release'));
 step('withdraw-exact-bag-cell',()=>w.withdrawRelic(seat,stored[0].uid,5,3));
 step('withdraw-first-fit',()=>w.withdrawRelic(seat,stored[1].uid));
 hero.life=hero.maxLife()*.4;step('disable-preserving-life-ratio',()=>w.reliquaryToggle(seat,false));
 step('repeat-disabled-no-op',()=>w.reliquaryToggle(seat,false));
 w.lastCombatAt=w.time;step('refuse-toggle-in-combat',()=>w.reliquaryToggle(seat,true));
 w.lastCombatAt=w.time-RELIQUARY_CFG.toggleCalmSeconds;step('toggle-at-calm-boundary',()=>w.reliquaryToggle(seat,true));
 hero.casting={} as any;step('refuse-toggle-while-casting',()=>w.reliquaryToggle(seat,false));hero.casting=null;
 hero.dead=true;step('refuse-withdraw-while-dead',()=>w.withdrawRelic(seat,bodies[0].uid));hero.dead=false;
 step('refuse-guest-transfer',()=>w.withdrawRelic({...seat,id:'guest'},bodies[0].uid));
 w.clientActionHook=()=>{};step('refuse-client-transfer',()=>w.oracleRelic(seat,bodies[0].uid,'store'));w.clientActionHook=undefined;
 hero.pos={x:0,y:0};assert(!w.nearOracle());step('refuse-remote-storage',()=>w.oracleRelic(seat,bodies[1].uid,'store'));
 step('field-equipment-withdrawal',()=>w.withdrawRelic(seat,bodies[1].uid));hero.pos={...w.stationAnchor('oracle')!.pos};
 step('store-ordinary-in-personal-locker',()=>w.personalStash(seat,bodies[6].uid,'store'));
 step('return-ordinary-from-locker',()=>w.personalStash(seat,bodies[6].uid,'take'));
 step('save-and-replay-account-ownership',()=>{const saved=serializeCharacter(w);const result=applySavedCharacter(w,saved);hero.pos={...w.stationAnchor('oracle')!.pos};w.lastCombatAt=-999;return result;});
 step('store-before-full-bag',()=>w.oracleRelic(seat,stored[0].uid,'store'));
 const recovery=Array.from({length:28},()=>mint());for(const item of recovery)bankRelic(w.account,item,w.meta.relicScope!);reconcileRelicStash(w.account);
 const newcomer=mint();assert(autoPlace(w.meta.items,newcomer));
 step('refuse-new-deposit-during-recovery',()=>w.oracleRelic(seat,newcomer.uid,'store'));
 assert(w.meta.items.includes(newcomer),'Recovery refusal must leave the newcomer in its bag');
 step('exchange-existing-reserve-during-recovery',()=>w.containerPlace(seat,'reliquary',recovery[0].uid,1,1));
 // Full destination refusal retains the source body, including account pieces.
 const dimensions=bagBoard();for(let y=0;y<dimensions.h;y++)for(let x=0;x<dimensions.w;x++){const filler=mint('ring_mi_gnoll');autoPlace(w.meta.items,filler);}
 step('withdraw-into-full-bag',()=>w.withdrawRelic(seat,stored[0].uid));
 scenarios.push({variant,bodyIds:bodies.map(item=>item.uid),storedIds:stored.map(item=>item.uid),authority,rows});
}
const out=process.argv[2];fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'relic-actions.json'),JSON.stringify({scenarios})+'\n');
console.log(`Observed ${scenarios.reduce((n,s)=>n+s.authority.length,0)} original access states and ${scenarios.reduce((n,s)=>n+s.rows.length,0)} World action transitions with callback order.`);
