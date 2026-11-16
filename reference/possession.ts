import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import {makeSkillInstance,skillContextTags,grantedTags,instanceMods,type SkillInstance} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {MONSTERS} from '../src/data/monsters';
import {STATUS_DEFS} from '../src/engine/status';
import {POSSESS_CFG,type PossessSpec,type EjectReason} from '../src/engine/possess';

const restore=seedGlobalRandom(0x4d3309),courses:unknown[]=[];
try{
  for(const reason of['press','duration','bodyDied','huskDying','huskPain','huskSeized','travel','released'] as EjectReason[]){
    const w=makeSimWorld('warrior',0x4d3309),hero=w.player,target=new Actor('body','enemy',{x:850,y:600});
    w.walk=null;w.actors=[hero,target];w.time=10;w.meta.modeId='immortal';hero.pos={x:800,y:600};
    target.defId='skeleton_warrior';target.sheet.setBase('life',100);target.life=40;target.faction='wild';
    hero.sheet.setBase('huskGuard',.2);hero.sheet.setBase('possessPower',.1);hero.sheet.setBase('possessDuration',1.5);
    const skill=makeSkillInstance(SKILLS.possession,1);hero.skills=[skill];
    const spec:PossessSpec={husk:reason==='travel'?'carried':'stands'};
    const seam=w as unknown as {possessSeize(a:Actor,i:SkillInstance,b:Actor,s:PossessSpec):void;updatePossessions(dt:number):void};
    const inspect=()=>JSON.parse(JSON.stringify({controller:{id:w.localSeat.id,actor:w.localSeat.actor.id,home:w.localSeat.home?.id},roster:w.actors.map(a=>a.id),
      bodies:[hero,target].map(a=>({id:a.id,life:a.life,dead:a.dead,pos:{...a.pos},radius:a.radius,team:a.team,kind:a.kind,skills:a.skills.map(s=>s?.def.id??null),
        statuses:a.statuses.map(s=>s.id),vacated:a.vacated,ride:a.possession,cooldowns:[...a.cooldowns],totals:[...a.cooldownTotals],
        sources:['possessed','vacated'].map(id=>[id,a.sheet.getSourceMods(id)]).filter(([,v])=>v!==undefined)}))}));
    const initial=inspect(),terms=Object.fromEntries(['possessPower','possessDuration','huskGuard'].map(stat=>[stat,hero.sheet.get(stat,skillContextTags(skill,grantedTags(skill)),instanceMods(skill))]));
    seam.possessSeize(hero,skill,target,spec);assert.equal(w.localSeat.actor,target);const entered=inspect();
    if(reason==='duration'){w.time=target.possession!.until!;seam.updatePossessions(.1);}
    else if(reason==='huskPain'){hero.life=hero.life-hero.maxLife()*POSSESS_CFG.endOn.huskLostFrac;seam.updatePossessions(.1);}
    else if(reason==='huskSeized'){hero.heldBy=999;seam.updatePossessions(.1);}
    else if(reason==='travel'){target.pos={x:900,y:650};seam.updatePossessions(.1);w.seatEject(w.localSeat,reason);}
    else w.seatEject(w.localSeat,reason);
    const def=MONSTERS[target.defId];
    courses.push({reason,spec,terms,maxLife:hero.maxLife(),initial,entered,time:w.time,final:inspect(),
      definition:{name:def.name,possessable:def.possessable,boss:def.boss,bossBar:def.bossBar,tags:def.tags}});
  }
  writeFileSync(process.argv[2],JSON.stringify({originalOnly:true,rules:POSSESS_CFG,stunDuration:STATUS_DEFS.stun.duration,courses}));
}finally{restore();}
