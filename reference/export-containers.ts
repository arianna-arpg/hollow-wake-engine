import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';import {mulberry32} from '../src/sim/rng';
import * as C from '../src/engine/containers';import * as S from '../src/engine/seatlaw';import * as R from '../src/engine/relicPower';
import {uniqueContainerLimit,uniqueContainerRefusal} from '../src/engine/itemLimits';
import {ITEM_BASES} from '../src/data/itembases';import {UNIQUES} from '../src/data/uniques';import {RELIC_SCALABLE,RELIQUARY_CFG} from '../src/data/reliquary';
import {RELIQUARY} from '../src/data/containers';import {itemLevelReq,forgeItem} from '../src/engine/itemgen';import {autoPlace} from '../src/engine/inventory';
import {serializeCharacter,applySavedCharacter} from '../src/meta/character';
import type {ItemInstance} from '../src/engine/items';import type {Modifier} from '../src/engine/stats';
bootSimEngine();
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value)),rng=mulberry32(637681),pick=(n:number)=>Math.floor(rng()*n);
const make=(uid:number,baseId:string,x?:number,y?:number):ItemInstance=>({uid,baseId,x,y,tier:1+pick(8),ilvl:20,rarity:'magic',name:'Container fixture',baseRoll:.5,implicitRolls:[],affixes:[],sockets:[]});
const authored={containers:clone(C.containerList()),amplifiers:clone(S.SEAT_AMPLIFIERS),relicCaps:Object.entries(RELIC_SCALABLE).map(([stat,cap])=>({stat,cap:Number.isFinite(cap)?cap:null})),relicBaseline:RELIQUARY_CFG.baseline,
 bases:Object.fromEntries(Object.entries(ITEM_BASES).map(([id,b])=>[id,{category:b.category,tags:b.tags,w:b.w,h:b.h}])),
 uniques:Object.fromEntries(Object.entries(UNIQUES).map(([id,u])=>[id,{name:u.name,baseId:u.baseId,maxPerContainer:u.maxPerContainer}])),
 tierRequirements:Array.from({length:8},(_,i)=>itemLevelReq({...make(-1,'helmet_armor'),tier:i+1}))};
