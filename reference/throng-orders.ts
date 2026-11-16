import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import {makeSkillInstance} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {THRONG_CFG} from '../src/engine/throng';

const restore=seedGlobalRandom(0x4d3308),courses:unknown[]=[];
try{
  for(const skillId of['beckon_palewisps','raise_gnatveil'])for(const variant of['ordinary','diving','empty']){
    const w=makeSimWorld('warrior',0x4d3308),a=new Actor('keeper','player',{x:800,y:600});w.walk=null;w.time=10;w.meta.modeId='immortal';
    const skill=makeSkillInstance(SKILLS[skillId],1);a.skills=[skill];
    const bodies=Array.from({length:variant==='empty'?0:2},(_,i)=>{const body=new Actor('swarm-'+i,'player',{x:800,y:600});
      body.owner=a;body.sourceSkillId='__throng:'+skillId;body.throngCarried=true;if(variant==='diving'&&i===0)body.throngDive={x:850,y:650};
      body.aiTargetId=999;body.wanderDir=1;body.threat.set(999,5);return body;});
    const enemies=[new Actor('quarry','enemy',{x:810,y:600}),new Actor('tie','enemy',{x:790,y:600})];w.actors=[a,...bodies,...enemies];
    const seam=w as unknown as {liteKindOf(id:string):number;liteOrders:Map<number,unknown>};
    const kind=skill.def.throng?.tier==='lite'?seam.liteKindOf(skill.def.throng.monsterId):-1;
    assert(w.executeSkill(a,skill,{x:800,y:600},{noRepeat:true,noCooldown:true}));
    courses.push({skillId,spec:skill.def.throng,variant,casterId:a.id,ids:bodies.map(b=>b.id),quarryId:enemies[0].id,kind,
      expected:bodies.map(b=>({order:b.aiCommand,carried:b.throngCarried,dive:b.throngDive,target:b.aiTargetId,wander:b.wanderDir,threat:[...b.threat]})),
      pooled:kind>=0?seam.liteOrders.get(a.id*256+kind):undefined});
  }
  writeFileSync(process.argv[2],JSON.stringify({originalOnly:true,rules:THRONG_CFG.direct,courses}));
}finally{restore();}
