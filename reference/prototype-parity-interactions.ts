// New-source interaction observations. This file imports no SDK implementation.
import fs from 'node:fs';
import {makeSimWorld} from '../src/sim/arena';
import {Actor,resetActorIdCounter} from '../src/engine/actor';
import {ATTRIBUTES} from '../src/engine/stats';
import {makeSkillInstance} from '../src/engine/skills';
import {SKILLS} from '../src/data/skills';
import {seedGlobalRandom} from '../src/sim/rng';

const specs=[
  {id:'firebolt-ordinary',skill:'firebolt',nodes:[]},
  {id:'firebolt-orbit',skill:'firebolt',nodes:['ember_satellites','dense_constellation','broad_embers']},
  {id:'firebolt-searing',skill:'firebolt',nodes:['ember_satellites','searing_orbit','clinging_cinders']},
  {id:'firebolt-pyreheart',skill:'firebolt',nodes:['cinder_lance','white_heat','focused_flame']},
  {id:'firebolt-comet',skill:'firebolt',nodes:['cinder_lance','slow_combustion','far_flight']},
  {id:'archer-rattling',skill:'summon_skeleton_archer',nodes:['rattling_bows','ranked_bows','endless_quivers']},
  {id:'mage-regent',skill:'summon_skeleton_mage',nodes:['lich_ascendant','deathless_regent','plague_crown']},
  {id:'mage-conclave',skill:'summon_skeleton_mage',nodes:['grave_academy','winter_curriculum','deep_winter']},
  {id:'warrior-shields',skill:'summon_skeleton',nodes:['grave_phalanx','barbed_lattice','interlocking_shields']},
  {id:'warrior-pairs',skill:'summon_skeleton',nodes:['ossuary_duelists','line_breakers','dueling_pairs']},
  {id:'golem-sacrifice',skill:'summon_bone_golem',nodes:['osseous_might','drilled_bones','bone_cohort']},
  {id:'golem-reliquary',skill:'summon_bone_golem',nodes:['keepers_bulwark','renewing_frame','adamant_frame']},
];
const seed=7331,courses=[],restoreBoot=seedGlobalRandom(seed);
try {for(const spec of specs){
  const w=makeSimWorld('warrior',seed);resetActorIdCounter();
  const config={name:'Hero',team:'player',position:{x:400,y:400},controlled:true,
    stats:{life:10000,mana:100000,accuracy:100000,critChance:0,knockback:0},attributes:Object.fromEntries(Object.keys(ATTRIBUTES).map(id=>[id,100])),
    skills:[{id:spec.skill,level:20,treeNodes:spec.nodes}]};
  const target={name:'Target',team:'enemy',position:{x:500,y:400},stats:{life:100000,mana:10000,evasion:0,armor:0,blockChance:0,moveSpeed:0,lifeRegen:0}};
  const make=(c:any)=>{const a=new Actor(c.name,c.team,c.position);if(c.controlled)a.kind='player';
    for(const[id,value]of Object.entries(c.stats))a.sheet.setBase(id,value as number);a.fillResources();
    a.skills=(c.skills??[]).map((s:any)=>{const i=makeSkillInstance(SKILLS[s.id],s.level);i.treeNodes=[...s.treeNodes];return i;});return a;};
  const actor=make(config),enemy=make(target);w.actors=[actor,enemy];w.localSeat.actor=actor;w.time=0;(w as any).indexSeats();
  w.meta.knownSkills=new Map(actor.skills.map(i=>[i!.def.id,i!]));w.meta.attrs=config.attributes as any;w.localSeat.lastActedAt=-999;
  const restore=seedGlobalRandom(seed),random=Math.random;let draws=0;Math.random=()=>{draws++;return random();};
  try {
    const inspect=()=>JSON.parse(JSON.stringify({time:w.time,draws,
      actors:w.actors.map(a=>({id:a.id,name:a.name,defId:a.defId??null,team:a.team,pos:{...a.pos},tier:a.tier,
        life:a.life,mana:a.mana,es:a.es,dead:a.dead,downed:a.downed,lifespan:a.lifespan??null,
        casting:a.casting?{id:a.casting.inst.def.id,mode:a.casting.mode,elapsed:a.casting.elapsed,total:a.casting.total}:null,
        cooldowns:[...a.cooldowns],charges:[...a.charges],statuses:a.statuses.map(s=>({id:s.id,remaining:s.remaining,dps:s.dps,stacks:s.stacks}))})),
      projectiles:w.projectiles.map(p=>({skill:p.inst.def.id,pos:{...p.pos},life:(p as any).life})),
      zones:w.zones.map(z=>({skill:z.inst.def.id,pos:{...z.pos},delay:z.delay,linger:z.linger,tick:z.tick,exploded:z.exploded})),
      corpses:w.corpses.map(c=>({pos:{...c.pos},remaining:c.remaining}))}));
    const aim={...enemy.pos},actions:any[]=[{type:'press',skill:spec.skill,aim}];
    for(let n=0;n<180;n++)actions.push({type:'advance',seconds:1/60});
    actions.push({type:'release'},{type:'press',skill:spec.skill,aim});
    for(let n=0;n<240;n++)actions.push({type:'advance',seconds:1/60});
    actions.push({type:'release'});
    for(let n=0;n<30;n++)actions.push({type:'advance',seconds:1/60});
    const steps=actions.map(action=>{let accepted:boolean|undefined;
      if(action.type==='press')accepted=w.useSkill(actor,actor.skills.find(i=>i?.def.id===action.skill)!,action.aim,true);
      else if(action.type==='release'){if(actor.casting)actor.casting.held=false;}
      else w.update(action.seconds);
      return {action,...(accepted===undefined?{}:{accepted}),state:inspect()};});
    courses.push({id:spec.id,config,target,steps});
  } finally {restore();}
}}finally {restoreBoot();}
fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,originalOnly:true,seed,courses})+'\n',{flag:'wx'});
