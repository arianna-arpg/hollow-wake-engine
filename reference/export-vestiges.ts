import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {ITEM_BASES} from '../src/data/itembases';
import {VESTIGE_LIST,EPITAPH_LIST,epitaphFor} from '../src/data/vestiges';
import {compileItemMods,forgeItem} from '../src/engine/itemgen';
import {serializeCharacter} from '../src/meta/character';
import type {ItemInstance,ItemRarity} from '../src/engine/items';

bootSimEngine();
const restore=seedGlobalRandom(123456);
try {
  const world=makeSimWorld('warrior',123456),seat=world.localSeat,m=seat.meta;
  const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
  const definitions={version:1,vestiges:VESTIGE_LIST,epitaphs:EPITAPH_LIST};
  fs.writeFileSync(process.argv[3],JSON.stringify(definitions)+'\n');
  const bases=Array.from(new Set(Object.values(ITEM_BASES).map(b=>b.category)),category=>
    Object.values(ITEM_BASES).find(b=>b.category===category)!);
  const categories=bases.map(b=>b.category);
  const effects=[],words=[];
  for(const base of bases){
    const item=forgeItem({baseId:base.id,ilvl:1,rarity:'common',quality:.5,superior:false,sockets:0})!;
    const n=compileItemMods(item).length;
    for(const stone of VESTIGE_LIST){
      item.sockets=[stone.id];
      effects.push({baseId:base.id,category:base.category,id:stone.id,lines:compileItemMods(item).slice(n)});
    }
  }
  for(const word of EPITAPH_LIST)for(const category of categories)
    for(const rarity of ['common','magic','rare','unique'])
      for(const sockets of [word.sequence,[...word.sequence].reverse(),word.sequence.slice(1),[...word.sequence,null]]){
        words.push({word:word.id,category,rarity,sockets,found:epitaphFor(rarity,category,sockets)?.id??null});
      }
  const steps:unknown[]=[];
  const pos={...seat.actor.pos}; world.time=17;
  let events:unknown[]=[];
  let faults='',hook:(()=>void)|undefined;
  const trace=(event:unknown)=>{events.push(event);if(faults && Array.isArray(event)&&event[0]===faults)throw Error('test-interrupt');};
  world.text=((at:typeof pos,s:string,color:string,size:number,channel?:string)=>{
    trace(['text',s,color,size,channel??null,at.x-pos.x,at.y-pos.y]);
    if(hook){const f=hook;hook=undefined;f();}
  }) as typeof world.text;
  world.recalcSeat=()=>trace(['recalculate']);
  world.markMetaDirty=()=>trace(['dirty']);
  function item(baseId:string,sockets:(string|null)[]|undefined,rarity:ItemRarity='common'){
    const it=forgeItem({baseId,ilvl:1,quality:.5,superior:false,rarity:'common',sockets:0})!;
    it.uid=4294967301;it.rarity=rarity;it.sockets=sockets;return it;
  }
  function setup(it:ItemInstance,worn:boolean){
    m.items=worn?[]:[it];m.equipped=worn?{ring1:it}:{};m.vestiges={};world.pickupFeed.length=0;events=[];faults='';hook=undefined;
  }
  function snap(){return clone({bag:m.items.map(i=>[i.uid,i.sockets??null]),worn:Object.entries(m.equipped).map(([s,i])=>[s,i?.uid,i?.sockets??null]),
    wallet:m.vestiges,feed:world.pickupFeed,events});}
  const first=VESTIGE_LIST[0],other=VESTIGE_LIST[1],sampleBase=bases.find(b=>b.category==='gloves')!;
  for(const row of VESTIGE_LIST){
    setup(item(sampleBase.id,[null]),false);
    for(const count of [0,1,2,-1])world.grantVestige(seat,row.id,count);
    world.grantVestige(seat,'missing',2);
    steps.push({id:'grant/'+row.id,after:snap()});
  }
  for(const word of EPITAPH_LIST)for(const category of word.categories)for(const worn of [false,true]){
    const base=bases.find(b=>b.category===category)!;
    const it=item(base.id,Array(word.sequence.length).fill(null));setup(it,worn);
    for(const id of word.sequence)m.vestiges[id]=(m.vestiges[id]??0)+1;
    const frames=[];
    for(const [i,id] of word.sequence.entries()){
      events=[];world.socketVestige(seat,it.uid,i,id);frames.push(snap());
    }
    // Replacing a matching stone with itself still consumes it and announces again.
    const id=word.sequence[0];m.vestiges[id]=1;events=[];world.socketVestige(seat,it.uid,0,id);
    frames.push(snap());
    const saved=serializeCharacter(world);
    steps.push({id:'inlay/'+word.id+'/'+category+'/'+worn,base:base.id,name:it.name,frames,
      savedWallet:saved.vestiges,finalMods:compileItemMods(it)});
  }
  for(const mode of ['missing-material','missing-item','no-slots','negative-index','past-last','unknown','stale-stone','locked',
      'duplicate-uid','interrupted-text','interrupted-recalc','live-before-word']){
    const it=item(sampleBase.id,mode==='no-slots'?undefined:[mode==='stale-stone'?'retired':other.id]);
    setup(it,mode==='interrupted-recalc');if(mode!=='missing-material')m.vestiges[first.id]=2;
    if(mode==='locked')it.locked=true;
    if(mode==='duplicate-uid')m.equipped.ring1=item(sampleBase.id,[null]);
    if(mode==='interrupted-text')faults='text';if(mode==='interrupted-recalc')faults='recalculate';
    if(mode==='live-before-word')hook=()=>{it.sockets=[...EPITAPH_LIST.find(e=>e.categories.includes(sampleBase.category))!.sequence];};
    let error='';
    try{world.socketVestige(seat,mode==='missing-item'?7:it.uid,mode==='negative-index'?-1:mode==='past-last'?1:0,
      mode==='unknown'?'missing':first.id);}catch(e){error=(e as Error).message;}
    steps.push({id:'edge/'+mode,error,after:snap()});
  }
  assert(steps.length>30 && words.length>100);
  fs.writeFileSync(process.argv[2],JSON.stringify({effects,words,steps}));
}finally{restore();}
