import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {bootSimEngine} from '../src/sim/arena';
import {mulberry32} from '../src/sim/rng';
import type {Account} from '../src/meta/account';
import type {ItemInstance} from '../src/engine/items';
import type {DeathRecord} from '../src/meta/death';
import * as R from '../src/engine/accountReliquary';
import * as M from '../src/meta/reliquary';
import {RELIQUARY_CFG} from '../src/data/reliquary';
import {RELIC_STASH} from '../src/data/stashes';
import {ITEM_BASES} from '../src/data/itembases';
import {nextItemUid,bumpItemUidFloor,itemGridSize} from '../src/engine/itemgen';
import {setBagBoardSource} from '../src/engine/inventory';

bootSimEngine();
const copy=<T>(v:T):T=>structuredClone(v);
const wire=(v:unknown):any=>JSON.parse(JSON.stringify(v));
const rng=mulberry32(160014),pick=(n:number)=>Math.floor(rng()*n);
const bases=['relic_charm','relic_talisman','relic_idol','relic_effigy','helmet_armor','missing'];
const item=(uid:number,baseId=bases[pick(bases.length)]):ItemInstance=>({uid,baseId,tier:1,ilvl:1,rarity:'magic',name:'Custody observation',baseRoll:.5,implicitRolls:[],affixes:[],sockets:[],x:pick(4),y:pick(3)});
const account=():Account=>({reliquary:M.emptyReliquary(),features:new Set<string>(),ledger:{},credits:0} as Account);
const authored={config:wire(RELIQUARY_CFG),stash:wire(RELIC_STASH),bases:Object.fromEntries(Object.entries(ITEM_BASES).map(([id,b])=>[id,{category:b.category,...itemGridSize(item(0,id))}]))};
const restores:any[]=[],pours:any[]=[],sequences:any[]=[],experience:any[]=[];
for(let n=0;n<240;n++){
 const floor=10000000+n*10000;bumpItemUidFloor(floor);const uidStart=nextItemUid()+1;
 const items=Array.from({length:pick(30)},(_,i)=>({...item(floor+100+i),relicKey:i%7===0?'':i%5===0?'repeat':'saved:'+i}));
 const source:any=n===0?undefined:{items:[null,...items],released:n%3===0?['saved:1','saved:1','',null,5]:[],seated:['saved:2','saved:2','saved:3','missing'],carried:['saved:2','saved:4','saved:4','missing'],enabled:n%2===0?false:undefined,
  rank:[-1,0,1,15,1000001,.5,null][n%7],invested:[-1,0,1,24,25,1e15,.5,null][n%8],stash:{pages:[-1,1,2,8,9,.5][n%6],invested:n*7,cells:{'saved:4':{page:0,x:0,y:0},repeat:{page:0,x:0,y:0}}}};
 const before=copy(source),result=M.restoreReliquary(source),uidAfter=nextItemUid();assert.deepEqual(source,before);
 if(source?.items){for(const body of result.items)assert(!source.items.includes(body),'Restore must own cloned bodies');}
 restores.push(wire({uidStart,source,result,uidAfter}));
}
for(let n=0;n<600;n++){
 const a=account();a.credits=[-1,0,1,24,25,40,100,10000,2.5,Number.MAX_SAFE_INTEGER][n%10];
 a.reliquary.rank=[0,1,19,RELIQUARY_CFG.maxRank][n%4];a.reliquary.invested=n%3===0?M.reliquaryCost(a.reliquary)-1:0;
 a.reliquary.stash.pages=1+n%8;a.reliquary.stash.invested=n%3===0?RELIC_STASH.pageCostBase*a.reliquary.stash.pages**2-1:0;
 if(n%3!==1)a.features.add('reliquary');if(n%3!==2)a.ledger[RELIQUARY_CFG.attunement]=1;
 const amount=[undefined,-1,0,.5,1,24.9,100,1e12,NaN,Infinity][Math.floor(n/10)%10],kind=n%2?'storage':'power';
 const before=wire({...a,features:[...a.features]}),spent=kind==='storage'?M.investRelicStash(a,amount):M.investReliquary(a,amount);
 pours.push(wire({kind,amount:amount===undefined?'default':Number.isNaN(amount)?'NaN':amount===Infinity?'Infinity':amount,before,spent,after:{...a,features:[...a.features]},cost:M.reliquaryCost(a.reliquary),power:M.reliquaryPower(a.reliquary)}));
}
for(let n=0;n<120;n++){
 const floor=20000000+n*10000;bumpItemUidFloor(floor+999);const uidStart=nextItemUid()+1,scope='vessel:'+n,bagBoard={w:1+n%5,h:1+n%4};setBagBoardSource(()=>bagBoard);
 const a=account(),pool=Array.from({length:10},(_,i)=>({...item(floor+i,'relic_charm'),...(i%4===0?{relicKey:'explicit:'+i}:{})}));
 pool[3].baseId='helmet_armor';pool[5].uid=pool[0].uid;pool[6].baseId='relic_effigy';pool[7].questId='quest-fixture';pool[9].baseId='missing';
 const initial=wire(pool),rows:any[]=[],state=()=>wire({reliquary:a.reliquary,pool,reserve:R.relicReserve(a).map(e=>e.key),board:R.accountRelicBoard(a).map(i=>pool.indexOf(i)),canonical:a.reliquary.items.map(i=>pool.indexOf(i))});
 const step=(op:any,work:()=>unknown)=>{const result=work();rows.push(wire({op,result,state:state()}));};
 for(let i=0;i<pool.length;i++)step({kind:'bank',index:i},()=>{const got=R.bankRelic(a,pool[i],scope);return got?{index:pool.indexOf(got),key:got.relicKey}:null;});
 step({kind:'stale',index:0},()=>{const stale={...pool[0],name:'stale overwrite attempt'};const got=R.bankRelic(a,stale,scope);return {index:pool.indexOf(got!),stale};});
 step({kind:'selections'},()=>{a.reliquary.seated=[pool[0].relicKey!,pool[2].relicKey!];a.reliquary.carried=[pool[1].relicKey!,pool[6].relicKey!];R.reconcileRelicStash(a);});
 for(const target of [undefined,{page:0,x:0,y:0},{page:0,x:5,y:3}])step({kind:'plan',index:4,target},()=>R.planRelicStorage(a,pool[4],target)??null);
 const carry={items:[item(pool[0].uid,'helmet_armor'),copy(pool[1]),item(floor+70,'relic_talisman')],equipped:{helmet:item(pool[2].uid,'helmet_armor')},containers:{reliquary:[copy(pool[0]),item(floor+71,'relic_charm')],other:[item(pool[4].uid,'helmet_armor')]}};
 for(const legacy of [true,false,true]){const before=wire(carry);step({kind:'migrate',legacy,carry:before},()=>{R.migrateRelicCarry(a,carry,scope,legacy);return {carry,bagCanonical:carry.items.map(i=>a.reliquary.items.indexOf(i)),boardCanonical:carry.containers.reliquary.map(i=>a.reliquary.items.indexOf(i))};});}
 const lost=[pool[1],pool[1],item(floor+80,'relic_charm'),pool[3]];step({kind:'lose',bag:wire(lost)},()=>R.loseCarriedRelics(a,lost,scope));
 step({kind:'bank',index:1},()=>{const got=R.bankRelic(a,pool[1],scope);return got?{index:pool.indexOf(got),key:got.relicKey}:null;});
 const deaths=[{owner:'p0',timestamp:14,loot:{items:[{kind:'gear',item:copy(pool[1])},{kind:'gear',item:item(floor+91,'relic_charm')},{kind:'gear',item:pool[3]},{kind:'support',supportId:'test',level:1}]}}] as DeathRecord[];
 step({kind:'corpses',deaths:wire(deaths)},()=>{R.migrateRelicCorpses(a,deaths);return deaths;});
 const uidAfter=nextItemUid();sequences.push({scope,bagBoard,uidStart,initial,rows,uidAfter});
}
for(let n=0;n<80;n++){const items=Array.from({length:n},(_,i)=>item(i,bases[i%bases.length]));for(const enabled of [true,false])experience.push({items,enabled,result:R.reliquaryExperience(items,enabled)});}
setBagBoardSource(null);
const out=process.argv[2];fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'relic-custody.json'),JSON.stringify({authored,restores,pours,sequences,experience})+'\n');
console.log(`Observed ${restores.length} restores, ${pours.length} investments, ${sequences.length} custody sequences (${sequences.reduce((sum,s)=>sum+s.rows.length,0)} transitions), and ${experience.length} XP folds.`);
