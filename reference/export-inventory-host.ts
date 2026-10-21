import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {makeSimWorld,bootSimEngine} from '../src/sim/arena';
import {mulberry32} from '../src/sim/rng';
import {ITEM_BASES} from '../src/data/itembases';
import {forgeItem} from '../src/engine/itemgen';
import {autoPlace,placeAt,canPlaceAt,bagItemAt,overlappingItems,swapBlockerFits,bagBoard} from '../src/engine/inventory';
import {RELIQUARY} from '../src/data/containers';
import {FEATURE} from '../src/meta/account';
import {serializeCharacter,applySavedCharacter} from '../src/meta/character';
import type {ItemInstance} from '../src/engine/items';
bootSimEngine();
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const bases=[[1,1],[1,2],[2,1],[2,2],[2,3]].map(([w,h])=>Object.values(ITEM_BASES).find(b=>b.w===w&&b.h===h)!.id);
const rng=mulberry32(771581),pick=(n:number)=>Math.floor(rng()*n),queries:any[]=[];
const make=(uid:number,baseId:string,x?:number,y?:number):ItemInstance=>({uid,baseId,x,y,ilvl:1,tier:1,rarity:'common',name:'Host fixture',baseRoll:.5,implicitRolls:[],affixes:[],sockets:[]});
for(let n=0;n<1400;n++){
 const w=1+pick(12),h=1+pick(12),mask=Array.from({length:h},()=>Array.from({length:w},()=>rng()<.18?'.':'#').join(''));
 const board={w,h,...(n%3?{open:(x:number,y:number)=>mask[y]?.[x]==='#'}:{})};
 const bag=Array.from({length:pick(32)},(_,i)=>make(i+1,bases[pick(bases.length)],rng()<.12?undefined:pick(w+4)-2,rng()<.12?undefined:pick(h+4)-2));
 if(bag.length>2&&n%9===0)bag[2].uid=bag[0].uid;
 const existing=bag.length&&n%2===0?pick(bag.length):-1,item=existing>=0?bag[existing]:make(100,bases[pick(bases.length)],pick(w),pick(h));
 const x=pick(w+2)-1,y=pick(h+2)-1,before=clone(bag),itemBefore=clone(item),at=bagItemAt(bag,x,y),over=overlappingItems(bag,item,x,y),swap=swapBlockerFits(bag,item,x,y,board),can=canPlaceAt(bag,item,x,y,board);
 assert.deepEqual(clone(bag),before,'Queries mutated original inputs');
 const placed=placeAt(bag,item,x,y,board),afterPlace=clone(bag);
 const fitted=autoPlace(bag,item,board);
 queries.push(clone({board:{w,h,rows:board.open?mask:undefined},before,itemBefore,existing,x,y,
  at:at?bag.indexOf(at):-1,atUid:at?.uid,over:over.map(i=>bag.indexOf(i)),swap:swap?bag.indexOf(swap):-1,can,placed,afterPlace,fitted,afterFit:bag,itemAfter:item}));
}
// A live footprint edit is read from the raw registry on the next operation.
const dynamic=make(600,bases[0],0,0),probe=make(601,bases[0]);const def=ITEM_BASES[dynamic.baseId],width=def.w;
const revisions:any[]=[];
for(const next of [width,Math.min(3,width+1),width]){def.w=next;const bag=[{...dynamic}],incoming={...probe};revisions.push({width:next,result:autoPlace(bag,incoming,{w:5,h:2}),items:clone(bag)});}def.w=width;

