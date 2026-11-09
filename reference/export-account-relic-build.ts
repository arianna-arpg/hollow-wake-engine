// Original-only ownership/build observations. Private fields are read for
// identity evidence; every mutation delegates to the original implementation.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {mulberry32,seedGlobalRandom} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import {forgeItem} from '../src/engine/itemgen';
import {bankRelic,accountRelicBoard,reconcileRelicStash,migrateRelicCarry,loseCarriedRelics} from '../src/engine/accountReliquary';
import {RELIQUARY} from '../src/data/containers';
import {CLASSES} from '../src/data/classes';
import {serializeCharacter,applySavedCharacter} from '../src/meta/character';
import {serializeAccount,deserializeAccount} from '../src/meta/account';
import type {Seat} from '../src/engine/world';
import type {ItemInstance} from '../src/engine/items';

bootSimEngine();
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const restore=seedGlobalRandom(0x7713),rng=mulberry32(0x7713),rows:unknown[]=[];
const ids=new WeakMap<object,number>();let serial=0;
const identity=(value:object|undefined|null)=>{if(!value)return null;if(!ids.has(value))ids.set(value,++serial);return ids.get(value);};
try{
 let w=makeSimWorld('magician',0x7713);
 const setup=()=>{w.meta.modeId='immortal';w.meta.charId='account-build';w.meta.relicScope='account-build';
  for(const rung of RELIQUARY.ladder)w.account.features.add(rung.feature);};setup();
 w.meta.items=[];w.meta.equipped={};w.meta.containers={};
 const mint=(uniqueId:string,x:number,y:number)=>{
  const item=forgeItem({uniqueId,ilvl:30,quality:1,rng})!;assert(item);
  assert.equal(bankRelic(w.account,item,'account-build'),item);item.x=x;item.y=y;return item;
 };
 const bead=mint('hermits_bead',1,1),stone=mint('lodestone',1,2),crown=mint('reliquary_crown',2,0);
 const initial=[bead,stone,crown];
 w.account.reliquary.seated=initial.map(i=>i.relicKey!).reverse();reconcileRelicStash(w.account);
 const projection=(items:readonly ItemInstance[])=>items.map(item=>({uid:item.uid,key:item.relicKey,identity:identity(item),
  canonical:w.account.reliquary.items.indexOf(item),body:copy(item)}));
 const observe=(label:string,seat:Seat=w.localSeat)=>{
  w.recalcSeat(seat);const hero=w.seatHero(seat),m=seat.meta,saved=serializeCharacter(w);
  const grants=(w as any).companionGrants.owners.get(hero) as Map<string,any>|undefined;
  rows.push(copy({label,local:seat===w.localSeat,client:!!w.clientActionHook,
   authority:{actor:identity(seat.actor),hero:identity(hero),power:m.relicEmpowerment,enabled:m.relicEnabled,suppressed:hero.relicEffectsSuppressed},
   raw:{classId:m.classDef.id,baseAttrs:m.baseAttrs,allocated:[...m.allocated],choices:m.choices,relicScope:m.relicScope},
   account:serializeAccount(w.account).reliquary,accountBoard:projection(accountRelicBoard(w.account)),
   bag:projection(m.items),board:projection(m.containers.reliquary??[]),
   attributes:m.attrs,sources:hero.sheet.sourceNames().map(id=>[id,hero.sheet.getSourceMods(id)]),
   reads:Object.fromEntries(['life','mana','damage','armor','accuracy','companiongrant_summon_stone_golem'].map(id=>[id,hero.sheet.get(id)])),
   companions:[...(grants??[])].map(([id,row])=>({id,instance:identity(row.inst),level:row.inst.level,
    source:row.inst.grantedBy,relicKey:row.inst.relicSource,remaining:row.remaining,
    body:row.body?{identity:identity(row.body),dead:row.body.dead,owner:identity(row.body.owner),life:row.body.life,maxLife:row.body.maxLife()}:null})),
   character:{accountRelics:saved.accountRelics,relicScope:saved.relicScope,classId:saved.classId,level:saved.level,baseAttrs:saved.baseAttrs,
    items:saved.items,equipped:saved.equipped,containers:saved.containers,bar:saved.bar},
  }));
 };
 w.restoreAccountRelics(w.localSeat);observe('canonical-order-despite-reversed-seated-keys');
 w.account.reliquary.seated.reverse();w.restoreAccountRelics(w.localSeat);observe('seated-key-order-does-not-reorder-bodies');
 w.account.reliquary.items.reverse();w.restoreAccountRelics(w.localSeat);observe('canonical-body-order-changes-projection');
 w.account.reliquary.items.reverse();w.restoreAccountRelics(w.localSeat);observe('canonical-order-restored');
 w.account.reliquary.rank=4;observe('account-power');
 w.account.reliquary.enabled=false;observe('account-disabled');
 w.account.reliquary.enabled=true;w.player.relicEffectsSuppressed=true;observe('hero-suppressed');
 w.player.relicEffectsSuppressed=false;observe('hero-restored');
 const echo=copy(bead);echo.name='stale character echo';echo.uniqueRolls=echo.uniqueRolls!.map(()=>0);
 assert.equal(bankRelic(w.account,echo,'stale'),bead);assert.notEqual(bead.name,echo.name);observe('stale-body-cannot-replace-account');
 w.account.reliquary.seated=w.account.reliquary.seated.filter(key=>key!==bead.relicKey);
 w.account.reliquary.carried=[bead.relicKey!];bead.x=0;bead.y=0;
 migrateRelicCarry(w.account,w.meta,'account-build',false);observe('carried-canonical-body-excluded-from-character-save');
 w.account.reliquary.carried=[];w.meta.items=[];w.account.reliquary.seated.push(bead.relicKey!);bead.x=1;bead.y=1;
 w.restoreAccountRelics(w.localSeat);observe('reseated-canonical-body');
 // A real authored companion grant, distinct from item-resident skill grants.
 w.account.reliquary.seated=[];w.meta.containers.reliquary=[];for(const item of initial){delete item.x;delete item.y;}
 const idol=mint('unquarried_idol',0,0);w.account.reliquary.seated=[idol.relicKey!];w.restoreAccountRelics(w.localSeat);
 observe('authored-companion-grant');(w as any).updateCompanionGrants(0);observe('original-companion-spawn');
 const grant=(w as any).companionGrants.owners.get(w.player).get('summon_stone_golem');assert(grant.body);
 grant.body.life*=.4;w.account.reliquary.rank=7;observe('warm-companion-refresh-retains-body');
 w.account.reliquary.enabled=false;observe('disabled-companion-retires');
 w.account.reliquary.enabled=true;observe('reenabled-companion-new-instance');(w as any).updateCompanionGrants(0);observe('reenabled-companion-spawn');
 const guest=w.addSeat('guest',CLASSES.find(c=>c.id==='warrior')!,w.localSeat.input,{startingCompanions:false,startingFlasks:false});
 guest.meta.items=[];guest.meta.equipped={};guest.meta.containers={};
 w.account.reliquary.enabled=false;observe('guest-does-not-borrow-account-power',guest);w.account.reliquary.enabled=true;
 w.clientActionHook=()=>{};w.meta.relicEmpowerment=2.5;w.meta.relicEnabled=false;observe('client-retains-replicated-context');w.clientActionHook=undefined;
 observe('host-reclaims-account-context');
 const home=w.player,borrowed=new Actor('Borrowed body','player',{...home.pos});borrowed.level=33;
 const borrowedSources=JSON.stringify(borrowed.sheet.sourceNames().map(id=>[id,borrowed.sheet.getSourceMods(id)]));
 w.localSeat.home=home;w.localSeat.actor=borrowed;observe('possessed-build-and-save-belong-to-home');
 assert.equal(JSON.stringify(borrowed.sheet.sourceNames().map(id=>[id,borrowed.sheet.getSourceMods(id)])),borrowedSources);
 w.localSeat.actor=home;w.localSeat.home=undefined;w.removeSeat('guest');
 const character=serializeCharacter(w),account=serializeAccount(w.account),restored=deserializeAccount(account);assert(restored);
 w=makeSimWorld('magician',0x7713);Object.assign(w.account,restored);setup();assert(applySavedCharacter(w,character));
 observe('cold-account-and-character-resume');(w as any).updateCompanionGrants(0);observe('cold-companion-spawn');
 assert(w.meta.containers.reliquary.every(item=>w.account.reliquary.items.includes(item)));
 const current=w.account.reliquary.items.find(item=>item.relicKey===bead.relicKey)!;assert(current);
 const blocker=forgeItem({baseId:'helmet_armor',ilvl:1,rarity:'common',quality:1,rng})!;assert(blocker);
 blocker.uid=current.uid;blocker.x=0;blocker.y=0;w.meta.items=[blocker];
 const previousUid=current.uid;w.restoreAccountRelics(w.localSeat);assert.equal(current.uid,previousUid);assert(!w.meta.items.includes(blocker));
 observe('same-scope-address-is-treated-as-legacy-echo');
 w.meta.relicScope='collision-vessel';w.meta.items=[blocker];w.restoreAccountRelics(w.localSeat);assert.notEqual(current.uid,previousUid);
 assert(w.meta.items.includes(blocker));
 observe('account-uid-collision-keeps-key-and-body');
 w.account.reliquary.carried=[current.relicKey!];current.x=2;current.y=0;
 migrateRelicCarry(w.account,w.meta,'collision-vessel',false);observe('canonical-carry-before-loss');
 assert.equal(loseCarriedRelics(w.account,w.meta.items,'collision-vessel'),1);
 migrateRelicCarry(w.account,w.meta,'collision-vessel',false);assert.equal(bankRelic(w.account,copy(current),'stale'),undefined);
 observe('released-key-cannot-be-resurrected');
 assert.equal(rows.length,27);
 writeFileSync(process.argv[2],JSON.stringify({scope:'original-account-relic-build/v1',rows}),{flag:'wx'});
}finally{restore();}
