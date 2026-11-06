import fs from 'node:fs';
import {bootSimEngine, makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {SKILLS, SKILL_LIST} from '../src/data/skills';
import {SUPPORTS, SUPPORT_LIST} from '../src/data/supports';
import {MONSTERS} from '../src/data/monsters';
import {GEM_DROP_CFG, GEM_FLOORS, gemFloorFor} from '../src/engine/loot';
import {MEMORY_CFG, MEMORY_KINDS, MEMORY_FOUND_SOURCES, MEMORY_TRADED_PROVENANCE,
  memoryFacets, memoryGroupKey, makeMemoryItem} from '../src/engine/memories';
import {SKILL_RARITIES, makeSkillGem} from '../src/engine/skills';
import {mintSupportInstance} from '../src/engine/supportbase';
import {makeSkillGemItem, makeSupportGemItem} from '../src/engine/gemitems';
import {FEATURE, STARTER_SKILLS, LEDGER_GEMDROP_TOTAL, LEDGER_LEGENDARY_SKILL_DROP, gemDropKey} from '../src/meta/account';
import {VENDOR_CFG} from '../src/data/vendors';
import {MEMORY_UNLOCK_CFG} from '../src/data/memoryUnlocks';
import type {RoughMemoryUnit} from '../src/engine/items';

bootSimEngine();
seedGlobalRandom(0x51a71);
const facets=memoryFacets();
const floors=Object.fromEntries([...new Set(Object.values(GEM_FLOORS).flatMap(f=>f.tilesets))].map(id=>{
  const f=gemFloorFor(id);return [id,{skills:[...f.skills],supports:[...f.supports]}];
}));
const defs={
  skills:Object.values(SKILLS).map(s=>({id:s.id,name:s.name,color:s.color,tags:s.tags,requirements:s.requirements,
    weight:s.dropWeight??100,min:s.minDropLevel??0,...(s.noDrop?{noDrop:true}:{})})),
  supports:Object.values(SUPPORTS).map(s=>({id:s.id,name:s.name,color:s.color,tags:s.dropTags??s.requiresTags??[],
    weight:s.weight,min:s.minDropLevel??0,...(s.rollBase?{cut:{axes:s.rollBase.axes.map(a=>({id:a.id,rows:a.rows.map(r=>({id:r.id,weight:r.weight}))}))}}:{})})),
  monsters:Object.fromEntries(Object.values(MONSTERS).map(m=>[m.id,{name:m.name,skills:m.skills,gemBias:m.gemBias,...(m.boss?{boss:true}:{})}])),
  skillPool:SKILL_LIST.map(s=>s.id),supportPool:SUPPORT_LIST.map(s=>s.id),starters:STARTER_SKILLS,
  facets,floors,rarities:SKILL_RARITIES,kinds:MEMORY_KINDS,found:MEMORY_FOUND_SOURCES,traded:MEMORY_TRADED_PROVENANCE,
  rules:{skillShare:GEM_DROP_CFG.skillShare,tagWeights:GEM_DROP_CFG.tagWeights,biasMult:GEM_DROP_CFG.biasMult,
    floorMult:GEM_DROP_CFG.floorMult,kitMult:MEMORY_CFG.kitMult,boss:MEMORY_CFG.bossRarityLean,
    tiers:MEMORY_CFG.tierRarityLean,strings:MEMORY_CFG.strings,lesson:MEMORY_CFG.lessonReceipt,
    dropPrefix:gemDropKey(''),total:LEDGER_GEMDROP_TOTAL,legendary:LEDGER_LEGENDARY_SKILL_DROP,threshold:VENDOR_CFG.commission.need,
    awaken:MEMORY_UNLOCK_CFG.secondary.legendaryFinds&&MEMORY_UNLOCK_CFG.secondary.kinds.includes('skill')},
};
const world=makeSimWorld('warrior',41),seat=world.localSeat,account=world.account;
const starter={skills:[...account.unlockedSkills],supports:[...account.unlockedSupports]};
const profiles=[{...starter,level:1,all:false},{skills:[],supports:[],level:1,all:false},
  {skills:['raise_dead','firebolt'],supports:['teeming_vein','multistrike'],level:12,all:false},{skills:[],supports:[],level:80,all:true}];
function configure(p:typeof profiles[number]){
  account.unlockedSkills=new Set(p.skills);account.unlockedSupports=new Set(p.supports);
  if(p.all)account.features.add(FEATURE.UNLOCK_ALL_GEMS);else account.features.delete(FEATURE.UNLOCK_ALL_GEMS);
  seat.actor.level=p.level;world.zone.level=p.level;
}
const cases=[],sources=['crypt_lich','skeleton_warrior','zombie','not_in_registry','found',MEMORY_TRADED_PROVENANCE];
const floorIds=Object.keys(floors);
const pins=[{k:'skill',id:'firebolt',l:8,r:'legendary'}, {k:'support',id:'teeming_vein',l:3},
  {k:'skill',id:'obsolete'}, {k:'support',id:'obsolete'}, {k:'support',id:'multistrike'}, {k:'skill',id:'cleave'}] as const;
for(const [profile,p] of profiles.entries()){
  configure(p);
  for(let n=0;n<576;n++){
    const unit:RoughMemoryUnit={d:sources[n%sources.length],s:n===0?0:n===1?0xffffffff:Math.imul(n,0x9e3779b9)>>>0};
    if(n%3===0)unit.e=['crowned','elite','normal'][Math.floor(n/3)%3] as RoughMemoryUnit['e'];
    if(n%4===1&&floorIds.length)unit.t=floorIds[Math.floor(n/4)%floorIds.length];
    if(n%7===0)unit.g={...pins[Math.floor(n/7)%pins.length]};
    if(n%5===2)unit.ceiling=['common','magic','rare'][Math.floor(n/5)%3] as RoughMemoryUnit['ceiling'];
    const facet=n%4===0?facets[Math.floor(n/4)%facets.length].id:undefined;
    const cut=world['resolveMemoryCut'](seat,unit,facet);
    const item=cut.kind==='skill'?makeSkillGemItem(makeSkillGem(cut.def,cut.level,cut.rarity)):
      makeSupportGemItem(mintSupportInstance(cut.def,cut.level,cut.rand));
    cases.push({profile,unit,facet,name:item.name,gem:item.gem});
  }
}
const actions=[];
const stack:RoughMemoryUnit[]=[{d:'crypt_lich',s:21},{d:'zombie',s:43},{d:'crypt_lich',s:78},
  {d:'crypt_lich',s:1,g:{k:'skill',id:'firebolt',r:'legendary',l:3}},{d:'crypt_lich',s:12,g:{k:'support',id:'teeming_vein',l:3}},
  {d:'crypt_lich',s:22,g:{k:'skill',id:'retired'}},{d:'skeleton_warrior',s:9},{d:MEMORY_TRADED_PROVENANCE,s:8},{d:'found',s:42}];
for(const mode of ['rough','pinned','support','retired','facet','noFacet','badFacet','roughIgnored','full','lastCell','sealed','missingGroup','missingItem','immortal','threshold']){
  configure(profiles[0]);
  const kind=['facet','badFacet','noFacet'].includes(mode)?'preformed':'rough';
  const units=mode==='lastCell'?[stack[4]]:stack;
  const at=({pinned:3,support:4,retired:5,immortal:3,threshold:3} as Record<string,number>)[mode]??0;
  const group=mode==='missingGroup'?'missing':memoryGroupKey(units[at]);
  const facet=mode==='facet'?facets[1].id:mode==='badFacet'||mode==='roughIgnored'?'typo':undefined;
  const bag=seat.meta.items;bag.length=0;
  const pouch=Object.assign(makeMemoryItem(kind,structuredClone(units)),{x:0,y:0,locked:true});
  bag.push(pouch);
  if(mode==='full'||mode==='lastCell'){
    for(let n=1;n<96;n++)bag.push({...pouch,uid:pouch.uid+50000+n,name:'Filler',baseId:'support_gem',mem:undefined,x:n%12,y:Math.floor(n/12)});
  }
  account.ledger={};world.ledger={};account.memorySecondary.clear();world.accountDirty=false;world.memoryRecallLast=null;
  if(mode==='threshold')account.ledger[gemDropKey('firebolt')]=VENDOR_CFG.commission.need-1;
  world['spoilsSealed']=()=>mode==='sealed';world.metaProgressionActive=()=>mode!=='immortal';
  const floats:string[]=[];world.text=(_pos,msg)=>{floats.push(msg);};
  const uid=mode==='missingItem'?-1:pouch.uid;
  const view=world.memoryRecallView(seat,uid);
  const before=structuredClone(bag);
  const result=world.recallMemory(seat,uid,group,facet);
  const item=result?bag.find(i=>i.uid===result.itemUid):null;
  // Sample original full-bag fillers by their custody, and retain the whole minted item.
  actions.push({mode,kind,uid,group,facet,before,view,result,item,remaining:pouch.mem,
    pouchPresent:bag.includes(pouch),bagOrder:bag.map(i=>i.uid),floats,ledger:{...account.ledger},seatLedger:{...world.ledger},
    secondary:[...account.memorySecondary],dirty:world.accountDirty});
}
fs.writeFileSync(process.argv[2],JSON.stringify({defs,profiles,cases,actions}));
