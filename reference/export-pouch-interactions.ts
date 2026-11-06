import fs from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {MONSTERS} from '../src/data/monsters';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {FEATURE} from '../src/meta/account';
import {memoryFacets} from '../src/engine/memories';
import {GEM_DROP_CFG,GEM_FLOORS} from '../src/engine/loot';
import {makeSkillGem} from '../src/engine/skills';
import {mintSupportInstance} from '../src/engine/supportbase';
import {makeSkillGemItem,makeSupportGemItem} from '../src/engine/gemitems';
import type {RoughMemoryUnit} from '../src/engine/items';

bootSimEngine();
seedGlobalRandom(115);
const w=makeSimWorld('warrior',100),seat=w.localSeat,features=w.account.features;
const boss=Object.values(MONSTERS).find(m=>m.boss&&m.skills?.length)!;
const floor=Object.values(GEM_FLOORS).find(f=>f.skills?.length&&f.supports?.length)!.tilesets[0];
const tags=new Set([...Object.values(SKILLS).flatMap(s=>s.tags),...Object.values(SUPPORTS).flatMap(s=>s.dropTags??s.requiresTags??[])]);
const options=[
  {name:'boss-floor-facet',all:false,level:8,weights:{}},
  {name:'boss-weighted-tags',all:true,level:30,weights:{spell:4,attack:0.25,minion:3}},
  {name:'zero-weight',all:false,level:1,weights:Object.fromEntries([...tags].map(t=>[t,0]))},
  {name:'bracket-before',all:true,level:1,weights:{}},
  {name:'bracket-after',all:true,level:80,weights:{}},
];
const skills=['firebolt','cleave','raise_dead'],supports=['teeming_vein','multistrike'];
const cases=[];
const original=GEM_DROP_CFG.tagWeights;
try{
  for(const [profile,o] of options.entries()){
    GEM_DROP_CFG.tagWeights=o.weights;
    if(o.all)features.add(FEATURE.UNLOCK_ALL_GEMS);else features.delete(FEATURE.UNLOCK_ALL_GEMS);
    w.account.unlockedSkills=new Set(skills);w.account.unlockedSupports=new Set(supports);
    seat.actor.level=o.level;w.zone.level=o.level;
    for(let n=0;n<144;n++){
      const unit:RoughMemoryUnit={d:boss.id,s:n===0?0:n===1?0xffffffff:Math.imul(0x9e3779b9,n)>>>0,
        e:n%2?'crowned':'champion',...(n%3?{t:floor}:{}),...(n%7===0?{ceiling:'magic' as const}:{})};
      const facet=n%4!==3?memoryFacets()[n%3].id:undefined;
      if(n%13===0)unit.g={k:'support',id:'retired-support'};
      const reward=w['resolveMemoryCut'](seat,unit,facet);
      const wrapper=reward.kind==='skill'?makeSkillGemItem(makeSkillGem(reward.def,reward.level,reward.rarity)):
        makeSupportGemItem(mintSupportInstance(reward.def,reward.level,reward.rand));
      cases.push({profile,unit,facet,gem:wrapper.gem});
    }
  }
}finally{GEM_DROP_CFG.tagWeights=original;}
fs.writeFileSync(process.argv[2],JSON.stringify({boss:boss.id,floor,skills,supports,options,cases}));
