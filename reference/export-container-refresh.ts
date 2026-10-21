import fs from 'node:fs';import path from 'node:path';
import {bootSimEngine} from '../src/sim/arena';import {RELIQUARY} from '../src/data/containers';import {ITEM_BASES} from '../src/data/itembases';import {UNIQUES} from '../src/data/uniques';
import {containerBoardFor,containerCanvas,containerRungAt,containerLanding,seatNeighbourhood,seatAmplification} from '../src/engine/containers';
import {SEAT_AMPLIFIERS,seatPowerOf,amplifySeatMods} from '../src/engine/seatlaw';import {RELIC_SCALABLE,RELIQUARY_CFG} from '../src/data/reliquary';
import {empowerRelicMods,relicUniqueValue} from '../src/engine/relicPower';import {uniqueContainerRefusal} from '../src/engine/itemLimits';
import type {ItemInstance} from '../src/engine/items';import type {Modifier} from '../src/engine/stats';
bootSimEngine();const rows:any[]=[],clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const body=(uid:number,x:number):ItemInstance=>({uid,baseId:'relic_charm',x,y:1,ilvl:1,tier:1,rarity:'magic',name:'Refresh fixture',baseRoll:0,implicitRolls:[],affixes:[],sockets:[]});
const a=body(1,1),b=body(2,2),held=[a,b],mods:Modifier[]=[{stat:'seatPower_outward',kind:'flat',value:.5},{stat:'custom_seat_power',kind:'flat',value:.25},{stat:'damage',kind:'increased',value:1}];
const capture=(name:string)=>{const board=containerBoardFor(RELIQUARY,new Set(RELIQUARY.ladder.map(r=>r.feature)))!,hood=seatNeighbourhood(board,held);rows.push(clone({name,canvas:containerCanvas(RELIQUARY),board,rungAt:containerRungAt(RELIQUARY,1,1)?.feature,
  landing:containerLanding(RELIQUARY,board,[b],a,'bag',1,1,1),neighbours:[...hood].map(([item,n])=>({uid:item.uid,pieces:n.pieces.map(p=>p.uid),empty:n.empty})),
  factors:[...seatAmplification(board,held,()=>mods)].map(([item,n])=>({uid:item.uid,factor:n})),outward:seatPowerOf(mods,'outward'),solitude:seatPowerOf(mods,'solitude'),amplified:amplifySeatMods(mods,2),empowered:empowerRelicMods(mods,3,2),uniqueValue:relicUniqueValue(mods[2])}));};
capture('original');
const oldRow=RELIQUARY.ladder[0].cells;
try{RELIQUARY.ladder[0].cells=['#......'];capture('replaced-frame');}finally{RELIQUARY.ladder[0].cells=oldRow;}capture('restored-frame');
const base=ITEM_BASES.relic_charm,oldWidth=base.w;try{base.w=2;capture('live-width');}finally{base.w=oldWidth;}capture('restored-width');
const mode=SEAT_AMPLIFIERS.seatPower_outward.mode;
try{SEAT_AMPLIFIERS.seatPower_outward.mode='solitude';capture('retuned-mode');SEAT_AMPLIFIERS.custom_seat_power={stat:'custom_seat_power',mode:'outward',label:'Fixture'};capture('added-mode');}
finally{SEAT_AMPLIFIERS.seatPower_outward.mode=mode;delete SEAT_AMPLIFIERS.custom_seat_power;}capture('restored-modes');
const cap=RELIC_SCALABLE.damage,baseline=RELIQUARY_CFG.baseline;
try{RELIC_SCALABLE.damage=2;capture('finite-cap');delete RELIC_SCALABLE.damage;capture('removed-cap');RELIQUARY_CFG.baseline=.5;capture('retuned-baseline');}
finally{RELIC_SCALABLE.damage=cap;RELIQUARY_CFG.baseline=baseline;}capture('restored-caps');
const unique=UNIQUES.hermits_bead,oldLimit=unique.maxPerContainer;a.uniqueId=b.uniqueId=unique.id;
try{for(const limit of [1,2,0]){unique.maxPerContainer=limit;rows.push({name:'unique-limit-'+limit,refusal:uniqueContainerRefusal([a],b),replacement:uniqueContainerRefusal([a],b,a)});}}
finally{unique.maxPerContainer=oldLimit;}rows.push({name:'restored-unique-limit',refusal:uniqueContainerRefusal([a],b)});
const out=process.argv[2];fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'container-refresh.json'),JSON.stringify(rows)+'\n');console.log(`Observed ${rows.length} live container/seat content revisions.`);
