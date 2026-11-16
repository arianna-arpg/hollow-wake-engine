import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom,mulberry32} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import {makeSkillInstance,type SkillEffect} from '../src/engine/skills';
import {COMMAND_CFG} from '../src/engine/ai';
import {THRONG_CFG} from '../src/engine/throng';

const specs=[{}, {affects:'squad'}, {affects:'both'}, {affects:'both',radius:100},
  {command:'recall',duration:1,markRadius:23}, {discipline:.8}, {discipline:-2}] as const;
const restore=seedGlobalRandom(0x4d3304),courses:unknown[]=[];
try{
  for(const spec of specs){
    const w=makeSimWorld('warrior',0x4d3304),caster=new Actor('commander','ally',{x:800,y:600});
    w.walk=null;w.meta.modeId='immortal';caster.squadId=9;caster.faction='m3';
    caster.sheet.setBase('commandDiscipline',.1);
    const traits=[{owner:true,x:20,obedience:1},{owner:true,x:40,obedience:.2},{owner:true,x:101,obedience:1},
      {squad:true,x:1200,obedience:1},{faction:true,x:640,obedience:1},{faction:true,x:641,obedience:1},
      {squad:true,x:0,passive:true,obedience:1},{enemy:true,x:15,obedience:1},{enemy:true,x:-15,obedience:1}];
    const roster=traits.map((t,i)=>{
      const a=new Actor('body-'+i,t.enemy?'enemy':'ally',{x:800+t.x,y:600});
      if(t.owner)a.owner=caster;if(t.squad)a.squadId=9;if(t.faction)a.faction='m3';a.passive=!!t.passive;
      a.aiObedience=t.obedience;a.throngCarried=true;a.aiTargetId=123;a.wanderDir=2;a.threat.set(123,7);return a;
    });
    w.actors=[caster,...roster];
    const effect={type:'commandMinions',...spec} as SkillEffect;
    const skill=makeSkillInstance({id:'m3-command',name:'Command',description:'',tags:['spell'],color:'#fff',
      manaCost:0,useTime:0,cooldown:0,delivery:{type:'self'},effects:[effect]},1);caster.skills=[skill];
    const aim={...caster.pos},random=mulberry32(42),draws:number[]=[],originalRandom=Math.random;
    Math.random=()=>{const v=random();draws.push(v);return v;};
    try{
      assert(w.executeSkill(caster,skill,aim,{noRepeat:true,noCooldown:true}));
      courses.push({spec,aim,casterId:caster.id,ids:roster.map(a=>a.id),traits,time:w.time,
        enemies:w.enemiesOf(caster).map(a=>a.id),draws,expected:roster.map(a=>({id:a.id,command:a.aiCommand,carried:a.throngCarried,
          target:a.aiTargetId,wander:a.wanderDir,threat:[...a.threat]}))});
    }finally{Math.random=originalRandom;}
  }
  writeFileSync(process.argv[2],JSON.stringify({originalOnly:true,rules:{...COMMAND_CFG,delegates:THRONG_CFG.metaDelegate},courses}));
}finally{restore();}
