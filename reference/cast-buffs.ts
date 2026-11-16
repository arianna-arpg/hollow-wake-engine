import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import {makeSkillInstance,type BuffEffect} from '../src/engine/skills';

const specs=[{}, {affects:'allies',radius:20}, {affects:'minions'},
  {affects:'minions',powerScaled:true}, {powerStacks:3}, {powerStacks:3,powerScaled:true}, {powerStacks:0,powerScaled:true}] as const;
const restore=seedGlobalRandom(0x4d3305),courses:unknown[]=[];
try{
  for(const spec of specs){
    const w=makeSimWorld('warrior',0x4d3305),caster=new Actor('buff-caster','ally',{x:800,y:600});
    w.walk=null;w.meta.modeId='immortal';caster.sheet.setBase('aoeRadius',1);caster.sheet.setBase('offeringShare',.4);caster.sheet.setBase('effectDuration',1.5);
    const traits=[{owner:true,x:400,tier:1},{owner:true,x:30,downed:true},{x:30},{x:30.1},{enemy:true,x:0},{x:0,dead:true}];
    const roster=traits.map((t,i)=>{const a=new Actor('buff-body-'+i,t.enemy?'enemy':'ally',{x:800+t.x,y:600});
      a.radius=10;if(t.owner)a.owner=caster;a.tier=t.tier??0;a.downed=!!t.downed;a.dead=!!t.dead;return a;});
    w.actors=[caster,...roster];
    const effect={type:'buff',id:'m3-blessing',duration:4,maxStacks:10,mods:[{stat:'damage',kind:'increased',value:2}],...spec} as BuffEffect;
    const skill=makeSkillInstance({id:'m3-blessing',name:'Blessing',description:'',tags:['spell'],color:'#fff',manaCost:0,useTime:0,cooldown:0,
      delivery:{type:'self'},effects:[effect],gauge:{need:1,bankMult:3,overflow:true}},1);skill.state={gaugePower:2.2};caster.skills=[skill];
    assert(w.executeSkill(caster,skill,{...caster.pos},{noRepeat:true,noCooldown:true,dmgMult:.25}));
    courses.push({effect,traits,expected:[caster,...roster].map(a=>({buffs:[...a.buffs],events:a.gainEvents}))});
  }
  writeFileSync(process.argv[2],JSON.stringify({originalOnly:true,courses}));
}finally{restore();}
