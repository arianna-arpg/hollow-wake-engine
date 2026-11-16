// Observe original methods and original actor timer phases; no SDK imports.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom,mulberry32} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import {makeSkillInstance,type SkillEffect} from '../src/engine/skills';

const base={life:100,mana:80,energyShield:50,critChance:.4,critMulti:2,healPower:1.2,healTaken:.75,wardGain:1,absorbPower:1,
  restorePower:1.1,effectDuration:.8,restorePctMax:.1,pourPct_surge:.02,pourPct_settle:.03,
  pourPower_surge:1.2,pourPower_settle:1.1,overheal:.8,chainCount:0,wardDecay:.1,
  lifeRegen:0,lifeRegenPct:0,manaRegen:0,manaRegenPct:0,lifeRegenToEs:0};
const recipes=[
  {name:'life-stream',effects:[{type:'restoreOverTime',resource:'life',amount:40,duration:2}]},
  {name:'mana-stream',effects:[{type:'restoreOverTime',resource:'mana',amount:40,duration:2,amountPerLevel:2,perCharge:true}]},
  {name:'shield-stream',effects:[{type:'restoreOverTime',resource:'es',amount:40,duration:2,amountPctMax:.1}]},
  {name:'paired-pour',effects:[{type:'restoreOverTime',resource:'life',amount:0,duration:.1,amountPctMax:.05,lane:'surge'},
    {type:'restoreOverTime',resource:'life',amount:15,duration:3,amountPerLevel:3,lane:'settle'}]},
  {name:'self-heal',effects:[{type:'heal',amount:40,pctMax:.1}]},
  {name:'excluded-self',effects:[{type:'heal',amount:40,excludeCaster:true}]},
  {name:'absorb',effects:[{type:'absorb',amount:30,duration:3}]},
  {name:'ward',effects:[{type:'ward',amount:30,perCharge:true}]},
  {name:'overmend',life:100,effects:[{type:'restoreOverTime',resource:'life',amount:80,duration:2}]},
  {name:'mixed-order',life:95,effects:[{type:'heal',amount:40},{type:'absorb',amount:10,duration:2},{type:'ward',amount:20},
    {type:'restoreOverTime',resource:'mana',amount:20,duration:2},{type:'restoreOverTime',resource:'life',amount:50,duration:2}]},
];
const restore=seedGlobalRandom(0x4d3302),courses:unknown[]=[];
try {
  for(const recipe of recipes){
    const w=makeSimWorld('warrior',0x4d3302),a=new Actor('recovery','ally',{x:0,y:0});
    w.walk=null;w.actors=[a];w.meta.modeId='immortal';
    for(const[key,value]of Object.entries(base))a.sheet.setBase(key,value);
    a.life=recipe.life??60;a.mana=20;a.es=10;a.esDelay=1000;a.absorb=5;a.absorbTimer=1;a.ward=0;
    const effects=recipe.effects as SkillEffect[];
    const skill=makeSkillInstance({id:'m3-'+recipe.name,name:recipe.name,description:'recovery reference',tags:['spell'],color:'#fff',
      manaCost:0,useTime:0,cooldown:0,delivery:{type:'self'},effects},4);
    a.skills=[skill];
    const inspect=()=>JSON.parse(JSON.stringify({life:a.life,mana:a.mana,es:a.es,absorb:a.absorb,absorbTimer:a.absorbTimer,ward:a.ward,
      streams:a.restoreStreams,events:a.gainEvents}));
    const originalRandom=Math.random,random=mulberry32(19),draws:number[]=[];
    Math.random=()=>{const n=random();draws.push(n);return n;};
    try{
      const initial=inspect(),steps:unknown[]=[];
      assert(w.executeSkill(a,skill,{...a.pos},{noRepeat:true,noCooldown:true,chargesSpent:2}));
      const afterCast=inspect(),castDraws=[...draws];
      for(const dt of [.1,.4,1,4]){a.updateTimers(dt);steps.push({dt,expected:inspect(),draws:[...draws]});}
      courses.push({name:recipe.name,stats:base,effects,initial,afterCast,castDraws,steps});
    }finally{Math.random=originalRandom;}
  }
  writeFileSync(process.argv[2],JSON.stringify({originalOnly:true,courses}));
}finally{restore();}
