// Original sale/salvage and canonical retirement, with storage explicitly disabled.
import fs from 'node:fs';
import {makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom,mulberry32} from '../src/sim/rng';
import {forgeItem} from '../src/engine/itemgen';
import {autoPlace} from '../src/engine/inventory';
import {ITEM_BASES} from '../src/data/itembases';
import {suppressSaves} from '../src/meta/persistence';
const restore=seedGlobalRandom(7331),courses:any[]=[],copy=(x:any)=>JSON.parse(JSON.stringify(x));
suppressSaves('SDK parity observation: no storage');
const base=Object.values(ITEM_BASES).find(b=>b.category==='relic')!;
try{for(const spec of [
  {id:'relic-single-sale',bulk:false,lane:'sell',custody:true},
  {id:'relic-single-salvage',bulk:false,lane:'break',custody:true},
  {id:'relic-bulk-sale',bulk:true,lane:'sell',custody:true},
  {id:'relic-bulk-salvage',bulk:true,lane:'break',custody:true},
  {id:'relic-unowned-refusal',bulk:false,lane:'sell',custody:false},
  {id:'relic-unowned-bulk',bulk:true,lane:'sell',custody:false},
]){
  const w=makeSimWorld('summoner',7331),host=w as any,m=w.meta;
  m.items=[];m.equipped={};m.containers={};m.essences={};m.relicScope='parity-relic';w.account.craftLore={};
  host.stationReach=()=>true;host.nearSalvage=()=>true;host.nearScrapVendor=()=>true;host.metaProgressionActive=()=>false;
  if(!spec.custody)w.clientActionHook=()=>{};
  for(let n=0;n<4;n++){
    const i=forgeItem({baseId:n===3?'helmet_armor':base.id,rarity:'common',ilvl:20,affixes:[],quality:.5,rng:mulberry32(14+n)})!;
    i.uid=1001+n;if(n<3)i.relicKey='parity:'+i.uid;if(n===2)i.locked=true;
    if(!autoPlace(m.items,i))throw Error('Relic observer bag placement failed');
  }
  w.account.reliquary.items=m.items.filter(i=>i.relicKey).map(copy);
  w.account.reliquary.carried=w.account.reliquary.items.map(i=>i.relicKey!);w.account.reliquary.seated=[];w.account.reliquary.released=[];
  const observe=()=>copy({items:m.items,wallet:m.essences,retired:w.account.reliquary.released,canonical:w.account.reliquary.items.map(i=>i.relicKey)});
  const initial=observe(),command={kind:'inventory',request:spec.bulk?{op:'salvage-bulk',category:'item',lane:spec.lane}:{op:'salvage',uid:1001,lane:spec.lane}};
  if(spec.bulk)w.salvageBulk(w.localSeat,'item',undefined,spec.lane as 'sell'|'break');else w.salvageItem(w.localSeat,1001,spec.lane as 'sell'|'break');
  const expected=observe();courses.push({id:spec.id,spec,initial,steps:[{command,conditions:{salvage:true,oracle:true,bench:true,counter:true,study:false},expected}]});
}}finally{restore();}
fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,originalOnly:true,courses})+'\n',{flag:'wx'});
