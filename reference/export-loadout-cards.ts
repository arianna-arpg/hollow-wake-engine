// This file executes inside the locked original. Observe both actual hover
// modes with the same seat, source lookup, and portable item bodies.
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {bootSimEngine} from '../src/sim/arena';
import {UI} from '../src/ui/panels';
import {ContainerPane} from '../src/ui/containerPane';
import {World} from '../src/engine/world';
import {ITEM_BASES} from '../src/data/itembases';
import {EQUIP_SLOTS, ITEM_RARITIES, slotsForCategory, type ItemInstance} from '../src/engine/items';
import {compareItemMods, itemLevelReq, nextItemUid} from '../src/engine/itemgen';

bootSimEngine();
const [corpus,output]=process.argv.slice(2);
const {rows}=JSON.parse(gunzipSync(fs.readFileSync(corpus)).toString());
const bodies: ItemInstance[]=rows.map((r:{item:ItemInstance})=>r.item);
const ring=bodies.find(i=>i.baseId==='ring_lapis' && i.tier===4 && i.rarity==='rare')!;
const other=bodies.find(i=>i.baseId==='ring_lapis' && i.tier===2 && i.rarity==='magic')!;
type BodyMap=Record<string,ItemInstance>;
type Place='bag'|'worn'|'board'|'vendor'|'chandler'|'descent'|'stash'|'oracle'|'foreign'|'client-stash';
function seat(level:number,equipped:BodyMap){
  return {actor:{level},home:null as {level:number}|null,meta:{items:[] as ItemInstance[],equipped,containers:{} as Record<string,ItemInstance[]>,stash:{items:[] as ItemInstance[]}}};
}
const cases:unknown[]=[];
function observe(label:string,body:ItemInstance,equipped:BodyMap,place:Place='bag',guest=false,heroLevel=1,actorLevel=heroLevel){
  const item={...body,uid:600001};
  const owner=seat(actorLevel,structuredClone(equipped)),stranger=seat(99,{ring1:{...other,uid:600099}});
  if(heroLevel!==actorLevel)owner.home={level:heroLevel};
  const local=guest?stranger:owner;
  const world={localSeat:local,account:{reliquary:{items:[] as ItemInstance[]},features:new Set()},
    clientActionHook:place==='client-stash',vendorStock:[] as any[],chandlerStock:[] as any[],descentStock:[] as any[],seatHero:World.prototype.seatHero};
  switch(place){
    case 'bag':owner.meta.items.push(item);break;
    case 'worn':owner.meta.equipped.ring2=item;break;
    case 'board':owner.meta.containers.reliquary=[item];break;
    case 'vendor':case 'chandler':case 'descent':world[(place+'Stock') as 'vendorStock'].push({kind:'item',item});break;
    case 'stash':case 'client-stash':owner.meta.stash.items.push(item);break;
    case 'oracle':world.account.reliquary.items.push(item);break;
    case 'foreign':stranger.meta.items.push(item);break;
  }
  const pane=Object.assign(Object.create(ContainerPane.prototype),{host:{seat:()=>owner,world:()=>world}});
  const ui=Object.assign(Object.create(UI.prototype),{getWorld:()=>world,containerPane:pane});
  const snapshot=()=>JSON.stringify([owner,stranger,world.account,world.vendorStock,world.chandlerStock,world.descentStock]);
  const before=snapshot(),uid=nextItemUid(),savedRandom=Math.random;
  let expected=null;
  Math.random=()=>{throw Error('Random draw during hover');};
  try{
    const full=ui.itemTooltip(item.uid,true,owner),brief=ui.itemTooltip(item.uid,false,owner);
    assert.equal(!!full,!!brief);
    if(full){
      const targets=ui.compareTargets(item,owner);
      const block=ui.compareHtml(item,owner);
      assert.equal(!!block,targets.length>0);
      if(block){assert(full.description.endsWith(block));assert(!brief.description.includes(block));}
      expected={title:full.title,fullMeta:full.meta,compactMeta:brief.meta,
        targets:targets.map(({label,worn}:{label:string;worn:ItemInstance})=>({
          slot:Object.keys(owner.meta.equipped).find(id=>owner.meta.equipped[id]===worn),label,
          uid:worn.uid,name:worn.name,color:ITEM_RARITIES[worn.rarity].color,rows:compareItemMods(item,worn)}))};
    }
  }finally{Math.random=savedRandom;}
  assert.equal(nextItemUid(),uid+1);assert.equal(snapshot(),before);
  cases.push({label,input:{item,equipped:owner.meta.equipped,heroLevel,actorLevel,place,guest},expected});
}
const seen=new Set<string>();
for(const body of bodies){
  const category=ITEM_BASES[body.baseId]?.category;
  if(!category||category==='gem'||seen.has(body.baseId))continue;
  seen.add(body.baseId);
  const equipped=Object.fromEntries(slotsForCategory(category).map((s,i)=>[s.id,{...body,uid:10+i}]));
  observe('base/'+body.baseId,body,equipped);
}
const twin={...ring,uid:22},left={...other,uid:11};
// Insert right first so iteration in host dictionary order is observably wrong.
const both={ring2:twin,ring1:left};
for(const place of ['bag','board','vendor','chandler','descent','stash','oracle','foreign','client-stash','worn'] as Place[]){
  for(const guest of [false,true])observe(place+'/'+(guest?'guest':'local'),ring,both,place,guest,1,99);
}
for(const [name,eq] of Object.entries({empty:{},left:{ring1:left},right:{ring2:twin},disabled:{mainhand:twin},legacy:{retired:twin}}))
  observe('slots/'+name,ring,eq as BodyMap);
for(const level of [itemLevelReq(ring)-1,itemLevelReq(ring),itemLevelReq(ring)+1])
  observe('threshold/'+level,ring,both,'bag',false,level,1);
const word=rows.find((r:{label:string;item:ItemInstance})=>r.label.startsWith('epitaph-')&&r.item.rarity==='magic'&&r.item.sockets?.length);
assert(word);observe('socket-word',word.item,{});
assert(EQUIP_SLOTS.some(s=>!s.enabled));assert(seen.size>50);
fs.writeFileSync(output,JSON.stringify(cases)+'\n',{flag:'wx'});
