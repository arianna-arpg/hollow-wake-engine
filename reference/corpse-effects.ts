// Original authored corpse spells in a real, quiet simulation world.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom,mulberry32} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import {makeSkillInstance,instanceMods,skillContextTags,grantedTags} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {CORPSE_CFG} from '../src/engine/world';

const specs=[
  {skill:'exhume',batch:0,initial:0},
  {skill:'exhume',batch:1.6,initial:39},
  {skill:'exhume',batch:-2,initial:40},
  {skill:'gather_the_dead',batch:0,initial:8},
  {skill:'gather_the_dead',batch:2,initial:8},
  {skill:'gather_the_dead',batch:0,initial:0},
];
const restore=seedGlobalRandom(0x4d3303),courses:unknown[]=[];
try{
  for(const spec of specs){
    const w=makeSimWorld('warrior',0x4d3303),a=new Actor('corpse-caster','ally',{x:800,y:600});
    w.walk=null;w.actors=[a];w.meta.modeId='immortal';
    a.sheet.setBase('corpseBatch',spec.batch);a.sheet.setBase('area',1);a.sheet.setBase('life',100);a.life=100;
    const aim={x:800,y:600},inst=makeSkillInstance(SKILLS[spec.skill],4);a.skills=[inst];
    w.corpses=Array.from({length:spec.initial},(_,i)=>({pos:{x:800+i*50,y:600},defId:'skeleton_warrior',level:2,
      ...(i%3===0?{}:{tier:i%3===1?0:1}),maxLife:46,remaining:3}));
    const initial=JSON.parse(JSON.stringify(w.corpses)),originalRandom=Math.random,random=mulberry32(31),draws:number[]=[];
    Math.random=()=>{const value=random();draws.push(value);return value;};
    try{
      assert(w.executeSkill(a,inst,aim,{noRepeat:true,noCooldown:true}));
      courses.push({spec,aim,level:w.zone.level,tier:a.tier,initial,effects:inst.def.effects,color:inst.def.color,
        areaScale:a.sheet.get('aoeRadius',skillContextTags(inst,grantedTags(inst)),instanceMods(inst)),
        batch:a.sheet.get('corpseBatch',skillContextTags(inst,grantedTags(inst)),instanceMods(inst)),
        expected:JSON.parse(JSON.stringify(w.corpses)),draws});
    }finally{Math.random=originalRandom;}
  }
  writeFileSync(process.argv[2],JSON.stringify({originalOnly:true,rules:CORPSE_CFG,courses}));
}finally{restore();}
