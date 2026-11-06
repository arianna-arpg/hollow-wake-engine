// Run against the verified source capsule. Use the inventory's actual tooltip
// dispatcher and lookup rules. Only the world, seats and input settings are hosts.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {bootSimEngine} from '../src/sim/arena';
import {UI} from '../src/ui/panels';
import {MONSTERS} from '../src/data/monsters';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {ATTRIBUTES} from '../src/engine/stats';
import {makeSkillGem,makeSkillInstance,skillMaxLevel,supportMaxLevel,SKILL_RARITIES,
  supportFitsInst,supportFitsInstOrCrew,type SkillRarity} from '../src/engine/skills';
import {World} from '../src/engine/world';
import {makeSkillGemItem,makeSupportGemItem,skillOfGemItem,supportOfGemItem} from '../src/engine/gemitems';
import {hasEmpowermentPassive,empowermentRank,empowermentPoints,skillInstanceName} from '../src/engine/skillEmpowerment';
import {veinLines} from '../src/engine/supportbase';
import {sellSkillYield,salvageSkillYield,sellSupportYield,salvageSupportYield,sellMemoryYield} from '../src/engine/crafting';
import {makeMemoryItem,memoryGroups,memoryKindOf,memoryProvenanceLabel,MEMORY_CFG,MEMORY_KINDS,
  MEMORY_TRADED_PROVENANCE,MEMORY_FOUND_SOURCES,type MemoryKind} from '../src/engine/memories';
import type {ItemInstance} from '../src/engine/items';
import {nextItemUid} from '../src/engine/itemgen';

bootSimEngine();
const out=process.argv[2];
const skills=Object.values(SKILLS), supports=Object.values(SUPPORTS), monsters=Object.values(MONSTERS);
const rarities=Object.keys(SKILL_RARITIES) as SkillRarity[];
const byId=(rows:any[],project:(r:any)=>unknown)=>Object.fromEntries(rows.map(r=>[r.id,project(r)]));
const faces={
  skills:byId(skills,d=>({description:d.description,tags:d.tags,requirements:d.requirements,empowerable:hasEmpowermentPassive(d)})),
  supports:byId(supports,d=>({color:d.color,description:d.description,axes:d.rollBase?.axes.map((a:any)=>({id:a.id,rows:a.rows.map((r:any)=>({id:r.id,line:r.line}))}))})),
  monsters:byId(monsters,d=>d.name),
  kinds:MEMORY_KINDS, sources:{...MEMORY_FOUND_SOURCES,[MEMORY_TRADED_PROVENANCE]:memoryProvenanceLabel(MEMORY_TRADED_PROVENANCE)},
  found:MEMORY_CFG.foundProvenance, maxGroups:MEMORY_CFG.tooltipGroups,confirmFrom:MEMORY_CFG.sell.confirmFrom,
  pinned:MEMORY_CFG.strings.pinned, attributes:Object.fromEntries(Object.entries(ATTRIBUTES).map(([id,a])=>[id,a.short])),
};
fs.writeFileSync(path.join(out,'faces.json'),JSON.stringify(faces)+'\n',{flag:'wx'});

const emptyMeta=()=>({items:[] as ItemInstance[],equipped:{},containers:{},stash:{items:[] as ItemInstance[]},attrs:{}});
const local={meta:emptyMeta()},guest={meta:emptyMeta()};
const bar:[string|null,number][]=[['firebolt',2],[null,0],['ruin',0],['summon_skeleton_archer',1],['summon_skeleton',1]];
const roster=bar.map(([id,count])=>id?makeSkillInstance(SKILLS[id],1,count):null);
const resonance=supports.find(d=>d.resonance)!;
assert(resonance);
roster[3]!.sockets[0]={def:resonance,level:1};
const crew=World.prototype.summonCrewSkills;
const world={localSeat:local,account:{reliquary:{items:[]}},vendorStock:[] as unknown[],chandlerStock:[],descentStock:[],
  clientActionHook:false,seatHero:(_seat:unknown)=>({skills:roster}),summonCrewSkills:crew};