const definitions:C.ContainerDef[]=[...clone(C.containerList())];
for(let n=0;n<80;n++){
 const ladder=Array.from({length:1+pick(5)},(_,i)=>({feature:`fixture:${n}:${i}`,label:`Rung ${i}`,description:'fixture',cost:i*10,
  cells:Array.from({length:1+pick(7)},()=>Array.from({length:1+pick(7)},()=>rng()<.45?'#':'.').join(''))}));
 ladder[0].cells[0]='#'+ladder[0].cells[0].slice(1);
 definitions.push({id:'fixture:'+n,label:'Fixture',glyph:'',icon:'',blurb:'',active:n%2===0,accountStorage:n%3===0,levelGate:n%4!==0,
  accepts:n%3===0?{categories:['relic']}:n%3===1?{tags:['armor','weapon']}:{categories:['helmet','ring'],tags:['relic']},ladder});
}
const layouts:any[]=[];
for(let d=0;d<definitions.length;d++){
 const def=definitions[d],canvas=C.containerCanvas(def),full=C.containerFullBoard(def),rungAt=[];
 for(let y=-1;y<=canvas.h;y++)for(let x=-1;x<=canvas.w;x++)rungAt.push({x,y,rung:def.ladder.indexOf(C.containerRungAt(def,x,y)!)});
 const combinations=1<<def.ladder.length,rows=[];
 for(let mask=0;mask<combinations;mask++){
  const features=def.ladder.filter((_,i)=>mask&(1<<i)).map(r=>r.feature),board=C.containerBoardFor(def,new Set(features));
  rows.push({features,board,wire:board?C.packContainerBoard(board):null,roundtrip:board?C.unpackContainerBoard(C.packContainerBoard(board)):null});
 }
 layouts.push({definition:d,canvas,full,rungAt,rows});
}
const baseIds=['relic_charm','relic_talisman','relic_idol','relic_effigy','helmet_armor','ring_mi_gnoll','missing-base'];
const uniqueIds=Object.values(UNIQUES).filter(u=>u.maxPerContainer!==undefined).map(u=>u.id),queries:any[]=[];
for(let n=0;n<2000;n++){
 const d=pick(definitions.length),def=definitions[d],features=def.ladder.filter(()=>rng()<.7).map(r=>r.feature),board=C.containerBoardFor(def,new Set(features));
 const held=Array.from({length:pick(12)},(_,i)=>make(i+1,baseIds[pick(baseIds.length)],rng()<.1?undefined:pick(9)-1,rng()<.1?undefined:pick(9)-1));
 for(const it of held)if(rng()<.5)it.uniqueId=uniqueIds[pick(uniqueIds.length)];
 if(held.length>2&&n%11===0)held[2].uid=held[0].uid;
 const incomingIndex=held.length&&n%3===0?pick(held.length):-1,item=incomingIndex>=0?held[incomingIndex]:make(100,baseIds[pick(baseIds.length)],pick(4),pick(4));
 if(incomingIndex<0&&n%2===0)item.uniqueId=uniqueIds[pick(uniqueIds.length)];
 const from=(['bag','self','other'] as const)[n%3],x=pick(9)-1,y=pick(9)-1,level=pick(30),bag=[make(101,'relic_charm',1,0),item],bagBoard={w:4,h:4};
 const before=clone({held,item,bag,def,board}),landing=C.containerLanding(def,board,held,item,from,x,y,level,n%5?bag:undefined,n%5?bagBoard:undefined);
 const misfits=C.containerMisfits(board,held),limit=uniqueContainerLimit(item),refusal=uniqueContainerRefusal(held,item),replaceRefusal=uniqueContainerRefusal(held,item,held[0]);
 assert.deepEqual(clone({held,item,bag,def,board}),before,'Original container queries mutated their inputs');
 const carry={items:n%2?bag:[],equipped:{left:held[0]},containers:{first:held.slice(1),second:held}},found=C.findCarried(carry,item.uid);
 queries.push(clone({definition:d,features,held,item,incomingIndex,from,x,y,level,bag,withBag:n%5!==0,bagBoard,
  result:{accepts:C.containerAccepts(def,item),seatRefusal:C.containerSeatRefusal(def,board,item,level),landing:{...landing,with:undefined,withIndex:landing.with?held.indexOf(landing.with):-1},misfits:misfits.map(it=>held.indexOf(it)),limit:limit??null,refusal,replaceRefusal,
   origin:C.containerOriginOf(carry,item.uid),found:found?{uid:found.item.uid,where:found.where}:null}}));
}
const kinds:Modifier['kind'][]=['flat','increased','more','override'],stats=['life','damage','castSpeed','unknown-stat','seatPower_outward','seatPower_solitude','seatPower_communion','seatPower_unknown'];
const seats:any[]=[];
for(let n=0;n<600;n++){
 const d=pick(definitions.length),def=definitions[d],features=def.ladder.filter((_,i)=>i===0||rng()<.7).map(r=>r.feature),board=C.containerBoardFor(def,new Set(features))!;
 const items=Array.from({length:pick(14)},(_,i)=>make(i+1,baseIds[pick(baseIds.length)],n%17===0?undefined:pick(board.w+2)-1,n%19===0?undefined:pick(board.h+2)-1));
 if(items.length>2&&n%13===0)items[2].uid=items[0].uid;
 const mods:Modifier[][]=items.map(()=>Array.from({length:1+pick(10)},(_,i)=>({stat:stats[pick(stats.length)],kind:kinds[pick(kinds.length)],value:(pick(31)-10)/10,...(i%7===0?{fromStat:'mana'}:{})})));
 const before=clone({board,items,mods}),hood=C.seatNeighbourhood(board,items),amps=C.seatAmplification(board,items,it=>mods[items.indexOf(it)]);
 const power=(pick(41)-10)/10,results=items.map((it,i)=>{const factor=amps.get(it)!;return {neighbours:hood.get(it)!.pieces.map(p=>items.indexOf(p)),empty:hood.get(it)!.empty,factor,
  raw:['outward','solitude','communion'].map(mode=>S.seatPowerOf(mods[i],mode as S.SeatAmplifierMode)),amplified:S.amplifySeatMods(mods[i],factor),empowered:R.empowerRelicMods(mods[i],power,factor),numeric:mods[i].map(R.relicNumeric),uniqueValues:mods[i].map(R.relicUniqueValue)};});
 assert.deepEqual(clone({board,items,mods}),before,'Original seat queries mutated their inputs');
 seats.push(clone({definition:d,features,items,mods,power,results}));
}
// Explicit original observations at cap/tradeoff/feedback boundaries, including
// every authored scalable stat. Infinity is encoded as cap:null in authored data.
const powerCases:any[]=[];
for(const [stat,cap] of Object.entries(RELIC_SCALABLE))for(const kind of kinds){
 const mods:Modifier[]=[{stat,kind,value:.25},{stat,kind,value:-.25},{stat,kind,value:0},{stat,kind,value:Number.isFinite(cap)?cap*2:1e6},{stat,kind,value:1,fromStat:'life'}];
 for(const power of [-1,0,.5,100])for(const seatFactor of [-1,0,1,2])powerCases.push({mods,power,seatFactor,result:R.empowerRelicMods(mods,power,seatFactor),numeric:mods.map(R.relicNumeric),uniqueValues:mods.map(R.relicUniqueValue)});
}
const world=makeSimWorld('warrior',56397),forgeRng=mulberry32(56397);for(const rung of RELIQUARY.ladder)world.account.features.add(rung.feature);
world.account.features.add('oracle_stone');world.account.ledger.oracle_rescued=1;world.meta.modeId='immortal';world.meta.charId='container-policy-fixture';
const home=()=>{world.loadZone('lastlight');world.player.pos={...world.stationAnchor('oracle')!.pos};world.lastCombatAt=-999;world.player.invulnerable=true;};home();
const crown=forgeItem({uniqueId:'reliquary_crown',ilvl:20,quality:1,rng:forgeRng})!,hermit=forgeItem({uniqueId:'hermits_bead',ilvl:20,quality:1,rng:forgeRng})!,charm=forgeItem({baseId:'relic_charm',ilvl:1,rarity:'magic',affixes:[{id:'relic_life'}],quality:1,rng:forgeRng})!;
const rows:any[]=[],snapshot=()=>clone({bag:world.meta.items,containers:world.meta.containers,reliquary:world.account.reliquary,attrs:world.meta.attrs,
 stats:Object.fromEntries(['life','mana','armor','damage','castSpeed','seatPower_outward','seatPower_solitude'].map(id=>[id,world.player.sheet.get(id)])),
 activeIdentity:(world.meta.containers.reliquary??[]).map(i=>[i.uid,world.account.reliquary.items.includes(i)])});