const world=makeSimWorld('warrior',28171);for(const rung of RELIQUARY.ladder)world.account.features.add(rung.feature);
world.account.features.add(FEATURE.ORACLE_STONE);world.account.ledger.oracle_rescued=1;world.meta.modeId='immortal';world.meta.charId='inventory-host-fixture';
const home=()=>{world.loadZone('lastlight');world.player.pos={...world.stationAnchor('oracle')!.pos};world.player.invulnerable=true;world.lastCombatAt=-999;};home();
const known=new Map<number,ItemInstance>(),rows:any[]=[],forgeRng=mulberry32(28171);
const mint=(baseId:string)=>{const item=forgeItem({baseId,ilvl:1,rarity:'magic',affixes:baseId==='relic_charm'?[{id:'relic_life'}]:[],quality:1,rng:forgeRng})!;known.set(item.uid,item);return item;};
const snapshot=()=>clone({bag:world.meta.items,equipped:world.meta.equipped,containers:world.meta.containers,stash:world.meta.stash,
 accountItems:world.account.reliquary.items,accountStash:world.account.reliquary.stash,carried:world.account.reliquary.carried,seated:world.account.reliquary.seated,
 life:world.player.maxLife(),openRungs:RELIQUARY.ladder.filter(r=>world.account.features.has(r.feature)).map(r=>r.feature),knownIdentity:world.meta.items.filter(i=>known.has(i.uid)).map(i=>[i.uid,i===known.get(i.uid)]),
 activeIdentity:(world.meta.containers.reliquary??[]).map(i=>[i.uid,world.account.reliquary.items.includes(i)])});
function step(name:string,action:()=>unknown){const result=action();rows.push(clone({name,result,state:snapshot()}));}
const a=mint('relic_charm'),b=mint('relic_charm'),gear=mint('helmet_armor');
step('insert-two-relics-and-gear',()=>[autoPlace(world.meta.items,a),autoPlace(world.meta.items,b),autoPlace(world.meta.items,gear)]);
step('seat-first',()=>world.containerPlace(world.localSeat,'reliquary',a.uid,1,1));
step('masked-seat-refusal',()=>{for(const rung of RELIQUARY.ladder.slice(1))world.account.features.delete(rung.feature);world.containerPlace(world.localSeat,'reliquary',b.uid,2,1);});
step('reopen-container',()=>{for(const rung of RELIQUARY.ladder)world.account.features.add(rung.feature);});
step('replace-seat-with-bag-return',()=>world.containerPlace(world.localSeat,'reliquary',b.uid,1,1));
step('move-active-piece',()=>world.containerMove(world.localSeat,'reliquary',b.uid,2,1));
step('withdraw-to-exact-cell',()=>world.containerTake(world.localSeat,'reliquary',b.uid,5,5));
step('external-array-and-coordinate-replacement',()=>{world.meta.items=[...world.meta.items];const live=world.meta.items.find(i=>i.uid===a.uid)!;live.x=8;live.y=8;world.moveBagItem(world.localSeat,b.uid,8,8);});
step('personal-stash-store',()=>world.personalStash(world.localSeat,gear.uid,'store'));
step('personal-stash-take',()=>world.personalStash(world.localSeat,gear.uid,'take'));
step('account-store',()=>world.oracleRelic(world.localSeat,a.uid,'store'));
step('account-equip',()=>world.oracleRelic(world.localSeat,a.uid,'equip'));
step('account-unseat',()=>world.oracleRelic(world.localSeat,a.uid,'unseat'));
step('save-and-restore',()=>{const saved=serializeCharacter(world);const ok=applySavedCharacter(world,saved);home();return ok;});
step('store-before-full-bag',()=>world.personalStash(world.localSeat,gear.uid,'store'));
step('fill-bag-through-external-writes',()=>{world.meta.items=[];const board=bagBoard();for(let y=0;y<board.h;y++)for(let x=0;x<board.w;x++)world.meta.items.push(make(10000+y*board.w+x,bases[0],x,y));});
step('full-bag-withdrawal-refused',()=>world.personalStash(world.localSeat,gear.uid,'take'));
step('replace-bag-then-withdraw',()=>{world.meta.items=[];world.personalStash(world.localSeat,gear.uid,'take');});
step('guest-stash-refused',()=>world.personalStash({...world.localSeat,id:'guest'},gear.uid,'store'));
assert(rows.find(r=>r.name==='seat-first').state.life>rows[0].state.life,'Fixture must exercise active relic power');
assert(rows.find(r=>r.name==='full-bag-withdrawal-refused').state.stash.items.some((i:ItemInstance)=>i.uid===gear.uid));
assert(world.meta.items.some(i=>i.uid===gear.uid));
const out=process.argv[2];fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'inventory-host.json'),JSON.stringify({queries,revisions,rows})+'\n');
console.log(`Observed ${queries.length} live inventory cases, ${revisions.length} footprint revisions and ${rows.length} complete game transitions.`);
