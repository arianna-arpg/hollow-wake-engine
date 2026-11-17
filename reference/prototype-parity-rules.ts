// Independent current-prototype observation. No SDK imports.
import fs from 'node:fs';
import {makeSimWorld} from '../src/sim/arena';
import {Actor,resetActorIdCounter} from '../src/engine/actor';
import {ATTRIBUTES} from '../src/engine/stats';
import {makeSkillInstance} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {SUPPORTS} from '../src/data/supports';
import {seedGlobalRandom} from '../src/sim/rng';

const specs=[
  {id:'timing-combined-early',skill:'firebolt',supports:['perfect_draw','wandering_mark'],fraction:.4},
  {id:'timing-combined-late',skill:'firebolt',supports:['perfect_draw','wandering_mark'],fraction:.76},
  {id:'trap-ground-crossing',skill:'frost_trap',cross:true},
  {id:'trap-airborne-crossing',skill:'frost_trap',cross:true,flying:true},
  {id:'mine-paid-duplicate-command',skill:'fire_mine',meta:true},
  {id:'warrior-rally-tactics',skill:'summon_skeleton',nodes:['grave_phalanx','barbed_lattice','interlocking_shields'],tactics:true},
  {id:'warrior-pairs-tactics',skill:'summon_skeleton',nodes:['ossuary_duelists','line_breakers','dueling_pairs'],tactics:true},
  {id:'golem-protect-command',skill:'summon_bone_golem',nodes:['keepers_bulwark','renewing_frame','adamant_frame'],tactics:true,meta:true},
];
const seed=7331,courses=[],restoreBoot=seedGlobalRandom(seed);
try{for(const spec of specs){
  const w=makeSimWorld('warrior',seed);resetActorIdCounter();
  const config={name:'Hero',team:'player',position:{x:400,y:400},controlled:true,
    stats:{life:10000,mana:100000,accuracy:100000,critChance:0,knockback:0},attributes:Object.fromEntries(Object.keys(ATTRIBUTES).map(id=>[id,100])),
    skills:[{id:spec.skill,level:20,treeNodes:spec.nodes??[],sockets:(spec.supports??[]).map(id=>({id,level:1}))}]};
  const target={name:'Target',team:'enemy',position:{x:spec.cross?800:500,y:400},flying:spec.flying??false,
    stats:{life:100000,mana:10000,evasion:0,armor:0,blockChance:0,moveSpeed:600,lifeRegen:0}};
  const make=(c:any)=>{const a=new Actor(c.name,c.team,c.position);if(c.controlled)a.kind='player';a.flying=c.flying??false;
    for(const[id,value]of Object.entries(c.stats))a.sheet.setBase(id,value as number);a.fillResources();
    a.skills=(c.skills??[]).map((s:any)=>{const i=makeSkillInstance(SKILLS[s.id],s.level);i.treeNodes=[...s.treeNodes];i.sockets=s.sockets.map((g:any)=>({def:SUPPORTS[g.id],level:g.level}));return i;});return a;};
  const actor=make(config),enemy=make(target);w.actors=[actor,enemy];w.localSeat.actor=actor;w.time=0;(w as any).indexSeats();
  w.meta.knownSkills=new Map(actor.skills.map(i=>[i!.def.id,i!]));w.meta.attrs=config.attributes as any;w.localSeat.lastActedAt=-999;
  const restore=seedGlobalRandom(seed),random=Math.random;let draws=0;Math.random=()=>{draws++;return random();};
  try{
    const inspect=()=>JSON.parse(JSON.stringify({time:w.time,draws,
      actors:w.actors.map(a=>({id:a.id,name:a.name,defId:a.defId??null,team:a.team,pos:{...a.pos},tier:a.tier,life:a.life,mana:a.mana,es:a.es,dead:a.dead,downed:a.downed,lifespan:a.lifespan??null,
        casting:a.casting?{id:a.casting.inst.def.id,mode:a.casting.mode,elapsed:a.casting.elapsed,total:a.casting.total}:null,
        cooldowns:[...a.cooldowns],charges:[...a.charges],statuses:a.statuses.map(s=>({id:s.id,remaining:s.remaining,dps:s.dps,stacks:s.stacks}))})),
      projectiles:w.projectiles.map(p=>({skill:p.inst.def.id,pos:{...p.pos},life:(p as any).life})),
      zones:w.zones.map(z=>({skill:z.inst.def.id,pos:{...z.pos},delay:z.delay,linger:z.linger,tick:z.tick,exploded:z.exploded})),corpses:w.corpses.map(c=>({pos:{...c.pos},remaining:c.remaining}))}));
    const steps:any[]=[],aim={x:480,y:400};
    const act=(action:any)=>{let accepted:any;
      if(action.type==='press')accepted=w.useSkill(actor,actor.skills[0]!,aim,true);
      else if(action.type==='meta')accepted=w.useMetaSkill(actor,actor.skills[0]!,aim);
      else if(action.type==='timing')w.castPress(actor);
      else if(action.type==='move')w.moveActor(enemy,action.direction.x,action.direction.y,action.seconds);
      else if(action.type==='tactics'){
        accepted=[];
        for(const a of w.actors){if(a.owner!==actor||a.dead)continue;let movement:any;
          const move=(p:any)=>{movement={...p};};
          const blocked=a.dead||a.downed||a.summonReform||a.channelFormation||a.frameCharging||a.frameState?.order||a.frameState?.terminal;
          const handled=!!(blocked||a.frameState&&w.frameArts.act(a,enemy,move)||a.cohortState&&w.cohortArts.act(a,enemy,action.seconds,move));
          accepted.push({id:a.id,handled,...(movement?{movement}:{})});
          if(movement)w.moveActor(a,movement.x-a.pos.x,movement.y-a.pos.y,action.seconds);
        }
      }else w.update(action.seconds);
      steps.push({action,...(accepted===undefined?{}:{accepted}),state:inspect()});
    };
    act({type:'press',skill:spec.skill,aim});
    if(spec.fraction){act({type:'advance',seconds:actor.casting!.total*spec.fraction});act({type:'timing'});}
    for(let n=0;n<180;n++)act({type:'advance',seconds:1/60});
    if(spec.cross){act({type:'move',direction:{x:-1,y:0},seconds:.8});act({type:'advance',seconds:1/60});}
    if(spec.meta){act({type:'meta',skill:spec.skill,aim});act({type:'meta',skill:spec.skill,aim});}
    for(let n=0;n<120;n++){if(spec.tactics)act({type:'tactics',seconds:1/60});act({type:'advance',seconds:1/60});}
    courses.push({id:spec.id,config,target,steps});
  }finally{restore();}
}}finally{restoreBoot();}
fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,originalOnly:true,seed,courses})+'\n',{flag:'wx'});