const step=(name:string,action:()=>unknown)=>{const result=action();rows.push(clone({name,result,state:snapshot()}));};
step('bagged-pieces-inert',()=>[autoPlace(world.meta.items,crown),autoPlace(world.meta.items,hermit),autoPlace(world.meta.items,charm)]);
step('seat-crown',()=>world.containerPlace(world.localSeat,'reliquary',crown.uid,1,1));
step('seat-life-charm',()=>world.containerPlace(world.localSeat,'reliquary',charm.uid,0,1));
step('seat-hermit-beside-crown',()=>world.containerPlace(world.localSeat,'reliquary',hermit.uid,3,1));
step('move-hermit-to-solitude',()=>world.containerMove(world.localSeat,'reliquary',hermit.uid,4,4));
step('account-empowerment',()=>{world.account.reliquary.rank=25;world.recalcPlayer();});
step('suppress-form',()=>{world.player.relicEffectsSuppressed=true;world.recalcPlayer();});
step('restore-form',()=>{world.player.relicEffectsSuppressed=false;world.recalcPlayer();});
step('disable-account-equipment',()=>{world.account.reliquary.enabled=false;world.recalcPlayer();});
step('reenable-account-equipment',()=>{world.account.reliquary.enabled=true;world.recalcPlayer();});
step('save-and-restore',()=>{const save=serializeCharacter(world),ok=applySavedCharacter(world,save);home();return ok;});
step('retune-to-first-cell',()=>{for(const rung of RELIQUARY.ladder.slice(1))world.account.features.delete(rung.feature);world.reconcileContainers(world.localSeat);world.recalcPlayer();});
assert(rows[2].state.stats.life>rows[0].state.stats.life,'World fixture must exercise actual relic contributions');
assert.equal(rows[6].state.stats.life,rows[0].state.stats.life,'Suppression must remove relic contributions');
const out=process.argv[2];fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'containers.json'),JSON.stringify({authored,definitions,layouts,queries,seats,powerCases,rows})+'\n');
console.log(`Observed ${layouts.length} original ladders, ${queries.length} landing queries, ${seats.length} neighbourhoods, ${powerCases.length} power cases and ${rows.length} World transitions.`);
