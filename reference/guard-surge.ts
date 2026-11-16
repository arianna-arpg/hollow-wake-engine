import {writeFileSync} from 'node:fs';
import {makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import {makeSkillInstance,type SkillEffect,type GuardSurgeEffect} from '../src/engine/skills';
import {guardSurgePreview} from '../src/engine/guardSurge';
const restore=seedGlobalRandom(0x4d3311),courses:unknown[]=[];
try{
  for(const variant of['held','fallback','stronger','unsupported','empty','fraction-clamped']){
    const w=makeSimWorld('warrior',0x4d3311),a=new Actor('guard','ally',{x:800,y:600});w.walk=null;w.actors=[a];w.meta.modeId='immortal';
    const effect:GuardSurgeEffect={type:'guardSurge',manaFraction:variant==='fraction-clamped'?2:.5,ratio:3,
      ...(variant==='unsupported'?{}:{unguarded:{duration:2,capLife:.2}})};
    const skill=makeSkillInstance({id:'m3-surge',name:'Surge',description:'',color:'#fff',tags:['spell'],manaCost:0,useTime:0,cooldown:0,delivery:{type:'self'},effects:[effect]},1);
    a.sheet.setBase('life',100);a.sheet.setBase('absorbPower',2);a.sheet.setBase('effectDuration',3);a.mana=variant==='empty'?0:100;
    a.absorb=variant==='stronger'?200:0;a.absorbTimer=variant==='stronger'?30:0;a.skills=[skill];
    if(variant==='held')a.casting={inst:skill,mode:'guard',aim:{...a.pos},remaining:5,total:5,shield:20,maxShield:30} as typeof a.casting;
    const inspect=()=>({mana:a.mana,absorb:a.absorb,absorbTimer:a.absorbTimer,guard:a.casting?{mode:a.casting.mode,shield:a.casting.shield,maxShield:a.casting.maxShield}:null});
    const initial=inspect(),preview=guardSurgePreview(a,skill,effect);w.executeSkill(a,skill,{...a.pos},{noRepeat:true,noCooldown:true});
    courses.push({variant,effect,initial,preview,expected:inspect()});
  }
  writeFileSync(process.argv[2],JSON.stringify({originalOnly:true,courses}));
}finally{restore();}