const settings={keybinds:{itemLock:'KeyL'},padBinds:{},confirmMemorySale:true};
const ui=Object.assign(Object.create(UI.prototype),{getWorld:()=>world,getSettings:()=>settings});
const fd=fs.openSync(path.join(out,'cards.jsonl'),'wx');
fs.writeFileSync(path.join(out,'roster.json'),JSON.stringify(roster.map(inst=>{
  if(!inst)return null;
  const members=crew(inst);
  return {id:inst.def.id,level:inst.level,sockets:inst.sockets.map(s=>s?{id:s.def.id,level:s.level}:null),
    crew:Array.isArray(members)?members.map(d=>d.id):members};
}))+'\n');
type Lane='sell'|'break'|null;
type Place='pack'|'stash'|'shelf'|'side'|'guest'|'guest-stash';
type View={place?:Place;lane?:Lane;attrs?:Record<string,number>;confirm?:boolean;locked?:boolean;emptyBar?:boolean};
function record(label:string,item:ItemInstance,view:View={}){
  const {place='pack',lane=null,attrs={},confirm=true,locked=false,emptyBar=false}=view;
  const seat=place.startsWith('guest')?guest:local;
  local.meta=emptyMeta();guest.meta=emptyMeta();seat.meta.attrs=attrs;
  if(locked)item={...item,locked:true};
  if(place==='stash'||place==='guest-stash')seat.meta.stash.items.push(item);
  else if(place==='side')seat.meta.containers={reliquary:[item]};
  else if(place!=='shelf')seat.meta.items.push(item);
  world.vendorStock=place==='shelf'?[{kind:'item',item}]:[];
  const equipped=emptyBar?[]:roster;
  world.seatHero=(actual:unknown)=>{assert.equal(actual,seat);return {skills:equipped};};
  settings.confirmMemorySale=confirm;
  const state=()=>JSON.stringify({item,seat,settings,equipped},(key,value)=>key==='def'?value.id:value);
  const before=state();
  const uidBefore=nextItemUid(),ambient=Math.random;
  let card;
  try {
    Math.random=()=>{throw Error('Inspection drew ambient randomness: '+label);};
    card=ui.itemTooltip(item.uid,false,seat,lane);
  }finally{Math.random=ambient;}
  assert.equal(state(),before,label);
  assert.equal(nextItemUid(),uidBefore+1,'Inspection allocated an item: '+label);
  let values:Record<string,unknown>|null=null;
  if(card && item.gem?.kind==='skill'){
    const g=item.gem,def=SKILLS[g.skillId],live=skillOfGemItem(item)!;
    values={name:skillInstanceName(live),rarity:SKILL_RARITIES[g.rarity],rank:empowermentRank(g),points:empowermentPoints(g),
      requirements:Object.entries(def.requirements??{}).map(([id,n])=>({id,need:n,met:(attrs[id]??0)>=n!})),
      sell:sellSkillYield(live),salvage:salvageSkillYield(live)};
  }else if(card && item.gem?.kind==='support'){
    const g=item.gem,def=SUPPORTS[g.supportId],live=supportOfGemItem(item)!;
    values={cut:def.rollBase?veinLines(def.rollBase,g.rolled):[],sell:sellSupportYield(live),salvage:salvageSupportYield(live),
      fit:equipped.flatMap((inst,slot)=>inst?[{slot,id:inst.def.id,direct:supportFitsInst(def,inst,g.rolled),
        fits:supportFitsInstOrCrew(def,inst,crew(inst),g.rolled),sockets:inst.sockets.length,occupied:inst.sockets.filter(Boolean).length}]:[])};
  }else if(card && item.mem){
    const kind=memoryKindOf(item)!;
    values={kind,groups:memoryGroups(item.mem),newest:memoryProvenanceLabel(item.mem.at(-1)!.d,MONSTERS[item.mem.at(-1)!.d]?.name),
      sell:sellMemoryYield(kind,item.mem.length)};
  }
  fs.writeSync(fd,JSON.stringify({label,item,view:{place,lane,attrs,confirm,emptyBar},card,values})+'\n');
}
try{
  for(const def of skills){
    for(const [i,rarity] of rarities.entries()){
      const inst=makeSkillGem(def,i===0?1:skillMaxLevel(def),rarity);
      if(i===1)inst.granted=true;
      if(i===3)inst.empowermentRank=2;
      if(i>=2 && inst.sockets.length)inst.sockets[0]={def:SUPPORTS.multistrike,level:2};
      const attrs=Object.fromEntries(Object.entries(def.requirements??{}).map(([key,value],n)=>[key,Math.max(0,value!-(i+n)%2)]));
      record('skill/'+def.id+'/'+rarity,makeSkillGemItem(inst),{attrs,lane:([null,'sell','break',null] as Lane[])[i],place:i===3?'guest':'pack'});
    }
  }
  for(const def of supports){
    for(const [index,lane] of ([null,'break','sell'] as Lane[]).entries()){
      record('support/'+def.id+'/'+index,makeSupportGemItem({def,level:index?supportMaxLevel(def):1}),{lane,emptyBar:index===2});
    }
    if(!def.rollBase)continue;
    let combinations:Record<string,string>[]=[{}];
    for(const axis of def.rollBase.axes)combinations=combinations.flatMap(prev=>axis.rows.map(row=>({...prev,[axis.id]:row.id})));
    for(const [i,rolled] of [...combinations,{old_axis:'retired', [def.rollBase.axes[0].id]:'retired'}].entries()){
      record('cut/'+def.id+'/'+i,makeSupportGemItem({def,level:1,rolled}));
    }
  }
  for(const d of monsters)record('dropper/'+d.id,makeMemoryItem('rough',[{d:d.id,s:31}]));
  for(const [k,defs] of [['skill',skills],['support',supports]] as const){
    for(const d of defs)record('pin/'+k+'/'+d.id,makeMemoryItem('rough',[{d:'traded',s:0,g:{k,id:d.id}}]));
  }
  const special=makeSkillGem(SKILLS.firebolt,7,'legendary');special.empowermentRank=4001;
  const specimens=[makeSkillGemItem(special),makeSupportGemItem({def:SUPPORTS.multistrike,level:2}),
    ...(['rough','preformed'] as MemoryKind[]).map(kind=>makeMemoryItem(kind,[
      {d:'traded',s:0,g:{k:'skill',id:'firebolt',r:'magic',l:2}},{d:'found',s:2},
      {d:'traded',s:0xffffffff,e:'rare',g:{k:'skill',id:'firebolt',r:'rare',l:3}},
      {d:'traded',s:3,g:{k:'support',id:'multistrike'}},{d:'["old-world","cache"]',s:4},
      {d:'[bad',s:5},{d:'traded',s:6},{d:'quest',s:7},{d:'traded',s:8,g:{k:'skill',id:'removed-skill'}}]))];
  for(const item of specimens)for(const place of ['pack','guest','stash','guest-stash','shelf','side'] as Place[])
    for(const lane of [null,'break','sell'] as Lane[])for(const locked of [false,true]){
      record('context/'+item.baseId+'/'+place+'/'+lane+'/'+locked,item,{place,lane,locked});
    }
  for(const count of [1,2,3,4,5,6,2048])for(const confirm of [true,false]){
    const units=Array.from({length:count},(_,i)=>({d:'source_'+i,s:i}));
    record('stack/'+count+'/'+confirm,makeMemoryItem('preformed',units),{confirm,lane:'sell'});
  }
  const newest=['found','chest','quest','traded','["v1","cache"]','["v1","unknown"]','[invalid','lost-monster'];
  for(const d of newest)record('provenance/'+d,makeMemoryItem('rough',[{d,s:42,g:{k:'support',id:'retired-support'}}]));
  record('removed/skill',{...specimens[0],gem:{kind:'skill',skillId:'removed-skill',level:1,rarity:'common',sockets:[]}});
  record('removed/support',{...specimens[1],gem:{kind:'support',supportId:'removed-support',level:1}});
}finally{fs.closeSync(fd);}
console.log({skills:skills.length,supports:supports.length,monsters:monsters.length,rarities});
