// Expected observations come exclusively from the newly pinned prototype.
import fs from 'node:fs';
import {makeSimWorld} from '../src/sim/arena';
import {Actor,resetActorIdCounter} from '../src/engine/actor';
import {ATTRIBUTES} from '../src/engine/stats';
import {makeSkillInstance} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {seedGlobalRandom} from '../src/sim/rng';

const specs = [
  {id:'archer-ordinary',nodes:['rattling_bows','rain_of_bones'],ticks:150},
  {id:'archer-held-full-release',nodes:['rattling_bows','ranked_bows','endless_quivers'],ticks:150},
  {id:'archer-held-early-release',nodes:['rattling_bows','ranked_bows','endless_quivers'],ticks:12},
  {id:'archer-invested-ranks',nodes:['rattling_bows','ranked_bows','rain_of_bones'],ticks:150,stats:{minionMaxCount:3}},
  {id:'archer-fast-ranks',nodes:['rattling_bows','ranked_bows','rain_of_bones'],ticks:80,stats:{castSpeed:2}},
];
const courses=[],seed=7331,restoreBoot=seedGlobalRandom(seed);
try {
  for(const spec of specs){
    const world=makeSimWorld('warrior',seed);resetActorIdCounter();
    const actor=new Actor('Hero','player',{x:400,y:400});actor.kind='player';
    const config={name:'Hero',team:'player',position:{x:400,y:400},controlled:true,
      stats:{life:10000,mana:100000,...spec.stats},attributes:Object.fromEntries(Object.keys(ATTRIBUTES).map(id=>[id,100])),
      skills:[{id:'summon_skeleton_archer',level:20,treeNodes:spec.nodes}]};
    for(const [id,value] of Object.entries(config.stats))actor.sheet.setBase(id,value);
    actor.fillResources();actor.skills=config.skills.map(s=>{const i=makeSkillInstance(SKILLS[s.id],s.level);i.treeNodes=[...s.treeNodes];return i;});
    world.actors=[actor];world.localSeat.actor=actor;world.time=0;(world as any).indexSeats();
    world.meta.knownSkills=new Map(actor.skills.map(i=>[i!.def.id,i!]));world.meta.attrs=config.attributes as any;world.localSeat.lastActedAt=-999;
    const restore=seedGlobalRandom(seed),random=Math.random;let draws=0;Math.random=()=>{draws++;return random();};
    try {
      const inspect=()=>JSON.parse(JSON.stringify({time:world.time,draws,
        actors:world.actors.map(a=>({id:a.id,name:a.name,defId:a.defId??null,team:a.team,pos:{...a.pos},tier:a.tier,
          life:a.life,mana:a.mana,es:a.es,dead:a.dead,downed:a.downed,lifespan:a.lifespan??null,
          casting:a.casting?{id:a.casting.inst.def.id,mode:a.casting.mode,elapsed:a.casting.elapsed,total:a.casting.total}:null,
          cooldowns:[...a.cooldowns],charges:[...a.charges],statuses:a.statuses.map(s=>({id:s.id,remaining:s.remaining,dps:s.dps,stacks:s.stacks}))})),
        projectiles:world.projectiles.map(p=>({skill:p.inst.def.id,pos:{...p.pos},life:(p as any).life})),
        zones:world.zones.map(z=>({skill:z.inst.def.id,pos:{...z.pos},delay:z.delay,linger:z.linger,tick:z.tick,exploded:z.exploded})),
        corpses:world.corpses.map(c=>({pos:{...c.pos},remaining:c.remaining}))}));
      const aim={x:800,y:400},accepted=world.useSkill(actor,actor.skills[0]!,aim,true),steps=[inspect()];
      for(let n=0;n<spec.ticks;n++){world.update(1/60);steps.push(inspect());}
      if(actor.casting)actor.casting.held=false;
      for(let n=0;n<3;n++){world.update(1/60);steps.push(inspect());}
      courses.push({id:spec.id,config,aim,ticks:spec.ticks,accepted,steps});
    } finally {restore();}
  }
} finally {restoreBoot();}
fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,originalOnly:true,seed,courses})+'\n',{flag:'wx'});
