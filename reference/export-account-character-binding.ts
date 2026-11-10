// Original-only character selection and canonical account projection course.
import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {mulberry32,seedGlobalRandom} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';import {forgeItem} from '../src/engine/itemgen';
import {bankRelic,accountRelicBoard,reconcileRelicStash,loseCarriedRelics} from '../src/engine/accountReliquary';
import {RELIQUARY} from '../src/data/containers';import {CLASSES} from '../src/data/classes';
import {serializeCharacter,applySavedCharacter} from '../src/meta/character';
import {serializeAccount} from '../src/meta/account';import type {Seat} from '../src/engine/world';
import {setContainerBoardSource,containerBoardFor} from '../src/engine/containers';
import type {ItemInstance} from '../src/engine/items';
bootSimEngine();const restore=seedGlobalRandom(0x7716),rng=mulberry32(0x7716),copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const rows:unknown[]=[],ids=new WeakMap<object,number>();let serial=0;
const identity=(v:object|undefined|null)=>{if(!v)return null;if(!ids.has(v))ids.set(v,++serial);return ids.get(v);};
try{
 const w=makeSimWorld('magician',0x7716);w.walk=null;w.meta.modeId='immortal';w.meta.charId='vessel-a';w.meta.relicScope='vessel-a';
 w.meta.items=[];w.meta.equipped={};w.meta.containers={};
 for(const rung of RELIQUARY.ladder)w.account.features.add(rung.feature);
 const mint=(id:string,x:number,y:number)=>{const item=forgeItem({uniqueId:id,ilvl:30,quality:1,rng})!;assert(item);assert.equal(bankRelic(w.account,item,'vessel-a'),item);item.x=x;item.y=y;return item;};
 const bead=mint('hermits_bead',1,1),idol=mint('unquarried_idol',0,0);
 w.account.reliquary.seated=[idol.relicKey!,bead.relicKey!];w.account.reliquary.rank=4;reconcileRelicStash(w.account);
 const projection=(items:readonly ItemInstance[])=>items.map(item=>({identity:identity(item),key:item.relicKey,uid:item.uid,canonical:w.account.reliquary.items.indexOf(item),body:copy(item)}));
 const observe=(label:string,seat:Seat=w.localSeat,input?:unknown)=>{
  w.recalcSeat(seat);const hero=w.seatHero(seat),save=serializeCharacter(w);
  rows.push(copy({label,input,local:seat===w.localSeat,client:!!w.clientActionHook,
   hero:{id:identity(hero),actor:identity(seat.actor),level:hero.level},
   character:{id:seat.meta.charId,scope:seat.meta.relicScope,classId:seat.meta.classDef.id,level:hero.level,baseAttrs:seat.meta.baseAttrs},
   power:seat.meta.relicEmpowerment,enabled:seat.meta.relicEnabled,suppressed:hero.relicEffectsSuppressed,
   account:serializeAccount(w.account).reliquary,canonicalBoard:projection(accountRelicBoard(w.account)),
   bag:projection(seat.meta.items),board:projection(seat.meta.containers.reliquary??[]),equipped:copy(seat.meta.equipped),
   attributes:seat.meta.attrs,sources:hero.sheet.sourceNames().map(id=>[id,hero.sheet.getSourceMods(id)]),
   saved:{items:save.items,equipped:save.equipped,containers:save.containers,relicScope:save.relicScope,accountRelics:save.accountRelics}}));
 };
 w.restoreAccountRelics(w.localSeat);observe('a-canonical-board-order');
 w.account.reliquary.seated=[idol.relicKey!];w.account.reliquary.carried=[bead.relicKey!];bead.x=0;bead.y=0;
 w.restoreAccountRelics(w.localSeat);observe('a-canonical-carry-and-board');
 const saveA=serializeCharacter(w);assert(saveA.items);assert(!saveA.items.some(item=>item.relicKey));assert(!Object.values(saveA.containers??{}).flat().some(item=>item.relicKey));
 const guest=w.addSeat('guest',CLASSES.find(c=>c.id==='warrior')!,w.localSeat.input,{startingCompanions:false,startingFlasks:false});
 guest.meta.items=[];guest.meta.equipped={};guest.meta.containers={};guest.meta.relicEmpowerment=99;guest.meta.relicEnabled=false;
 const untouched=JSON.stringify(serializeAccount(w.account));w.restoreAccountRelics(guest);observe('guest-cannot-project-account',guest);assert.equal(JSON.stringify(serializeAccount(w.account)),untouched);
 w.removeSeat('guest');
 w.clientActionHook=()=>{};w.meta.relicEmpowerment=2.5;w.meta.relicEnabled=false;
 w.restoreAccountRelics(w.localSeat);observe('client-retains-replicated-context');assert.equal(JSON.stringify(serializeAccount(w.account)),untouched);
 w.clientActionHook=undefined;observe('host-reclaims-account-context');
 const b=makeSimWorld('warrior',0x7717);b.meta.modeId='immortal';b.meta.charId='vessel-b';b.meta.relicScope='vessel-b';
 b.meta.items=[];b.meta.equipped={};b.meta.containers={};
 const ordinary=forgeItem({baseId:'helmet_armor',rarity:'common',ilvl:1,quality:1,rng})!;assert(ordinary);
 ordinary.uid=bead.uid;ordinary.x=0;ordinary.y=0;b.meta.items=[ordinary];const saveB=serializeCharacter(b),oldKey=bead.relicKey,oldUid=bead.uid;
 const inputB={items:copy(saveB.items),containers:copy(saveB.containers),relicScope:saveB.relicScope,account:copy(serializeAccount(w.account).reliquary)};
 // Creating b installs its global board lookup. Select the observed host again.
 setContainerBoardSource(def=>containerBoardFor(def,w.account.features));
 assert(applySavedCharacter(w,saveB));observe('b-adoption-readdresses-account-collision',w.localSeat,inputB);
 assert.equal(bead.relicKey,oldKey);assert.notEqual(bead.uid,oldUid);assert(w.meta.items.some(i=>!i.relicKey&&i.uid===oldUid));
 assert(w.meta.items.includes(bead));assert(w.meta.containers.reliquary.includes(idol));
 assert.equal(new Set([...w.meta.items,...w.account.reliquary.items.filter(i=>!w.meta.items.includes(i))].map(i=>i.uid)).size,w.meta.items.length+w.account.reliquary.items.filter(i=>!w.meta.items.includes(i)).length);
 const bBeforeReturn=serializeCharacter(w);assert(applySavedCharacter(w,saveA));observe('a-adoption-keeps-account-body-and-new-address');
 const accountBeforeRepeat=JSON.stringify(serializeAccount(w.account));assert(applySavedCharacter(w,saveA));observe('a-repeated-adoption-does-not-rewrite-account');assert.equal(JSON.stringify(serializeAccount(w.account)),accountBeforeRepeat);
 w.account.reliquary.enabled=false;observe('disabled-account-retains-projection');w.account.reliquary.enabled=true;
 const home=w.player,borrowed=new Actor('borrowed','player',{...home.pos});borrowed.level=33;
 const borrowedBefore=JSON.stringify(borrowed.sheet.sourceNames().map(id=>[id,borrowed.sheet.getSourceMods(id)]));w.localSeat.home=home;w.localSeat.actor=borrowed;
 observe('possessed-authority-and-build-belong-to-home');assert.equal(JSON.stringify(borrowed.sheet.sourceNames().map(id=>[id,borrowed.sheet.getSourceMods(id)])),borrowedBefore);
 w.localSeat.actor=home;w.localSeat.home=undefined;
 assert.equal(loseCarriedRelics(w.account,w.meta.items,'vessel-a'),1);w.restoreAccountRelics(w.localSeat);observe('released-key-removes-canonical-carry');
 assert(applySavedCharacter(w,bBeforeReturn));observe('stale-other-character-cannot-resurrect-release');assert(!w.account.reliquary.items.some(i=>i.relicKey===oldKey));assert(!w.meta.items.some(i=>i.relicKey===oldKey));
 writeFileSync(process.argv[2],JSON.stringify({scope:'original-account-character-binding/v1',rows}),{flag:'wx'});
}finally{restore();}
